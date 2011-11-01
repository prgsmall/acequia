/*global console process require setInterval*/

// Imports and globals.
var http = require("http"),
    url = require("url"),
    net = require("net"),
    log4js = require('log4js-node'),
    netIP = require("./libs/netIP.js"),
    ac = require("./client.js"),
    msg = require("./msg.js"),
    querystring = require("querystring");

var DEBUG = 1,
    INTERNAL_IP = "",
    OSC_PORT = 9090,
    WS_PORT = 9091,
    TCP_PORT = 9092,
    TIMEOUT = 600000; // Seconds before kicking idle clients.

// The list of clients
var clients = new ac.AcequiaClients(TIMEOUT * 1000);

var oscServer, wsServer, tcpServer;

var logger = log4js.getLogger("acequia");

// Message routing goes here.
function onMessage(from, to, title, body, tt) {
    if (to) {
        clients.sendTo(to, from, title, body, tt);
    } else {
        clients.broadcast(from, title, body, tt);
    }
}

// Kicks any clients who we have not heard from for a while.
function kickIdle() {
    clients.clearExpired();
}

// Once we actually get our internal IP, we start the servers.
function startServers() {
    var i, from, to, title, tt, client, portOut,
    request, clientList;

    // OSC Server.
    try {
        var dgram = require("dgram"),
            osc   = require("./libs/osc.js");

        oscServer = dgram.createSocket("udp4");

        oscServer.on("message", function (msg, rinfo) {
            var cli, oscMsgs = osc.bufferToOsc(msg),  oscMsg, i;
        
            for (i in oscMsgs) {
                oscMsg = oscMsgs[i];
                logger.debug(JSON.stringify(oscMsg));
                switch (oscMsg.address) {
                case msg.MSG_CONNECT:
                    // TODO:  How do you send a reject message if the user already exists?
                    //the second parameter when logging in is an optional "port to send to".
                    portOut = (oscMsg.data[1] > 0) ? oscMsg.data[1] : rinfo.port;
                    client = new ac.OSCClient(oscMsg.data[0], rinfo.address, rinfo.port, portOut, oscServer);
                    clients.add(client);
                    logger.debug("Added client " + oscMsg.data[0] + 
                          " (OSC@" + rinfo.address + ":" + rinfo.port + ", client #" + (clients.length - 1) + ")");
                    break;
        
                case msg.MSG_DISCONNECT:
                    cli = clients.find(ac.TYP_OSC, rinfo.address, rinfo.por);
                    if (cli) {
                        clients.remove(cli.name, "disconnect by user");
                    }
                    break;
        
                default:
                    from = ""; // clients.find(ac.TYP_OSC, rinfo.address, rinfo.port).name;
                    to = ""; // clients.get(oscMsg.data.shift()).name;
                    title = oscMsg.address;
                    tt = oscMsg.typeTags.slice(1);
                    onMessage(from, to, title, oscMsg.data, tt);
                    break;
                }
            }
        });
    
        // This is the bit of code that tells plasticSarcastic what ip and port we are.  
        // Essentially our authentication/auto-discovery method for right now.
        oscServer.on("listening", function () {
            logger.debug("oscServer is listening on " + oscServer.address().address + ":" + oscServer.address().port);
        });

        oscServer.on("close", function () {
            logger.debug("oscServer closed");
        });
        
        oscServer.bind(OSC_PORT, INTERNAL_IP);
    } catch (e) {
        logger.error("Unable to create OSC server");
    }

    // Websocket server:
    wsServer = require('socket.io').listen(WS_PORT);

//    wsServer.enable('browser client minification');  // send minified client
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

    wsServer.sockets.on('connection', function (socket) {
        
        logger.debug(socket.id + " Connected");
        socket.on('message', function (data) {
            logger.debug(this.id + " Received message: " + data);
            
            var message = JSON.parse(data);

            switch (message.name) {
            case msg.MSG_CONNECT:
                client = new ac.WebSocketClient(message.from, this.id, socket);
                try {
                    clients.add(client);
                } catch (e) {
                    var m = new msg.AcequiaMessage("SYS", msg.MSG_CONNECT, -1);
                    wsServer.emit(m.toString());
                }
                client.send("SYS", msg.MSG_CONNECT, 1);
                break;

            case msg.MSG_DISCONNECT:
                clients.get(message.from).send("SYS", msg.MSG_DISCONNECT, 1);
                clients.remove(message.from, "disconnect by user.");
                break;
        
            case msg.MSG_GETCLIENTS:
                var clientList = [], cli;
                for (cli in clients.clients) {
                    clientList.push(clients.clients[cli].name);
                }
                clients.get(message.from).send("SYS", msg.MSG_GETCLIENTS, clientList);
                break;

            default:
                onMessage(message.from, message.to, message.name, message.body);
                break;
            }
        });

        socket.on("disconnect", function () {
            logger.debug(this.id + " Disconnected");
            
            var cli = clients.find(ac.TYP_WS, this.id);
            if (cli) {
                clients.remove(cli.name, "connection closed");
            }
        });
    });

    // Setup a tcp server
    tcpServer = net.createServer(function (socket) {

        socket.addListener("connect", function () {
            logger.debug("Connection from " + socket.remoteAddress);
        });
        
        socket.addListener("data", function(data) {
            
        });

    });

    tcpServer.listen(TCP_PORT, INTERNAL_IP);

    logger.debug("TCP erver is listening on " + INTERNAL_IP + ":" + TCP_PORT);

    setInterval(kickIdle, 1000);
}

// The exported function is called to start the server.  
// It starts a server for each individual protocol.
function start() {
    
    // First, we need to get our internal IP, by parsing ifconfig:
    if (process.argv.length > 2) {
        INTERNAL_IP = process.argv[2];
        startServers();
    } else {
        netIP.getIPFromSocket(function (error, ip) {
            INTERNAL_IP = ip;
            startServers();
            if (error) {
                logger.error("error:", error);
            }
        }, false);
    }
}

start();
