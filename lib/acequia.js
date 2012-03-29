/*global console process require setInterval*/

// Imports and globals.
var    http = require("http"),
        url = require("url"),
        net = require("net"),
      dgram = require("dgram"),
        osc = require("./osc"),
         ac = require("./client"),
        msg = require("./msg"),
       tuio = require("./tuio"),
     Buffer = require('buffer').Buffer,
  genclient = require("./genclient");

var INTERNAL_IP = "0.0.0.0",
    OSC_PORT    = 9090,
    WS_PORT     = 9091,
    TCP_PORT    = 9092,
    TIMEOUT     = 600000; // Seconds before kicking idle clients.

var tcp_ad, osc_ad, ws_ad;

var isWindows = !!require("os").platform().match(/^win/);

// The list of clients
var clients = new ac.AcequiaClients(TIMEOUT * 1000);

// Initialize the datastore
require("./datastore").init(clients);

var oscServer, wsServer, tcpServer, httpServer, clientCode = null;

// Create a logger
var logger = require('log4js-node').getLogger("acequia");

// Once we actually get our internal IP, we start the servers.
function startServers() {

    oscServer = dgram.createSocket("udp4");

    // TODO:  We need to implement connect/disconnct/subscribe messages for osc
    oscServer.on("message", function (data, rinfo) {
        var oscMsgs = osc.bufferToOsc(data),  oscMsg, i, message;
        
        for (i = 0; i < oscMsgs.length; i += 1) {
            oscMsg = oscMsgs[i];

            if (oscMsg.address.indexOf("/tuio") === 0) {
                message = tuio.toAcequiaMessage(oscMsg);
            } else {
                message = new msg.AcequiaMessage("", oscMsg.address, oscMsg.data);
            }
            
            clients.onMessage(ac.TYP_OSC, message, oscServer, rinfo);
        }
    });

    oscServer.on("listening", function () {
        logger.debug("OSC Server is listening on [%s:%s]", oscServer.address().address, oscServer.address().port);

        if (!isWindows) {
            var mdns = require("mdns"),
            osc_ad = mdns.createAdvertisement(mdns.udp('acequia', 'osc'), oscServer.address().port, {name: "Acequia OSC Server"});
            osc_ad.start();
        }
    });

    oscServer.on("close", function () {
        logger.debug("oscServer closed");
    });
    
    oscServer.bind(OSC_PORT, INTERNAL_IP);

    // Websocket server:
    
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
    
    httpServer.listen(WS_PORT);

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
            var message = new msg.AcequiaMessage(JSON.parse(data));
            clients.onMessage(ac.TYP_WS, message, socket);
        });

        socket.on("disconnect", function () {
            clients.findAndRemove(ac.TYP_WS, this.id, "connection closed");
        });
    });

    // Setup a tcp server
    tcpServer = net.createServer(function (socket) {
        
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
                msgs.push(new msg.AcequiaMessage(JSON.parse(message)));
                index += size;
            }
            
            for (index = 0; index < msgs.length; index += 1) {
                clients.onMessage(ac.TYP_TCP, msgs[index], socket);
            }
        });

        socket.on("end", function () {
            logger.debug("TCP: [%s:%s] end", socket.remoteAddress, socket.remotePort);
            clients.findAndRemove(ac.TYP_TCP, socket.remoteAddress, socket.remotePort, "socket.on.end");
        });

        socket.on("close", function (had_error) {
            logger.debug("TCP: [%s:%s] close", socket.remoteAddress, socket.remotePort);
            clients.findAndRemove(ac.TYP_TCP, socket.remoteAddress, socket.remotePort, "socket.on.close");
        });

        socket.on("error", function (exception) {
            logger.debug("TCP: [%s:%s] error %s", socket.remoteAddress, socket.remotePort, exception);
            socket.destroy();
        });
    });
    
    tcpServer.on("listening", function () {
        logger.debug("TCP Server is listening on [%s:%s]", tcpServer.address().address, tcpServer.address().port);

        if (!isWindows) {
            var mdns = require("mdns");
            tcp_ad = mdns.createAdvertisement(mdns.tcp('acequia'), tcpServer.address().port, {name: "Acequia TCP Server"});
            tcp_ad.start();
        }
    });

    tcpServer.listen(TCP_PORT, INTERNAL_IP);
}

// The exported function is called to start the server.  
// It starts a server for each individual protocol.
function start() {
    var args = process.argv.splice(2),
    index = 0;
    
    while (index < args.length) {
        switch (args[index]) {
        case "--ip":
            index += 1;
            INTERNAL_IP = args[index];
            break;
        case "--osc":
            index += 1;
            OSC_PORT = parseInt(args[index], 10);
            break;
        case "--tcp":
            index += 1;
            TCP_PORT = parseInt(args[index], 10);
            break;
        case "--ws":
            index += 1;
            WS_PORT = parseInt(args[index], 10);
            break;
        }
        index += 1;
    }
    
    console.log("Platform: %s", require("os").platform());
    
    startServers();
}

start();
