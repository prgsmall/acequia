var acequia = require('./lib/acequia');

var START = function () {
    var acequiaServer = acequia.createServer();
    acequiaServer.start();
};

var start = function () {
    var timeout = 0;
    // If you want to debug via node-inspector, uncomment the following line:
    // timeout = 20000;
    
    setTimeout(START, timeout);
}

start();
