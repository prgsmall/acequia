/*global console process require setInterval*/

// Imports and globals.
var http = require("http"),
    url = require("url"),
    net = require("net"),
    log4js = require('log4js-node'),
    dgram = require("dgram"),
    osc = require("./libs/osc.js"),
    ac = require("./client.js"),
    msg = require("./msg.js"),
    querystring = require("querystring"),
    Buffer = require('buffer').Buffer;

var DEBUG = 1,
    INTERNAL_IP = "0.0.0.0",
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
    var i, from, to, title, tt, client, portOut, clientList;

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
        logger.debug("OSC Server is listening on %j", oscServer.address());
    });

    oscServer.on("close", function () {
        logger.debug("oscServer closed");
    });
    
    oscServer.bind(OSC_PORT, INTERNAL_IP);

    // Websocket server:
    wsServer = require('socket.io').listen(WS_PORT);

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
    
    wsServer.sockets.on('connection', function (socket) {
        
        logger.debug(socket.id + " Connected");
        socket.on('message', function (data) {
            logger.debug("WebSocket" + this.id + " Received message: " + data);
            
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
            clients.findAndRemove(ac.TYP_WS, this.id, "connection closed");
        });
    });

    // Setup a tcp server
    tcpServer = net.createServer(function (socket) {
        
        socket.addListener("connect", function () {
            logger.debug("TCP: %s:%s connect", socket.remoteAddress, socket.remotePort);
        });
        
        socket.addListener("data", function(data) {
            var index = 0, msgs = [], size, message,
            buffer = new Buffer(data);
            
            while (index < buffer.length) {
                size = buffer.readInt32BE(index);
                logger.debug("message size: %d", size);
                index += 4;
                message = buffer.slice(index, index + size);
                msgs.push(JSON.parse(message));
                index += size;
            }
            
            for (index in msgs) {
                message = msgs[index];
                logger.debug("TCP: %s:%s data : %j", socket.remoteAddress, socket.remotePort, message);

                switch (message.name) {
                case msg.MSG_CONNECT:
                    client = new ac.TCPClient(message.from, socket.remoteAddress, socket.remotePort, socket);
                    try {
                        clients.add(client);
                    } catch (e) {
                        var m = new msg.AcequiaMessage("SYS", msg.MSG_CONNECT, -1);
                        socket.write(m.toString());
                        socket.end();
                    }
                    client.send("SYS", msg.MSG_CONNECT, 1);
                    break;

                case msg.MSG_DISCONNECT:
                    clients.get(message.from).send("SYS", msg.MSG_DISCONNECT, 1);
                    clients.remove(message.from, "client sent disconnect message");
                    socket.end();
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
    
    tcpServer.on("listening", function() {
        logger.debug("TCP Server is listening on %j", tcpServer.address());        
    });

    tcpServer.listen(TCP_PORT, INTERNAL_IP);

    setInterval(kickIdle, 1000);
}

// The exported function is called to start the server.  
// It starts a server for each individual protocol.
function start() {
    if (process.argv.length > 2) {
        INTERNAL_IP = process.argv[2];
    }
    startServers();
}

start();
