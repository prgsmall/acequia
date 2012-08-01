var acequia = require('./lib/acequia');
var options = {};

var START = function () {
    var acequiaServer = acequia.createServer(options);
    acequiaServer.start();
};

var start = function () {
    var i, timeout = 0;
    
    process.argv.forEach(function (val, index, array) {
        if (val === "--debug") {
            timeout = 20000;
            options["minify_client"] = false;
        }
    });
    
    setTimeout(START, timeout);
}

start();
