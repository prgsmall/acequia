/**
 *  client
 *
 *  Created by Peter R. G. Small on 2011-09-20.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require setInterval */

var events = require('events'),
       msg = require("./msg"),
       osc = require("./osc"),
    Buffer = require('buffer').Buffer,
    objCallback = require("./utils").objCallback;

var TYP_OSC = "OSC",
    TYP_WS = "WEBSOCKET",
    TYP_TCP = "TCP";

var logger = require('log4js').getLogger("client");

var msgEmitter = new events.EventEmitter();
msgEmitter.setMaxListeners(0);

//=============================================================================

/**
 * The base class for all acequia clients.
 * @param {String} name The unique name of the client.
 * @param {String} prot The protocol of the client
 * @param {Object} server The server to service the client.
 */
var AcequiaClient = function (name, prot, server, className) {
    this.name = name;
    this.protocol = prot;
    this.server   = server;
    this.className = className;
    this.events = {};
    this.messageCallback = objCallback(this, "onMessage");
    this.lastMessage = (new Date()).getTime();
};

AcequiaClient.prototype.toString = function () {
    var i, ret;
    
    ret  = "[object " + this.className + "] {";
    
    for (i in this) {
        if (typeof(this[i]) !== "function") {
            ret += " " + i + ": " + this[i].toString() + ",";
        }
    }
    ret = ret.substring(0, ret.length - 2); 
    ret += "}";
    return ret;
};

AcequiaClient.prototype.equals = function (prot) {
    return (this.protocol === prot);
};

/**
 * Updates the last message time
 */
AcequiaClient.prototype.update = function () {
    this.lastMessage = (new Date()).getTime();
};

/**
 * Subscribes this client to a particular event, if it is not already subscribed
 * @param {String} evt The name of the message to subscribe to.
 */
AcequiaClient.prototype.subscribe = function (evt) {
    // see if the user is already subscribed
    var i, listeners = msgEmitter.listeners(evt);
    for (i = 0; i < listeners.length; i += 1) {
        if (listeners[i] === this.messageCallback) {
            logger.info("Client is already subscribed to " + evt);
            return;
        }
    }
    
    msgEmitter.addListener(evt, this.messageCallback);
    this.events[evt] = evt;
};

/**
 * Unsubscribes this client to a particular event
 * @param {String} evt The name of the message
 */
AcequiaClient.prototype.unsubscribe = function (evt) {
    msgEmitter.removeListener(evt, this.messageCallback);
    delete this.events[evt];
};

/**
 * Unsubscribes from all events
 */
AcequiaClient.prototype.unsubscribeAll = function () {
    var i, evt, events = [];
    for (evt in this.events) {
        events.push(evt);
    }
    
    for (i = 0; i < events.length; i += 1) {
        this.unsubscribe(events[i]);
    }
};

/**
 * Handles a message sent to the client
 * @param {Object} message The message to send.
 */
AcequiaClient.prototype.onMessage = function (message) {
    
    if (message.from === this.name) {
        this.update();
    } else {
        this.send(message);
    }
};

/**
 * Stub method for sending data.
 * @param {Object} message The message to send.
 */
AcequiaClient.prototype.send = function (message) {
    throw new Error("Method send not implemented");
};

//=============================================================================

/**
 * Defines the client connected to acequia via Websockets
 * @param {String} name The unique user name associated with the client.
 * @param {String} id The id assigned to the connection by the websocket
 * @param {Object} server The WebSocketServer that will be used to send the message.
 */
var WebSocketClient = function (name, id, server) {
    this.id = id;
    AcequiaClient.call(this, name, TYP_WS, server, "WebSocketClient");
};
WebSocketClient.prototype = new AcequiaClient();

WebSocketClient.prototype.equals = function (prot, id) {
    return (this.protocol === prot && this.id === id);
};

WebSocketClient.prototype.send = function (message) {
    this.server.send(message.toString());
    logger.trace("Message Sent to %s:%s %s", this.protocol, this.id, message.toString());
    this.update();
};

//=============================================================================

/**
 * Defines the client connected to acequia via a direct TCP socket connection
 * @param {String} name The unique user name associated with the client.
 * @param {String} uid The id that uniquely identifies this socket.
 * @param {Object} server The socket that will be used to send the message.
 */
var TCPClient = function (name, uid, server) {
    this.uid = uid;
    AcequiaClient.call(this, name, TYP_TCP, server, "TCPClient");
};
TCPClient.prototype = new AcequiaClient();

TCPClient.prototype.equals = function (prot, uid) {
    return (this.protocol === prot && 
            this.uid === uid);
};

TCPClient.prototype.send = function (message) {
    var buffer;
    message = message.toString();
    buffer = new Buffer(4 + message.length);
    buffer.writeInt32BE(message.length, 0);
    buffer.write(message, 4);
    this.server.write(buffer);
    logger.trace("Message Sent to %s:[%s]", this.protocol, this.uid);
    this.update();
};

//=============================================================================

/**
 * Defines the client connected to acequia via an OSC connection
 * @param {String} name The unique user name associated with the client.
 * @param {String} ip The ip address associated with the client.
 * @param {Integer} portIn The port that messages will be coming into acequia
 * from the client;
 * @param {Integer} portOut The port that messages will be going out from acequia
 * to the client;
 * @param {Object} server The OSC Server that will be used to send the message.
 */
var OSCClient = function (name, ip, portIn, portOut, server) {
    this.ip = ip;
    this.portIn = portIn;
    this.portOut = portOut;
    AcequiaClient.call(this, name, TYP_OSC, server, "OSCClient");
};
OSCClient.prototype = new AcequiaClient();

OSCClient.prototype.equals = function (prot, ip, portIn) {
    return (this.protocol === prot &&
            this.ip       === ip   &&
            this.portIn   === portIn);
};

OSCClient.prototype.send = function (jsonMessage) {
    var oscMessage = osc.jsonToOsc(jsonMessage),
    buffer = osc.oscToBuffer(oscMessage);
    this.server.send(buffer, 0, buffer.length, this.portOut, this.ip);
    logger.trace("Message Sent to %s:[%s:%s]", this.protocol, this.ip, this.portIn);
    this.update();
};

//=============================================================================

/**
 * Object that holds the list of clients and performs operations on
 * the clients.  This list of clients is an associative array, indexed by the name of
 * the client, making the name of the client unique.
 * @param {Integer} timeout The number of milliseconds the a client can last without
 * a keep-alive message.
 */
var AcequiaClients = function (timeout) {
    this.timeout = timeout;
    this.clients = {};

    // Set an interval to remove any clients that haven't sent messages in a while
    var kickIdle = objCallback(this, "clearExpired");
    setInterval(kickIdle, 1000);
};

/**
 * Creates a new client
 * @param type {string} The type of client to create
 * @param message {AcequiaMessage} The connect message object
 * @param socket {Object} The socket object that the client is communicating over.
 * @param rinfo {Object} [optional] Used only in osc clients.
 * @return {AcequiaClient} the new client object
 */
AcequiaClients.prototype.createClient = function (type, message, socket, rinfo) {
    var portOut;
    switch (type) {
    case TYP_OSC:
        portOut = message.body[0] ? message.body[0] : rinfo.port;
        return new OSCClient(message.from, rinfo.address, rinfo.port, portOut, socket);
    case TYP_TCP:
        return new TCPClient(message.from, socket.uid, socket);
    case TYP_WS:
        return new WebSocketClient(message.from, socket.id, socket);
    default:
        logger.error("Unknown Type: %s", type);
        return null;
    }
};

AcequiaClients.prototype.onOSCMessage = function (message, socket, rinfo) {
    return this.onMessage(TYP_OSC, message, socket, rinfo);
};

AcequiaClients.prototype.onTCPMessage = function (message, socket) {
    return this.onMessage(TYP_TCP, message, socket);
};

AcequiaClients.prototype.onWSMessage = function (message, socket) {
    return this.onMessage(TYP_WS, message, socket);
};

/**
 * Processor for the acequia messages
 * @param type {string} The type of client 
 * @param message {AcequiaMessage} The message object
 * @param socket {Object} The socket object that the client is communicating over.
 * @param rinfo {Object} [optional] Used only in osc clients.
 */
AcequiaClients.prototype.onMessage = function (type, message, socket, rinfo) {
    var client, i, clientList;
    logger.trace("Received: " + message.toString().substring(0,1000));
    switch (message.name) {
    case msg.MSG_CONNECT:
        client = this.createClient(type, message, socket, rinfo);
        try {
            this.add(client);
            for (i = 0;  i < message.body.length; i += 1) {
                client.subscribe(message.body[i]);
            }
            client.send(new msg.AcequiaMessage("SYS", msg.MSG_CONNECT, 1));
        } catch (e) {
            logger.error(e.toString());
            client.send(new msg.AcequiaMessage("SYS", msg.MSG_CONNECT, -1));
        }
        break;

    case msg.MSG_DISCONNECT:
        this.get(message.from).send(new msg.AcequiaMessage("SYS", msg.MSG_DISCONNECT, 1));
        this.remove(message.from, "client sent disconnect message");
        if (typeof(socket.close) !== "undefined") {
            socket.close();
        } else if (typeof(socket.end) !== "undefined") {
            socket.end();
        }
        break;

    case msg.MSG_GETCLIENTS:
        clientList = [];
        for (client in this.clients) {
            clientList.push(this.clients[client].name);
        }
        this.get(message.from).send(new msg.AcequiaMessage("SYS", msg.MSG_GETCLIENTS, clientList));
        break;
        
    case msg.MSG_SUBSCRIBE:
        client = this.get(message.from);
        for (i = 0;  i < message.body.length; i += 1) {
            client.subscribe(message.body[i]);
        }
        break;

    case msg.MSG_UNSUBSCRIBE:
        client = this.get(message.from);
        for (i = 0;  i < message.body.length; i += 1) {
            client.unsubscribe(message.body[i]);
        }
        break;

    default:
        if (message.to) {
            this.sendTo(message);
        } else {
            this.broadcast(message);
        }
        break;
    }
};

/**
 * Sends a message to a particular client.
 * @param {String} from The name of the sender of the message
 * @param {String} title The name of the message.
 * @param {String} date The message body.
 * @param {String} tt Additional data required by OSC clients.
 */
AcequiaClients.prototype.sendTo = function (message) {
    if (message.to in this.clients) {
        this.clients[message.to].send(message);        
    } else {
        logger.warn("Attempted to send a message to a client [" + message.to +  "] that does not exist.");
    }
};

/**
 * Broadcasts the message to all clients except for the sender.
 * @param {Object} message The message to broadcast
 */
AcequiaClients.prototype.broadcast = function (message) {
    msgEmitter.emit(message.name, message);
};

/**
 * Gets a client given a set of parameters, that are specific to that type
 * of client.  These are defined in the equals method of each client type.
 */
AcequiaClients.prototype.find = function () {
    var i, cli;
    for (i in this.clients) {
        cli = this.clients[i];
        if (cli.equals.apply(cli, arguments)) {
            return cli;
        }
    }
    return null;
};

/**
 * Gets a client with the given name.
 * @param {String} name The name of the client to retrieve.
 */
AcequiaClients.prototype.get = function (name) {
    return this.clients[name];
};

/**
 * Adds a client to the list of Acequia Clients.
 * @param {AcequiaClient} client The client to add.
 * @throws Error if there already is a client with the given name.
 */
AcequiaClients.prototype.add = function (client) {
    if (client.name in this.clients) {
        if (this.client.server.isdestroyed) {
            this.remove(client.name, "socket destroyed");
        } else {
            throw new Error("A client with this name (" + client.name + ") already exists");
        }
    }
    
    this.clients[client.name] = client;
    logger.info("Added %s client [%s]", client.protocol, client.name);
};

/**
 * Drops a client from the server (they disconnect, timeout, error, etc.)
 * @param {String} name The name of the client to remove
 * @param {String} reason The reason that the client was dropped.
 */
AcequiaClients.prototype.remove = function (name, reason) {
    if (name in this.clients) {
        logger.debug("Dropped client " + name + " from server.  Reason: " + reason);
        this.clients[name].unsubscribeAll();
        delete this.clients[name];
    } else {
        logger.warn("Attempted to remove a client that does not exist.");
    }
};

/**
 * Finds a client, given the semantics of the find method, and removes it from
 * the client list.
 * @param a client-dependent list of arguments to pass into the find method.  The
 * last argument being the reason the client is being removed.
 */
AcequiaClients.prototype.findAndRemove = function () {
    var reason = arguments[arguments.length - 1],
    client = this.find.apply(this, arguments);
    
    if (client) {
        this.remove(client.name, reason);
    }
};

/**
 * Removes all clients which have not been heard from within the keep alive interval.
 */
AcequiaClients.prototype.clearExpired = function () {
    var time = (new Date()).getTime(), i, rem = [];
 
    for (i in this.clients) {
        if ((time - this.clients[i].lastMessage) > this.timeout) {
            rem.push(i);
        }
    }
    
    for (i = 0; i < rem.length; i += 1) {
        this.remove(rem[i], "client timeout");
    }
};

// Export the entities that Acequia needs
exports.TYP_OSC = TYP_OSC;
exports.TYP_TCP = TYP_TCP;
exports.TYP_WS = TYP_WS;
exports.AcequiaClients = AcequiaClients;
exports.msgEmitter = msgEmitter;
