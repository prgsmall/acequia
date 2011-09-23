/*global console process require setInterval*/

// Imports and 'globals'.
var sys = require('sys'),
    http = require('http'),
    URL = require('url'),
    net = require('net'),
    dgram = require('dgram'),
    ws = require('./vendor/websocket-server'),
    osc = require('./libs/osc.js'),
    netIP = require('./libs/netIP.js'),
    ac = require("./client.js");

var DEBUG = 1,
    INTERNAL_IP = '',
    OSC_PORT = 9090,
    WS_PORT = 9091,
    HTTP_PORT = 9092,
    TCP_PORT = 9093,
    TIMEOUT = 600; //Seconds before kicking idle clients.


// The list of clients
var clients = [];

var oscServer, wsServer;

//Logs str to the console if the 'global' debug is set to 1.
function debug(str) {
    if (DEBUG) {
        console.log('[' + (new Date()) + '] ' + str);
    }
}

//Utility function for sending an osc message to a given client.
function msgSndOsc(to, from, title, body, tt) {
    var data = [from].concat(body),
    oscMsg = osc.newOsc(title, 's' + tt, data),
    buffer = osc.oscToBuffer(oscMsg);
    
    oscServer.send(buffer, 0, buffer.length, clients[to].portOut, clients[to].ip);
}


//Utility function for sending a websocket message to a given client.
function msgSndWs(to, from, title, body) {
    wsServer.send(clients[to].id, JSON.stringify({'from' : from, 'title' : title, 'body' : body}));
}


// The master sending function which takes a message meant for a client, decides 
// which protocol to use, and calls the appropriate function.
function msgSnd(to, from, title, body, tt) {
    if (to === -1) { 
        return; 
    }
    
    switch (clients[to].protocol) {
    case ac.TYP_OSC:
        msgSndOsc(to, from, title, body, tt);
        break;
    
    case ac.TYP_WS:
        msgSndWs(to, from, title, body);
        break;
    }
    debug("Sent message " + title + " to client #" + to + " (" + clients[to].name + ")");
}

//The master function which sends messages to all clients except for exc.
function msgSndAll(exc, mesid, data, tt) {
    var i;
    for (i = 0; i < clients.length; i += 1) {
        if (i !== exc) {
            msgSnd(i, mesid, data, tt);
        }
    }
}

// Message routing goes here.
function msgRec(from, to, title, body, tt) {
    var time = (new Date()).getTime();
    debug('Received message ' + title + ' from client #' + from + ' (' + clients[from].name + ')');
    if (from === -1) { 
        return;
    }
    clients[from].lastMessage = time;
    
    switch (title) {
    case "place-holder":
        break;
    case "place-holder2":
        break;
    default:
        msgSnd(to, clients[from].name, title, body, tt);
        break;
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
    debug('Dropped client #' + client + ' (' + clients[client].name + ') from server.  (' + reason + ')');
    clients.splice(client, 1);
}

//Kicks any clients who we have not heard from for a while.
function kickIdle() {
    var time = (new Date()).getTime(), i;
    
    for (i = 0; i < clients.length; i += 1) {
        if ((time - clients[i].lastMessage) > TIMEOUT * 1000) {
            dropClient(i, 'timeout');
            i -= 1;
        }
    }
}

// Once we actually get our internal IP, we start the servers.
function startServers() {
    var i, oscMsg, from, to, title, tt, client, portOut,
    httpClient, request, clientList;

    //OSC Server.
    oscServer = dgram.createSocket('udp4');
    oscServer.on('message', function (msg, rinfo) {
        oscMsg = osc.bufferToOsc(msg);
        
        switch (oscMsg.address) {
        case "/connect":
            //the second parameter when logging in is an optional 'port to send to'.
            portOut = (oscMsg.data[1] > 0) ? oscMsg.data[1] : rinfo.port;
            client = new ac.OSCClient(oscMsg.data[0], rinfo.address, rinfo.port, portOut);
            clients.push(client);
            debug('Added client ' + oscMsg.data[0] + 
                  ' (OSC@' + rinfo.address + ':' + rinfo.port + ', client #' + (clients.length - 1) + ')');
            break;
        
        case "/disconnect":
            dropClient(lookupClient(ac.TYP_OSC, rinfo.address, rinfo.port), "disconnect by user");
            break;
        
        default:
            from = lookupClient(ac.TYP_OSC, rinfo.address, rinfo.port);
            to = lookupClientUsername(oscMsg.data.shift());
            title = oscMsg.address;
            tt = oscMsg.typeTags.slice(1);
            msgRec(from, to, title, oscMsg.data, tt);
            break;
        }
    });
    
    // This is the bit of code that tells plasticSarcastic what ip and port we are.  
    // Essentially our authentication/auto-discovery method for right now.
    oscServer.on('listening', function () {
        debug('oscServer is listening on ' + oscServer.address().address + ':' + oscServer.address().port);
        
        httpClient = http.createClient('80', 'plasticsarcastic.com');
        request = httpClient.request('GET', '/nodejs/scrCreateServer.php?ip=' + INTERNAL_IP + '&port=' + OSC_PORT, {'host' : 'plasticsarcastic.com'});
        request.end();
        request.on('response', function (response) {
            response.setEncoding('utf8');
            response.on('data', function (txt) {
                if (txt === '0') {
                    throw new Error("Couldn't create server.\n");
                }
            });
        });
    });

    //"Finalize" the OSC server.
    oscServer.bind(OSC_PORT, INTERNAL_IP);

    //Websocket server:
    wsServer = ws.createServer();
    wsServer.addListener('connection', function (con) {
        debug("wsServer: connection");
        con.addListener('message', function (msg) {
            debug("connection: message");
            
            var message = JSON.parse(msg),
                from = lookupClient(ac.TYP_WS, con.id),
                to = lookupClientUsername(message.to),
                title = message.title,
                body = message.body;
            
            
            switch (title) {
            case "/connect":
                //Add them to the clients list when they connect if the username is free.
                for (i = 0; i < clients.length; i += 1) {
                    if (clients[i].name === body[0]) {
                        wsServer.send(con.id, 
                            JSON.stringify({'from' : 'SYS', 'title' : '/connect', 'body' : [-1]}));
                        return;
                    }
                }

                client = new ac.WebSocketClient(body[0], con.id);
                clients.push(client);
                
                msgSndWs(clients.length - 1, "SYS", "/connect", 1);
                debug('Added client ' + clients[clients.length - 1].name + 
                      ' (ws id ' + con.id + ', client #' + (clients.length - 1) + ')');
                break;
            
            case "/disconnect":
                dropClient(from, "disconnect by user.");
                break;
            
            case "/getClients":
                clientList = [];
                for (i = 0; i < clients.length; i += 1) {
                    clientList.push(clients[i].name);
                }
                msgSndWs(from, "SYS", "/getClients", clientList);
                break;

            default:
                msgRec(from, to, title, body);
                break;
            }
        });
        
        con.addListener('close', function () {
            dropClient(lookupClient(ac.TYP_WS, con.id), "connection closed");
        });

        con.addListener('timeout', function () {
            dropClient(lookupClient(ac.TYP_WS, con.id), "connection timeout");
        });

        con.addListener('error', function (e) {
            dropClient(lookupClient(ac.TYP_WS, con.id), "connection error: " + e);
        });
    });

    wsServer.addListener('listening', function () {
        debug('wsServer is listening on ' + INTERNAL_IP + ":" + WS_PORT);
    });
    
    wsServer.addListener('upgrade', function (con) {
        debug('wsServer: upgrade');
    });
    
    wsServer.addListener('request', function (con) {
        debug('wsServer: request');
    });
    
    wsServer.addListener('stream', function (con) {
        debug('wsServer: stream');
    });
    
    wsServer.addListener('close', function (con) {
        debug('wsServer: close');
    });
    
    wsServer.addListener('clientError', function (e) {
        debug('wsServer: clientError: ' + e);
    });
    
    wsServer.addListener('error', function (e) {
        debug('wsServer: error: ' + e);
    });
    
    wsServer.listen(WS_PORT);

    setInterval(kickIdle, 1000);
}

// The exported function is called to start the server.  
// It starts a server for each individual protocol.
function start() {
    
    //First, we need to get our internal IP, by parsing ifconfig:
    if (process.argv.length > 2) {
        INTERNAL_IP = process.argv[2];
        startServers();
    } else {
        netIP.getNetworkIP(function (error, ip) {
            INTERNAL_IP = ip;
            startServers();
            if (error) {
                console.log('error:', error);
            }
        }, false);
    }
}

start();
