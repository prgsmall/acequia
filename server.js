var acequia = require('./lib/acequia');

var START = function () {
    var acequiaServer = acequia.createServer();
    acequiaServer.start();
};

var start = function () {
    setTimeout(START, 20000);
}

start();
