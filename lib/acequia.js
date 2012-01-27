/*global console process require setInterval*/

// Imports and globals.
var http = require("http"),
    url = require("url"),
    net = require("net"),
    io = require('socket.io'),
    log4js = require('log4js-node'),
    dgram = require("dgram"),
    osc = require("./osc"),
    ac = require("./client"),
    msg = require("./msg"),
    tuio = require("./tuio"),
    Buffer = require('buffer').Buffer,
    mdns = require("mdns"),
    genclient = require("./genclient");

var INTERNAL_IP = "0.0.0.0",
    OSC_PORT    = 9090,
    WS_PORT     = 9091,
    TCP_PORT    = 9092,
    TIMEOUT     = 600000; // Seconds before kicking idle clients.

var tcp_ad, osc_ad;

// The list of clients
var clients = new ac.AcequiaClients(TIMEOUT * 1000);

// Initialize the datastore
require("./datastore").init(clients);

var oscServer, wsServer, tcpServer, httpServer, clientCode = null;

var logger = log4js.getLogger("acequia");

// Kicks any clients who we have not heard from for a while.
function kickIdle() {
    clients.clearExpired();
}

// Once we actually get our internal IP, we start the servers.
function startServers() {
    var i, from, title, tt, client, portOut, clientList;

    oscServer = dgram.createSocket("udp4");

    oscServer.on("message", function (data, rinfo) {
        var cli, oscMsgs = osc.bufferToOsc(data),  oscMsg, i, message;
        
        for (i = 0; i < oscMsgs.length; i += 1) {
            oscMsg = oscMsgs[i];
            logger.trace("OSC:" + oscMsg);
            if (oscMsg.address.indexOf("/tuio") === 0) {
                message = tuio.toAcequiaMessage(oscMsg);
            } else {
                message = new msg.AcequiaMessage("", oscMsg.address, oscMsg.data);
            }
            
            logger.debug(message.toString());
            
            clients.onMessage(ac.TYP_OSC, message, oscServer, rinfo);
        }
    });

    oscServer.on("listening", function () {
        logger.debug("OSC Server is listening on %j", oscServer.address());

        // Broadcast the presence of this server
        osc_ad = mdns.createAdvertisement(mdns.udp('acequia', 'osc'), OSC_PORT, {name:"Acequia OSC Server", port: OSC_PORT});
        osc_ad.start();
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
        
        console.log("HTTP server received " + pathName);
        
        if (pathName === "/acequia/acequia.js") {
            serveClientCode(clientCode.full);
        } else if (pathName === "/acequia/acequia.min.js") {
            serveClientCode(clientCode.minified);
        }
    });
    httpServer.listen(WS_PORT);

    wsServer = io.listen(httpServer);

    wsServer.enable('browser client minification');  // send minified client
    wsServer.enable('browser client etag');          // apply etag caching logic based on version number
    wsServer.enable('browser client gzip');          // gzip the file
    wsServer.set('log level', 1);                    // reduce logging
    wsServer.set('transports', [                     // enable all transports (optional if you want flashsocket)
        'websocket',
        //'flashsocket',
        'htmlfile',
        'xhr-polling',
        'jsonp-polling'
    ]);
    
    wsServer.sockets.on('connection', function (socket) {
        
        logger.debug(socket.id + " Connected");
        
        socket.on('message', function (data) {
            var message = new msg.AcequiaMessage(JSON.parse(data));            
            logger.trace("WebSocket:" + this.id + " Received message: " + message);
            
            clients.onMessage(ac.TYP_WS, message, socket);
        });

        socket.on("disconnect", function () {
            clients.findAndRemove(ac.TYP_WS, this.id, "connection closed");
        });
    });

    // Setup a tcp server
    tcpServer = net.createServer(function (socket) {
        
        socket.on("connect", function () {
            logger.debug("TCP: %s:%s connect", socket.remoteAddress, socket.remotePort);
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
                message = msgs[index];
                logger.trace("TCP: %s:%s data : %j", socket.remoteAddress, socket.remotePort, message);
                clients.onMessage(ac.TYP_TCP, message, socket);
            }
        });

        socket.on("end", function () {
            logger.debug("TCP: %s:%s end", socket.remoteAddress, socket.remotePort);
            clients.findAndRemove(ac.TYP_TCP, socket.remoteAddress, socket.remotePort, "socket.on.end");
        });

        socket.on("close", function (had_error) {
            logger.debug("TCP: %s:%s close", socket.remoteAddress, socket.remotePort);
            clients.findAndRemove(ac.TYP_TCP, socket.remoteAddress, socket.remotePort, "socket.on.close");
        });

        socket.on("error", function (exception) {
            logger.debug("TCP: %s:%s error %s", socket.remoteAddress, socket.remotePort, exception);
            socket.destroy();
        });
    });
    
    tcpServer.on("listening", function () {
        logger.debug("TCP Server is listening on %j", tcpServer.address());

        // Broadcast the presence of this server
        tcp_ad = mdns.createAdvertisement(mdns.tcp('acequia'), TCP_PORT, {name:"Acequia TCP Server", port: TCP_PORT});
        tcp_ad.start();
    });

    tcpServer.listen(TCP_PORT, INTERNAL_IP);

    setInterval(kickIdle, 1000);
}

// The exported function is called to start the server.  
// It starts a server for each individual protocol.
function start() {
    process.argv.forEach(function (val, index, array) {
        console.log(index + ': ' + val);
    });
    
    if (process.argv.length > 2) {
        INTERNAL_IP = process.argv[2];
    }
    startServers();
}

start();
