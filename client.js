/**
 *  client
 *
 *  Created by Peter R. G. Small on 2011-09-20.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require  */

var log4js = require('./vendor/log4js-node'),
    msg = require("./msg.js"),
    osc = require("./libs/osc.js");

var TYP_OSC = "OSC",
    TYP_WS = "WEBSOCKET",
    TYPE_AJAX = "AJAX";

var logger = log4js.getLogger("client");

/**
 * The base class for all acequia clients.
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

AcequiaClient.prototype.update = function (prot) {
    this.lastMessage = (new Date()).getTime();
};

/**
 * Defines the client connected to acequia via Websockets
 * @param {String} name The unique user name associated with the client.
 * @param {String} id The id assigned to the connection by the websocket
 * @param {Object} server The WebSocketServer that will be used to send the message.
 * server
 */
var WebSocketClient = function (name, id, server) {
    this.id = id;
    AcequiaClient.call(this, name, TYP_WS, server);
};
WebSocketClient.prototype = new AcequiaClient();

WebSocketClient.prototype.equals = function (prot, id) {
    return (this.protocol === prot &&
            this.id === id);
};

WebSocketClient.prototype.send = function (from, name, body) {
    var message = new msg.AcequiaMessage(from, name, body);
    this.server.send(this.id, message.toString());
    this.update();
};


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

/**
 * Object that holds the list of clients and performs operations on
 * the clients.  This list of clients is an associative array, indexed by the name of
 * the client, making the name of the client unique.
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
        throw new Error("A client with this name already exists");
    }
    this.clients[client.name] = client;
};

/**
 * Drops a client from the server (they disconnect, timeout, error, etc.)
 * @param {String} name 
 */
AcequiaClients.prototype.remove = function (name, reason) {
    if (name in this.clients) {
        logger.debug("Dropped client " + name + " from server.  Reason:" + reason);
        delete this.clients[name];
    } else {
        logger.warn("Attempted to remove a client that does not exist.");
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
exports.TYP_WS = TYP_WS;
exports.WebSocketClient = WebSocketClient;
exports.OSCClient = OSCClient;
exports.AcequiaClients = AcequiaClients;