/*globals exports require process*/
var net = require('net');

var getIPFromSocket = function (callback) {
    var socket = net.createConnection(80, 'www.google.com');
    socket.on('connect', function () {
        callback(null, socket.address().address);
        socket.end();
    });
    socket.on('error', function (e) {
        callback(e, null);
    });
};               

var getNetworkIP = function (callback, bypassCache) {
    try {        
        var cached, command, filterRE,
        exec = require('child_process').exec,
        ignoreRE = /^(127\.0\.0\.1|::1|fe80(:1)?::1(%.*)?)$/i;

        // TODO: implement for OSs without ifconfig command
        if (process.platform === "darwin") {
            command = 'ifconfig';
            filterRE = /\binet\s+([^\s]+)/g;
        } else {
            command = 'ifconfig';
            filterRE = /\binet\b[^:]+:\s*([^\s]+)/g;
        }

        // get cached value
        if (cached && !bypassCache) {
            callback(null, cached);
            return;
        }
        
        // system call
        exec(command, function (error, stdout, sterr) {
            var i, l, ips = [], 
            matches = stdout.match(filterRE);
    
            if (matches) {
                // JS has no lookbehind REs, so we need a trick
                for (i = 0; i < matches.length; i += 1) {
                    ips.push(matches[i].replace(filterRE, '$1'));
                }

                // filter BS
                for (i = 0, l = ips.length; i < l; i += 1) {
                    if (!ignoreRE.test(ips[i])) {
                        cached = ips[i];
                        callback(error, ips[i]);
                        return;
                    }
                }
            } else {
                getIPFromSocket(callback);
            }
            // nothing found
            callback(error, null);
        });
    } catch (e) {
        getIPFromSocket(callback);
    }
};

exports.getNetworkIP = getNetworkIP;
exports.getIPFromSocket = getIPFromSocket;
