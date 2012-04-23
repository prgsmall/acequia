var acequia = require('./lib/acequia');

var start = function () {
    var acequiaServer = acequia.createServer();
    acequiaServer.start();
};

start();
