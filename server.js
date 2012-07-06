var acequia = require('./lib/acequia');

var START = function () {
    var acequiaServer = acequia.createServer();
    acequiaServer.start();
};

var start = function () {
    var i, timeout = 0;
    
    process.argv.forEach(function (val, index, array) {
        if (val === "--debug") {
            timeout = 20000;
        }
    });
    
    setTimeout(START, timeout);
}

start();
