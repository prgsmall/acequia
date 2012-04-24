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
  genclient = require("./genclient");

Object.extend = function (destination, source) {
    for (var property in source) {
        destination[property] = source[property];
    }
    return destination;
};
  
var tcp_ad, osc_ad, ws_ad;

// Create a logger
var logger = require('log4js').getLogger("acequia");

var acequiaClients = null;

function AcequiaServer(options) {

    this.options = Object.extend({
        ipAddress: "0.0.0.0",
        oscPort: 9090,
        wsPort: 9091,
        tcpPort: 9092,
        timeout: 600000,
        datastore: true
    }, options || {});
    
    this.acequiaClients = new ac.AcequiaClients(this.options.timeout * 1000);
    
    if (this.options.datastore) {
        require("./datastore").init(this);
    }
    
    // Set the global value:
    acequiaClients = this.acequiaClients;
    
    this.oscServer = null;
    this.wsServer  = null;
    this.tcpServer = null;
}

AcequiaServer.prototype.on = function (evt, callback) {
    ac.msgEmitter.addListener(evt, callback);
};

AcequiaServer.prototype.send = function (from, name, body, to) {
    var message = new AcequiaMessage(from, name, body, to);
    if (message.to) {
        this.acequiaClients.sendTo(message);
    } else {
        this.acequiaClients.broadcast(message);
    }
};

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

AcequiaServer.prototype.createOSCServer = function () {
    var oscServer = dgram.createSocket("udp4");

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
            
            acequiaClients.onMessage(ac.TYP_OSC, message, oscServer, rinfo);
        }
    });

    oscServer.on("listening", function () {
        logger.debug("OSC Server is listening on [%s:%s]", oscServer.address().address, oscServer.address().port);

        try {
            var mdns = require("mdns"),
            osc_ad = mdns.createAdvertisement(mdns.udp('acequia', 'osc'), oscServer.address().port, {name: "Acequia OSC Server"});
            osc_ad.start();
        } catch (e) {
            logger.error("Error creating mDNS advertisement: " + e.message);
        }
    });

    oscServer.on("close", function () {
        logger.debug("oscServer closed");
    });
    
    oscServer.bind(this.options.oscPort, this.options.ipAddress);
    
    return oscServer;
};

AcequiaServer.prototype.createTCPServer = function () {
    // Setup a tcp server
    var tcpServer = net.createServer(function (socket) {
        
        socket.on("connect", function () {
            logger.debug("TCP: [%s:%s] connect", socket.remoteAddress, socket.remotePort);
        });
        
        socket.on("data", function (data) {
            var index = 0, msgs = [], size, message,
            buffer = new Buffer(data);
            
            while (index < buffer.length) {
                size = buffer.readInt32BE(index);
                index += 4;
                message = buffer.slice(index, index + size);
                msgs.push(new AcequiaMessage(JSON.parse(message)));
                index += size;
            }
            
            for (index = 0; index < msgs.length; index += 1) {
                acequiaClients.onMessage(ac.TYP_TCP, msgs[index], socket);
            }
        });

        socket.on("end", function () {
            logger.debug("TCP: [%s:%s] end", socket.remoteAddress, socket.remotePort);
            acequiaClients.findAndRemove(ac.TYP_TCP, socket.remoteAddress, socket.remotePort, "socket.on.end");
        });

        socket.on("close", function (had_error) {
            logger.debug("TCP: [%s:%s] close", socket.remoteAddress, socket.remotePort);
            acequiaClients.findAndRemove(ac.TYP_TCP, socket.remoteAddress, socket.remotePort, "socket.on.close");
        });

        socket.on("error", function (exception) {
            logger.debug("TCP: [%s:%s] error %s", socket.remoteAddress, socket.remotePort, exception);
            socket.destroy();
        });
    });

    tcpServer.on("listening", function () {
        logger.debug("TCP Server is listening on [%s:%s]", tcpServer.address().address, tcpServer.address().port);

        try {
            var mdns = require("mdns");
            tcp_ad = mdns.createAdvertisement(mdns.tcp('acequia'), tcpServer.address().port, {name: "Acequia TCP Server"});
            tcp_ad.start();
        } catch (e) {
            logger.error("Error creating mDNS advertisement: " + e.message);
        }
    });

    tcpServer.listen(this.options.tcpPort, this.options.ipAddress);
    
    return tcpServer;
};

AcequiaServer.prototype.createWSServer = function () {
    var clientCode, httpServer, wsServer;
    
    if (!clientCode) {
        // Generate the client code
        clientCode = genclient.generateClientCode();
    }
    
    httpServer = http.createServer(function (req, res) {
        var pathName = url.parse(req.url, true).pathname,
        
        serveClientCode = function (out) {
            res.writeHead(200, { 'Content-Type': 'text/javascript' });
            res.end(out);        
        };
        
        logger.trace("HTTP server received " + req.url);
        
        if (pathName === "/acequia/acequia.js") {
            serveClientCode(clientCode.full);
        } else if (pathName === "/acequia/acequia.min.js") {
            serveClientCode(clientCode.minified);
        }
    });
    
    httpServer.on("listening", function (data) {
        logger.debug(" WS Server is listening on [%s:%s]", this.address().address, this.address().port); 
    });
    
    httpServer.listen(this.options.wsPort);

    // Create the socket io server and attach it to the httpServer
    wsServer = require('socket.io').listen(httpServer);

    wsServer.configure(function () {
        wsServer.enable('browser client minification');  // send minified client
        wsServer.enable('browser client etag');          // apply etag caching logic based on version number
        wsServer.enable('browser client gzip');          // gzip the file
        wsServer.set('log level', 1);                    // reduce logging
        wsServer.set('transports', [                     // enable all transports (optional if you want flashsocket)
            'websocket',
            'flashsocket',
            'htmlfile',
            'xhr-polling',
            'jsonp-polling'
        ]);
    });
    
    wsServer.sockets.on('connection', function (socket) {
        
        logger.debug(socket.id + " Connected");
        
        socket.on('message', function (data) {
            var message = new AcequiaMessage(JSON.parse(data));
            acequiaClients.onMessage(ac.TYP_WS, message, socket);
        });

        socket.on("disconnect", function () {
            acequiaClients.findAndRemove(ac.TYP_WS, this.id, "connection closed");
        });
    });
    
    return wsServer;
};


module.exports.createServer = function (options) {
    return new AcequiaServer(options);
};
