/*globals exports require */
var net = require('net');

var getNetworkIP = function (callback) {
    var socket = net.createConnection(80, 'www.google.com');
    socket.on('connect', function () {
        callback(undefined, socket.address().address);
        socket.end();
    });
    socket.on('error', function (e) {
        callback(e, 'error');
    });
};

exports.getNetworkIP = getNetworkIP;