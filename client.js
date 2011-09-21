/**
 *  client
 *
 *  Created by Peter R. G. Small on 2011-09-20.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports */

var WebSocketClient = function (name, id, prot) {
    this.name = name;
    this.id = id;
    this.protocol = prot;
    this.lastMessage = (new Date()).getTime();
};

var OSCClient = function (name, ip, portIn, portOut, prot) {
    this.name = name;
    this.ip = ip;
    this.portIn = portIn;
    this.portOut = portOut;
    this.protocol = prot;
    this.lastMessage = (new Date()).getTime();
};

exports.WebSocketClient = WebSocketClient;
exports.OSCClient = OSCClient;