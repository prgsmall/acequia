/*globals require exports process*/

var jsp = require("uglify-js").parser;
var pro = require("uglify-js").uglify;
var fs  = require("fs");
var util = require("util");
var Buffer = require('buffer').Buffer;

var fullCode = "";
var minifiedCode = "";

/**
 * Reads the client-side files and concatenate them into a single file
 * @returns {String} the concatenated file
 */
var concatenateClientFiles = function () {
    var buffer, code = "", fd, stats, i, size = 0, file, files = ["msg.js", "client/acequiaClient.js"];
    
    for (i in files) {
        file = process.cwd() + "/lib/" + files[i];
        stats = fs.statSync(file);
        buffer = new Buffer(stats.size);
        
        fd = fs.openSync(file, "r");
        size += fs.readSync(fd, buffer, 0, stats.size, null);
        fs.close(fd);
        
        code += buffer.toString("utf8");
    }
    
    return code;
};

/**
 * Write the code generated in concatenateClientFiles to two files:
 * one as is, the other minified.
 * @param {String} code The code to write out.
 * @param {String} distDir The directories where the files should be written.
 */
var writeClientFiles = function (code, distDir) {
    var fd, ast;
    
    // Write the non-minified version
    fd = fs.openSync(distDir + "acequia.js", "w");
    fs.writeSync(fd, code, 0);
    fs.close(fd);

    // Minify the code 
    ast = jsp.parse(code);
    ast = pro.ast_mangle(ast);
    ast = pro.ast_squeeze(ast);
    minifiedCode = pro.gen_code(ast); 

    // Write the minified version
    fd = fs.openSync(distDir + "acequia.min.js", "w");
    fs.writeSync(fd, minifiedCode, 0);
    fs.close(fd);
};

/**
 * Generates the client code for the server to serve up.
 */
exports.generateClientCode = function () {
    var distDir;

    distDir = process.cwd() + "/lib/dist/";
    fs.mkdir(distDir, 0777);
    
    fullCode = concatenateClientFiles();
    writeClientFiles(fullCode, distDir);
};

exports.code = fullCode;
exports.minifiedCode = minifiedCode;