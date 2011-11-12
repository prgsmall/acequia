var jsp = require("uglify-js").parser;
var pro = require("uglify-js").uglify;
var fs  = require("fs");
var util = require("util");
var Buffer = require('buffer').Buffer;

var concatenateClientFiles = function (distDir) {
    var buffers = [], uber, fd, stats, i, size = 0, file, files = ["msg.js", "client/acequiaClient.js"];
    
    for (i in files) {
        file = process.cwd() + "/lib/" + files[i];
        stats = fs.statSync(file);
        buffers.push(new Buffer(stats.size));
        
        fd = fs.openSync(file, "r");
        size += fs.readSync(fd, buffers[i], 0, stats.size, null);
        fs.close(fd);
    }
    
    uber = "";
    for (i in buffers) {
        uber += buffers[i].toString("utf8");
    }
    
    fd = fs.openSync(distDir + "acequia.js", "w");
    fs.writeSync(fd, uber, 0);
    fs.close(fd);
    
    return uber;
};

var minifyClientFiles = function (code, distDir) {
    var ast = jsp.parse(code);
    ast = pro.ast_mangle(ast);
    ast = pro.ast_squeeze(ast);
    var final_code = pro.gen_code(ast); 

    fd = fs.openSync(distDir + "acequia.min.js", "w");
    fs.writeSync(fd, final_code, 0);
    fs.close(fd);
};

exports.generateClientCode = function () {
    var distDir = process.cwd() + "/lib/dist/";
    fs.mkdir(distDir, 0777);
    
    var code = concatenateClientFiles(distDir);
    minifyClientFiles(code, distDir);
};