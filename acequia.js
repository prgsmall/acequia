/*global console process require setInterval*/

// Imports and globals.
var sys = require("sys"),
    http = require("http"),
    URL = require("url"),
    net = require("net"),
    log4js = require('./vendor/log4js-node'),
    dgram = require("dgram"),
    ws = require("./vendor/websocket-server"),
    osc = require("./libs/osc.js"),
    netIP = require("./libs/netIP.js"),
    ac = require("./client.js"),
    msg = require("./msg.js");

var DEBUG = 1,
    INTERNAL_IP = "",
    OSC_PORT = 9090,
    WS_PORT = 9091,
    HTTP_PORT = 9092,
    TCP_PORT = 9093,
    TIMEOUT = 600; // Seconds before kicking idle clients.

/**
 * The standard messages that the acequia system handles.
 */
var MSG_CONNECT    = "/connect";
var MSG_DISCONNECT = "/disconnect";
var MSG_GETCLIENTS = "/getClients";

// The list of clients
var clients = new ac.AcequiaClients(TIMEOUT * 1000);

var oscServer, wsServer;

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
    //clients.clearExpired();
}

// Once we actually get our internal IP, we start the servers.
function startServers() {
    var i,  from, to, title, tt, client, portOut,
    httpClient, request, clientList;

    //OSC Server.
    oscServer = dgram.createSocket("udp4");

    oscServer.on("message", function (msg, rinfo) {
        var cli, oscMsg = osc.bufferToOsc(msg);
        
        switch (oscMsg.address) {
        case MSG_CONNECT:
            // TODO:  How do you send a reject message if the user already exists?
            //the second parameter when logging in is an optional "port to send to".
            portOut = (oscMsg.data[1] > 0) ? oscMsg.data[1] : rinfo.port;
            client = new ac.OSCClient(oscMsg.data[0], rinfo.address, rinfo.port, portOut, oscServer);
            clients.add(client);
            logger.debug("Added client " + oscMsg.data[0] + 
                  " (OSC@" + rinfo.address + ":" + rinfo.port + ", client #" + (clients.length - 1) + ")");
            break;
        
        case MSG_DISCONNECT:
            cli = clients.find(ac.TYP_OSC, rinfo.address, rinfo.por);
            clients.remove(cli.name, "disconnect by user");
            break;
        
        default:
            from = clients.find(ac.TYP_OSC, rinfo.address, rinfo.port).name;
            to = clients.get(oscMsg.data.shift()).name;
            title = oscMsg.address;
            tt = oscMsg.typeTags.slice(1);
            onMessage(from, to, title, oscMsg.data, tt);
            break;
        }
    });
    
    // This is the bit of code that tells plasticSarcastic what ip and port we are.  
    // Essentially our authentication/auto-discovery method for right now.
    oscServer.on("listening", function () {
        logger.debug("oscServer is listening on " + oscServer.address().address + ":" + oscServer.address().port);
/*
        httpClient = http.createClient("80", "plasticsarcastic.com");
        request = httpClient.request("GET", "/nodejs/scrCreateServer.php?ip=" + INTERNAL_IP + 
            "&port=" + OSC_PORT, {"host" : "plasticsarcastic.com"});
        request.end();
        request.on("response", function (response) {
            response.setEncoding("utf8");
            response.on("data", function (txt) {
                if (txt === "0") {
                    throw new Error("Couldn't create server.\n");
                }
            });
        });
*/
    });

    oscServer.on("close", function () {
        logger.debug("oscServer closed");
    });
        
    oscServer.bind(OSC_PORT, INTERNAL_IP);

    //Websocket server:
    wsServer = ws.createServer();
    wsServer.addListener("connection", function (con) {
        logger.trace("wsServer: connection");
        con.addListener("message", function (msg) {
            logger.debug("Received message: " + msg);
            
            var from, to, m, 
                message = JSON.parse(msg),
                title = message.name,
                body  = message.body;

            if (title === MSG_CONNECT) {
                client = new ac.WebSocketClient(message.from, con.id, wsServer);
                try {
                    clients.add(client);
                } catch (e) {
                    m = new msg.AcequiaMessage("SYS", MSG_CONNECT, -1);
                    wsServer.send(con.id, m.toString());
                }
                
                // Send the confirmation message
                client.send("SYS", MSG_CONNECT, 1);

            } else {
                from = clients.find(ac.TYP_WS, con.id).name;
                to = clients.get(message.to) ? clients.get(message.to).name : "";

                switch (title) {
                case MSG_DISCONNECT:
                    clients.get(from).send("SYS", MSG_DISCONNECT, 1);
                    clients.remove(from, "disconnect by user.");
                    break;
            
                case MSG_GETCLIENTS:
                    clientList = [];
                    for (i in clients.clients) {
                        clientList.push(clients.clients[i].name);
                    }
                    clients.get(from).send("SYS", MSG_GETCLIENTS, clientList);
                    break;

                default:
                    onMessage(from, to, title, body);
                    break;
                }
            }
        });
        
        con.addListener("close", function () {
            var cli = clients.find(ac.TYP_WS, con.id);
            if (cli) {
                clients.remove(cli.name, "connection closed");
            }
        });

        con.addListener("timeout", function () {
            var cli = clients.find(ac.TYP_WS, con.id);
            if (cli) {
                clients.remove(cli.name, "connection timeout");
            }
        });

        con.addListener("error", function (e) {
            var cli = clients.find(ac.TYP_WS, con.id);
            if (cli) {
                clients.remove(cli.name, "connection error: " + e);
            }
        });
    });

    wsServer.addListener("listening", function () {
        logger.debug("wsServer is listening on " + INTERNAL_IP + ":" + WS_PORT);
    });
    
    wsServer.addListener("upgrade", function (con) {
        logger.debug("wsServer: upgrade");
    });
    
    wsServer.addListener("request", function (con) {
        logger.debug("wsServer: request");
    });
    
    wsServer.addListener("stream", function (con) {
        logger.debug("wsServer: stream");
    });
    
    wsServer.addListener("close", function (con) {
        logger.debug("wsServer: close");
    });
    
    wsServer.addListener("clientError", function (e) {
        logger.debug("wsServer: clientError: " + e);
    });
    
    wsServer.addListener("error", function (e) {
        logger.debug("wsServer: error: " + e);
    });
    
    wsServer.listen(WS_PORT);
/*
    // HTTP Server
    http.createServer(function (req, res) {
        var pathName = URL.parse(req.url, true).pathname;
        console.log("HTTP server received " + pathName);
        res.writeHead(200, {"Content-Type": "text/plain"});
        switch (pathName) {
        case MSG_CONNECT:
            break;
        case MSG_DISCONNECT:
            break;
        case MSG_GETCLIENTS:
            break;
        default:
            break;
        }
        res.end(req.body + "  Hello World\n");
    }).listen(HTTP_PORT);
    debug("httpServer is listening on " + INTERNAL_IP + ":" + HTTP_PORT);
*/
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
        netIP.getNetworkIP(function (error, ip) {
            INTERNAL_IP = ip;
            startServers();
            if (error) {
                logger.error("error:", error);
            }
        }, false);
    }
}

start();
