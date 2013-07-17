/*global console process require setInterval module*/

// Imports and globals.
var    http = require("http"),
        url = require("url"),
        net = require("net"),
      dgram = require("dgram"),
        osc = require("./osc"),
         ac = require("./client"),
        AcequiaMessage = require("./msg").AcequiaMessage,
       tuio = require("./tuio"),
     Buffer = require('buffer').Buffer,
    express = require("express"),
  datastore = require("./datastore"),
  objCallback = require("./utils").objCallback,
  uid = require("./utils").uid;

require('buffertools');

Object.extend = function (destination, source) {
    for (var property in source) {
        destination[property] = source[property];
    }
    return destination;
};
  
// Create a logger
var logger = require('log4js').getLogger("acequia");

var acequiaClients = null;

function AcequiaServer(options) {

    this.options = Object.extend({
        ipAddress: "0.0.0.0"
        , oscPort: 9090
        , wsPort: 9091
        , tcpPort: 9092
        , timeout: 600000
        , express_app: null
        , httpServer: null
        , minify_client: true
        , enableDiscovery: true
    }, options || {});
    
    this.acequiaClients = new ac.AcequiaClients(this.options.timeout * 1000);
    
    datastore.init(this);
    
    // Set the global value:
    acequiaClients = this.acequiaClients;
    
    this.oscServer = null;
    this.wsServer  = null;
    this.tcpServer = null;
    
    this.tcp_ad = null;
    this.osc_ad = null;
}

/**
 * Creates a server-side listener for a particular message.
 * @param {String} evt The message to listen for.
 * @param {Function} callback The message handler
 */
AcequiaServer.prototype.on = function (evt, callback) {
    ac.msgEmitter.addListener(evt, callback);
};

/**
 * Sends a message.
 * @param {String} from The name of who the message is from
 * @param {String} name The name of the message
 * @param {Object} body The body of the message
 * @param {String} to The desitnation of the message
 */
AcequiaServer.prototype.send = function (from, name, body, to) {
    var message = new AcequiaMessage(from, name, body, to);
    if (message.to) {
        this.acequiaClients.sendTo(message);
    } else {
        this.acequiaClients.broadcast(message);
    }
};

/**
 * Starts the acequia server.
 */
AcequiaServer.prototype.start = function () {
    if (this.options.oscPort) {
        this.oscServer = this.createOSCServer();
    }
    
    if (this.options.wsPort) {
        this.wsServer = this.createWSServer();        
    }
    
    if (this.options.tcpPort) {
        this.tcpServer = this.createTCPServer();
    }
};

/**
 * Broadcasts a Bonjour advertisement for the UDP server
 * @param {Number} port The port that the UDP is serving on.
 */
AcequiaServer.prototype.broadcastUDP = function (port) {
    if (!this.options.enableDiscovery) {
        return;
    }

    try {
        var mdns = require("mdns");
        this.osc_ad = mdns.createAdvertisement(mdns.udp('acequia', 'osc'), port, 
                                               {name: "Acequia OSC Server"});
        this.osc_ad.start();
    } catch (e) {
        logger.error("Error creating mDNS advertisement: " + e.message);
    }
};

/**
 * Broadcasts a Bonjour advertisement for the TCP server
 * @param {Number} port The port that the TCP is serving on.
 */
AcequiaServer.prototype.broadcastTCP = function (port) {
    if (!this.options.enableDiscovery) {
        return;
    }

    try {
        var mdns = require("mdns");
        this.tcp_ad = mdns.createAdvertisement(mdns.tcp('acequia'), port, 
                                               {name: "Acequia TCP Server"});
        this.tcp_ad.start();
    } catch (e) {
        logger.error("Error creating mDNS advertisement: " + e.message);
    }
};

/**
 * Creates an instance of an OSC server
 * @return the instance of an OSC server
 */
AcequiaServer.prototype.createOSCServer = function () {
    var oscServer = dgram.createSocket("udp4"),
    listeningCallback = objCallback(this, "broadcastUDP");

    // TODO:  We need to implement connect/disconnct/subscribe messages for osc
    oscServer.on("message", function (data, rinfo) {
        var oscMsgs = osc.bufferToOsc(data),  oscMsg, i, message;
        
        for (i = 0; i < oscMsgs.length; i += 1) {
            oscMsg = oscMsgs[i];

            if (oscMsg.address.indexOf("/tuio") === 0) {
                message = tuio.toAcequiaMessage(oscMsg);
            } else {
                message = new AcequiaMessage("", oscMsg.address, oscMsg.data);
            }
            
            acequiaClients.onOSCMessage(message, oscServer, rinfo);
        }
    });

    oscServer.on("listening", function () {
        logger.debug("OSC Server is listening on [%s:%s]", oscServer.address().address, oscServer.address().port);
        listeningCallback(oscServer.address().port);
    });

    oscServer.on("close", function () {
        logger.debug("oscServer closed");
    });
    
    oscServer.bind(this.options.oscPort, this.options.ipAddress);
    
    return oscServer;
};

/**
 * Creates a TCP server
 * @return and instance of the TCP server
 */
AcequiaServer.prototype.createTCPServer = function () {
    var HEADER_SIZE = 4,
        accum = new Buffer(0),
        waitingFor = HEADER_SIZE,
        listeningCallback, tcpServer;
    
    listeningCallback = objCallback(this, "broadcastTCP");

    tcpServer = net.createServer(function (socket) {
        
        socket.on("connect", function () {
            // Assign a UUID to this socket.  This is used to remove the client from acequia's
            // list of clients
            socket.uid = uid();
            logger.debug("TCP: [%s:%s:%s] connect", socket.remoteAddress, socket.remotePort, socket.uid);
        });
        
        socket.on("data", function (data) {
            var index = 0, msgs = [], size, message,
            buffer = new Buffer(data);
            
            while (buffer.length) {
                if (buffer.length + accum.length < waitingFor) {
                    accum = accum.concat(buffer);
                    buffer = new Buffer(0);
                } else if (waitingFor === HEADER_SIZE) {
                    waitingFor = buffer.readInt32BE(index);
                    buffer = buffer.slice(HEADER_SIZE);
                } else {
                    message = accum.concat(buffer.slice(0, waitingFor - accum.length));
                    msgs.push(new AcequiaMessage(JSON.parse(message)));
                    buffer = buffer.slice(waitingFor - accum.length);
                    accum = new Buffer(0);
                    waitingFor = HEADER_SIZE;
                }
            }
            
            for (index = 0; index < msgs.length; index += 1) {
                acequiaClients.onTCPMessage(msgs[index], socket);
            }
        });

        socket.on("end", function () {
            logger.debug("TCP: [%s:%s:%s] end", socket.remoteAddress, socket.remotePort, socket.uid);
            acequiaClients.findAndRemove(ac.TYP_TCP, socket.uid, "socket.on.end");
        });

        socket.on("close", function (had_error) {
            logger.debug("TCP: [%s:%s:%s] close", socket.remoteAddress, socket.remotePort, socket.uid);
            acequiaClients.findAndRemove(ac.TYP_TCP, socket.uid, "socket.on.close");
        });

        socket.on("error", function (exception) {
            logger.debug("TCP: [%s:%s] error %s", socket.remoteAddress, socket.remotePort, exception);
            socket.destroy();
        });
    });

    tcpServer.on("listening", function () {
        logger.debug("TCP Server is listening on [%s:%s]", tcpServer.address().address, tcpServer.address().port);
        listeningCallback(tcpServer.address().port);
    });

    tcpServer.listen(this.options.tcpPort, this.options.ipAddress);
    
    return tcpServer;
};

/**
 * Creates a socket.io server with which to communicate with web clients.
 * @return the socket.io server
 */
AcequiaServer.prototype.createWSServer = function () {
    var clientCode, io, app;

    if (!clientCode) {
        // Generate the client code
        clientCode = require("./genclient").generateClientCode();
    }
    
    if (!this.options.express_app) {
        this.options.express_app = express();
        // this.options.express_app.listen(this.options.wsPort);
    }
    if (!this.options.httpServer) {
        this.options.httpServer = http.createServer(this.options.express_app);
        this.options.httpServer.listen(this.options.wsPort);
    }
    app = this.options.express_app;
    httpServer = this.options.httpServer;
    
    // Add the acequiaServer instance to the web app, so it has acess to its
    // options
    app.acequiaServer = this;
  
    app.configure(function () {
        app.use(express.methodOverride());
        app.use(express.bodyParser());
        app.use(app.router);
    });
    
    app.all('*', function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.header('Access-Control-Allow-Credentials', true);
        res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
        next();
    });
     
    app.get('/acequia/*', function (req, res) {
        var pathName = url.parse(req.url, true).pathname,
        
        serveClientCode = function (out) {
            res.header('Content-Type', 'text/javascript');
            res.send(out);        
        };
        
        if (pathName === "/acequia/acequia.js") {
            if (app.acequiaServer.options.minify_client) {
                serveClientCode(clientCode.minified);
            } else {
                serveClientCode(clientCode.full);
            }
        } else {
            res.statusCode = 404;
            res.send("Page Not Found:" + req.url);
        }
    });
    
    app.get('/datastore', function (req, res) {
        res.send('datastore API is running');
    });
    
    // Set up the routing for the REST interface
    app.get("/datastore/*",  objCallback(datastore.REST, "get"));
    app.put("/datastore/*",  objCallback(datastore.REST, "put"));
    app.post("/datastore/*", objCallback(datastore.REST, "post"));
    app.del("/datastore/*",  objCallback(datastore.REST, "del"));
    
    app.on("listening", function (data) {
        logger.debug(" WS Server is listening on [%s:%s]", this.address().address, this.address().port); 
    });

    io = require('socket.io').listen(httpServer);

    io.configure(function () {
        io.enable('browser client minification');  // send minified client
        io.enable('browser client etag');          // apply etag caching logic based on version number
        io.enable('browser client gzip');          // gzip the file
        io.set('log level', 1);                    // reduce logging
        io.set('transports', [                     // enable all transports (optional if you want flashsocket)
            'websocket',
            'flashsocket',
            'htmlfile',
            'xhr-polling',
            'jsonp-polling'
        ]);
    });
    
    io.sockets.on('connection', function (socket) {
        
        logger.debug(socket.id + " Connected");
        
        socket.on('message', function (data) {
            var message = new AcequiaMessage(JSON.parse(data));
            acequiaClients.onWSMessage(message, socket);
        });

        socket.on("disconnect", function () {
            acequiaClients.findAndRemove(ac.TYP_WS, this.id, "connection closed");
        });
    });
    
    return io;
};


/**
 * Export used to create an instance of the acequia server
 */
module.exports.createServer = function (options) {
    return new AcequiaServer(options);
};
