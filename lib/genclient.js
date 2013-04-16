/*globals require exports process*/

var UglifyJS = require("uglify-js");
var fs  = require("fs");
var Buffer = require('buffer').Buffer;

/**
 * Reads the client-side files and concatenate them into a single file
 * @returns {String} the concatenated file
 */
var concatenateClientFiles = function () {
    var buffer, code = "", fd, stats, i, size = 0, file, 
    files = ["msg.js", "client/AcequiaClient.js", "client/ClientStore.js"];
    
    for (i in files) {
        file = __dirname + "/" + files[i];
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
 * Returns the minified version of the client code.
 * @param {String} code The full client codfe.
 * @return {String} The minified client code.
 */
var minifyClientFiles = function (code) {
    return UglifyJS.minify(code, {fromString: true}).code;
};

/**
 * Generates the client code for the server to serve up.
 */
exports.generateClientCode = function () {
    var full = concatenateClientFiles(), 
    minified = minifyClientFiles(full);

    return {
        full: full,
        minified: minified
    };
};