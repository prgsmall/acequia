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
    ac = require("./client.js");

var DEBUG = 1,
    INTERNAL_IP = "",
    OSC_PORT = 9090,
    WS_PORT = 9091,
    HTTP_PORT = 9092,
    TCP_PORT = 9093,
    TIMEOUT = 600; //Seconds before kicking idle clients.

/**
 * The standard messages that the acequia system handles.
 */
var MSG_CONNECT    = "/connect";
var MSG_DISCONNECT = "/disconnect";
var MSG_GETCLIENTS = "/getClients";

// The list of clients
var clients = [];

var oscServer, wsServer;

var logger = log4js.getLogger("acequia");

// The master sending function which takes a message meant for a client, decides 
// which protocol to use, and calls the appropriate function.
function msgSnd(to, from, title, body, tt) {
    clients[to].send(from, title, body, tt);
    logger.debug("Sent message " + title + " to client #" + to + " (" + clients[to].name + ")");
}

//The master function which sends messages to all clients except for exc.
function msgSndAll(exc, mesid, data, tt) {
    var i, name = clients[exc].name;
    for (i = 0; i < clients.length; i += 1) {
        if (i !== exc) {
            clients[i].send(name, mesid, data, tt);
        }
    }
}

// Message routing goes here.
function onMessage(from, to, title, body, tt) {
    if (to === -1) {
        msgSndAll(from, title, body, tt);
    } else {
        msgSnd(to, clients[from].name, title, body, tt);
    }
}

// Often we only know the IP and Port of the sender of a message.  
// This function translates this data into a 'usable' client ID number.
function lookupClient(protocol, var1, var2) {
    var i;
    for (i = 0; i < clients.length; i += 1) {
        if (clients[i].equals(protocol, var1, var2)) {
            return i; 
        }
    }
    return -1;
}


// Looks up a client based on username.
function lookupClientUsername(usr) {
    var i;
    for (i = 0; i < clients.length; i += 1) {
        if (clients[i].name === usr) {
            return i;
        }
    }
    return -1;
}

//Drops a client from the server (they disconnect, timeout, error, etc.)
function dropClient(client, reason) {
    if (typeof(clients[client]) === "undefined") {
        return;
    }
    logger.debug("Dropped client #" + client + " (" + clients[client].name + ") from server.  (" + reason + ")");
    clients.splice(client, 1);
}

//Kicks any clients who we have not heard from for a while.
function kickIdle() {
    var time = (new Date()).getTime(), i;
    
    for (i = 0; i < clients.length; i += 1) {
        if ((time - clients[i].lastMessage) > TIMEOUT * 1000) {
            dropClient(i, "client timeout");
            i -= 1;
        }
    }
}

// Once we actually get our internal IP, we start the servers.
function startServers() {
    var i,  from, to, title, tt, client, portOut,
    httpClient, request, clientList;

    //OSC Server.
    oscServer = dgram.createSocket("udp4");
    oscServer.on("message", function (msg, rinfo) {
        var oscMsg = osc.bufferToOsc(msg);
        
        switch (oscMsg.address) {
        case MSG_CONNECT:
            //the second parameter when logging in is an optional "port to send to".
            portOut = (oscMsg.data[1] > 0) ? oscMsg.data[1] : rinfo.port;
            client = new ac.OSCClient(oscMsg.data[0], rinfo.address, rinfo.port, portOut, oscServer);
            clients.push(client);
            logger.debug("Added client " + oscMsg.data[0] + 
                  " (OSC@" + rinfo.address + ":" + rinfo.port + ", client #" + (clients.length - 1) + ")");
            break;
        
        case MSG_DISCONNECT:
            dropClient(lookupClient(ac.TYP_OSC, rinfo.address, rinfo.port), "disconnect by user");
            break;
        
        default:
            from = lookupClient(ac.TYP_OSC, rinfo.address, rinfo.port);
            to = lookupClientUsername(oscMsg.data.shift());
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
    });

    oscServer.bind(OSC_PORT, INTERNAL_IP);

    //Websocket server:
    wsServer = ws.createServer();
    wsServer.addListener("connection", function (con) {
        logger.debug("wsServer: connection");
        con.addListener("message", function (msg) {
            logger.debug("connection: message " + msg);
            
            var from, to,
                message = JSON.parse(msg),
                title = message.name,
                body  = message.body;

            if (title === MSG_CONNECT) {
                //Add them to the clients list when they connect if the username is free.
                for (i = 0; i < clients.length; i += 1) {
                    if (clients[i].name === message.from) {
                        wsServer.send(con.id, 
                            JSON.stringify({"from" : "SYS", "name" : MSG_CONNECT, "body" : [-1]}));
                        return;
                    }
                }

                client = new ac.WebSocketClient(message.from, con.id, wsServer);
                clients.push(client);
                
                client.send("SYS", MSG_CONNECT, 1);
                logger.debug("Added client " + clients[clients.length - 1].name + 
                      " (ws id " + con.id + ", client #" + (clients.length - 1) + ")");                
            } else {
                from = lookupClient(ac.TYP_WS, con.id);
                to = lookupClientUsername(message.to);

                switch (title) {
                case MSG_DISCONNECT:
                    clients[from].send("SYS", MSG_DISCONNECT, 1);
                    dropClient(from, "disconnect by user.");
                    break;
            
                case MSG_GETCLIENTS:
                    clientList = [];
                    for (i = 0; i < clients.length; i += 1) {
                        clientList.push(clients[i].name);
                    }
                    clients[from].send("SYS", MSG_GETCLIENTS, clientList);
                    break;

                default:
                    onMessage(from, to, title, body);
                    break;
                }
            }
        });
        
        con.addListener("close", function () {
            dropClient(lookupClient(ac.TYP_WS, con.id), "connection closed");
        });

        con.addListener("timeout", function () {
            dropClient(lookupClient(ac.TYP_WS, con.id), "connection timeout");
        });

        con.addListener("error", function (e) {
            dropClient(lookupClient(ac.TYP_WS, con.id), "connection error: " + e);
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
