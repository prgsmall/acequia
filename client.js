/**
 *  client
 *
 *  Created by Peter R. G. Small on 2011-09-20.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports */

var TYP_OSC = 0,
    TYP_WS = 1;

/**
 * The base class for all acequia clients.
 */
AcequiaClient = function (name, prot) {
    this.name = name;
    this.protocol = prot;
    this.lastMessage = (new Date()).getTime();
};
AcequiaClient.prototype.equals = function (prot) {
    return (this.protocol === prot);
};

/**
 * Defines the client connected to acequia via Websockets
 * @param {String} name The unique user name associated with the client.
 * @param {String} id The id assigned to the connection by the websocket
 * server
 */

WebSocketClient = function (name, id) {
    this.id = id;
    AcequiaClient.call(this, name, TYP_WS);
};
WebSocketClient.prototype = new AcequiaClient;
WebSocketClient.prototype.equals = function (prot, id) {
    return (this.protocol === prot &&
            this.id === id);
};

/**
 * Defines the client connected to acequia via an OSC connection
 * @param {String} name The unique user name associated with the client.
 * @param {String} ip The ip address associated with the client.
 * @param {Integer} portIn The port that messages will be coming into acequia
 * from the client;
 * @param {Integer} portOut The port that messages will be going out from acequia
 * to the client;
 */
OSCClient = function (name, ip, portIn, portOut) {
    this.ip = ip;
    this.portIn = portIn;
    this.portOut = portOut;
    AcequiaClient.call(this, name, TYP_OSC);
};
OSCClient.prototype = new AcequiaClient;
OSCClient.prototype.equals = function (prot, ip, portIn) {
    return (this.protocol === prot &&
            this.ip === ip         &&
            this.portIn === portIn);
};

// Export the entities that Acequia needs
exports.TYP_OSC = TYP_OSC;
exports.TYP_WS = TYP_WS;
exports.WebSocketClient = WebSocketClient;
exports.OSCClient = OSCClient;