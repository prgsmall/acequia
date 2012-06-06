/**
 *  utils
 *
 *  Created by Peter R. G. Small on 2011-12-04.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global require exports module */

var path = require('path');
var fs   = require('fs');

/**
 * Creates a directory by recursively creating any members in the path that are missing.
 * @param {String} p The path to create.
 * @param {Number} mode The permissions to set on the directory. [optional]
 * @param {Function} cb A callback to be called when the directory is created. [optional] 
 */
var mkdir_p = function (p, mode, cb) {
    mode = mode || 0777;
    cb = cb || function () {};
    
    p = path.resolve(p);

    fs.mkdir(p, mode, function (er) {
        if (!er) {
            return cb();
        }
         
        switch (er.code) {
        case 'ENOENT':
            mkdir_p(path.dirname(p), mode, function (er) {
                if (er) {
                    cb(er);
                } else {
                    mkdir_p(p, mode, cb);
                }
            });
            break;

        case 'EEXIST':
            fs.stat(p, function (er2, stat) {
                // if the stat fails, then that's super weird.
                // let the original EEXIST be the failure reason.
                if (er2 || !stat.isDirectory()) {
                    cb(er);
                } else if ((stat.mode & 0777) !== mode) {
                    fs.chmod(p, mode, cb);
                } else {
                    cb();
                }
            });
            break;

        default:
            cb(er);
            break;
        }
    });
};

module.exports.mkdirp = mkdir_p;

/**
 * Creates an event callback by wrapping the object with a closure.
 * @param {Object} obj The object the wrap with a closure.
 * @param {String} func The name of the object's function to call.
 * @returns {Function} The callback function.
 */
module.exports.objCallback = function (obj, func) {
    return function () {
        obj[func].apply(obj, arguments);
    };
};

/**
 * Creates a deep copy of an object
 * @param {Object} obj the object to be copied.
 @returns {Object} a copy of obj.
 */
var deep_copy = function (obj) {
    var out, i;
    if (Object.prototype.toString.call(obj) === '[object Array]') {
        out = [];
        for (i = 0; i < obj.length; i += 1) {
            out[i] = deep_copy(obj[i]);
        }
        return out;
    }
    
    if (obj && typeof obj === 'object') {
        out = {};
        for (i in obj) {
            out[i] = deep_copy(obj[i]);
        }
        return out;
    }
    return obj;
};

module.exports.deepCopy = deep_copy;

/**
 * Generates a globally unique id, as a string.
 * @returns {String} The globally unique id.
 */
module.exports.uid = function () {
    var S4 = function () {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
};
