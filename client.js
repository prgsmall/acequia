/**
 *  client
 *
 *  Created by Peter R. G. Small on 2011-09-20.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require  */

var log4js = require('log4js-node'),
    msg = require("./msg.js"),
    osc = require("./libs/osc.js");

var TYP_OSC = "OSC",
    TYP_WS = "WEBSOCKET",
    TYP_TCP = "TCP";

var logger = log4js.getLogger("client");

var dumpObject = function (obj, className) {
    var i, ret;
    if (typeof(className) === "undefined") {
        className = "Object";
    }
    
    ret  = "[object " + className + "] {";
    
    for (i in obj) {
        if (typeof(obj[i]) !== "function") {
            ret += " " + i + ": " + obj[i].toString() + ",";
        }
    }
    ret = ret.substring(0, ret.length - 2); 
    ret += "}";
    return ret;
};

//=============================================================================

/**
 * The base class for all acequia clients.
 * @param {String} name The unique name of the client.
 * @param {String} prot The protocol of the client
 * @param {Object} server The server to service the client.
 */
var AcequiaClient = function (name, prot, server) {
    this.name = name;
    this.protocol = prot;
    this.server   = server;
    this.lastMessage = (new Date()).getTime();
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

//=============================================================================

/**
 * Defines the client connected to acequia via Websockets
 * @param {String} name The unique user name associated with the client.
 * @param {String} id The id assigned to the connection by the websocket
 * @param {Object} server The WebSocketServer that will be used to send the message.
 */
var WebSocketClient = function (name, id, server) {
    this.id = id;
    AcequiaClient.call(this, name, TYP_WS, server);
};
WebSocketClient.prototype = new AcequiaClient();

WebSocketClient.prototype.equals = function (prot, id) {
    return (this.protocol === prot && this.id === id);
};

WebSocketClient.prototype.send = function (from, name, body) {
    var message = new msg.AcequiaMessage(from, name, body);
    this.server.send(message.toString());
    this.update();
};

WebSocketClient.prototype.toString = function () {
    return dumpObject(this, "WebSocketClient");
};

//=============================================================================

/**
 * Defines the client connected to acequia via a direct TCP socket connection
 * @param {String} name The unique user name associated with the client.
 * @param {String} id The id assigned to the connection by the websocket
 * @param {Object} server The WebSocketServer that will be used to send the message.
 */
var TCPClient = function (name, ip, port, server) {
    this.ip = ip;
    this.port = port;
    AcequiaClient.call(this, name, TYP_TCP, server);
};
TCPClient.prototype = new AcequiaClient();

TCPClient.prototype.equals = function (prot, ip, port) {
    return (this.protocol === prot && 
            this.ip === ip &&
            this.port === port);
};

TCPClient.prototype.send = function (from, name, body) {
    var message = new msg.AcequiaMessage(from, name, body);
    this.server.write(message.toString());
    this.update();
};

TCPClient.prototype.toString = function () {
    return dumpObject(this, "TCPClient");
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
    AcequiaClient.call(this, name, TYP_OSC, server);
};
OSCClient.prototype = new AcequiaClient();

OSCClient.prototype.equals = function (prot, ip, portIn) {
    return (this.protocol === prot &&
            this.ip       === ip   &&
            this.portIn   === portIn);
};

OSCClient.prototype.send = function (from, name, body, tt) {
    var data = [from].concat(body),
    oscMsg = osc.newOsc(name, 's' + tt, data),
    buffer = osc.oscToBuffer(oscMsg);
    
    this.server.send(buffer, 0, buffer.length, this.portOut, this.ip);
    this.update();
};

OSCClient.prototype.toString = function () {
    return dumpObject(this, "OSCClient");
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
    this.clients = [];
};

/**
 * Sends a message to a particular client.
 * @param {String} from The name of the sender of the message
 * @param {String} title The name of the message.
 * @param {String} date The message body.
 * @param {String} tt Additional data required by OSC clients.
 */
AcequiaClients.prototype.sendTo = function (to, from, title, body, tt) {
    if (to in this.clients) {
        this.clients[to].send(from, title, body, tt);        
    } else {
        logger.warn("Attempted to send a message to a client [" + to +  "] that does not exist.");
    }
};

/**
 * Broadcasts the message to all clients except for the sender.
 * @param {String} from The name of the sender of the message
 * @param {String} title The name of the message.
 * @param {String} date The message body.
 * @param {String} tt Additional data required by OSC clients.
 */
AcequiaClients.prototype.broadcast = function (from, title, data, tt) {
    var i;
    for (i in this.clients) {
        if (i !== from) {
            this.clients[i].send(from, title, data, tt);
        }
    }
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
        throw new Error("A client with this name (" + client.name + ") already exists");
    }
    this.clients[client.name] = client;
};

/**
 * Drops a client from the server (they disconnect, timeout, error, etc.)
 * @param {String} name The name of the client to remove
 * @param {String} reason The reason that the client was dropped.
 */
AcequiaClients.prototype.remove = function (name, reason) {
    if (name in this.clients) {
        logger.debug("Dropped client " + name + " from server.  Reason: " + reason);
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
exports.WebSocketClient = WebSocketClient;
exports.OSCClient = OSCClient;
exports.TCPClient = TCPClient;
exports.AcequiaClients = AcequiaClients;