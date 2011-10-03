/**
 *  client
 *
 *  Created by Peter R. G. Small on 2011-09-20.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports */

var TYP_OSC = "OSC",
    TYP_WS = "WEBSOCKET",
    TYPE_AJAX = "AJAX";

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

WebSocketClient.prototype.send = function(from, title, body) {
    var msgBody = JSON.stringify({'from' : from, 'title' : title, 'body' : body});
    this.server.send(this.id, msgBody);
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

OSCClient.prototype.send = function(from, title, body, tt) {
    var data = [from].concat(body),
    oscMsg = osc.newOsc(title, 's' + tt, data),
    buffer = osc.oscToBuffer(oscMsg);
    
    this.server.send(buffer, 0, buffer.length, this.portOut, this.ip);
    this.update();
};


// Export the entities that Acequia needs
exports.TYP_OSC = TYP_OSC;
exports.TYP_WS = TYP_WS;
exports.WebSocketClient = WebSocketClient;
exports.OSCClient = OSCClient;