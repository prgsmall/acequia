/**
 *  utils
 *
 *  Created by Peter R. G. Small on 2011-12-04.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global require exports */

var path = require('path');
var fs   = require('fs');

module.exports.mkdirp = function (p, mode, cb) {
    mode = mode || 0777;
    cb = cb || function () {};
    
    p = path.resolve(p);

    fs.mkdir(p, mode, function (er) {
        if (!er) {
            return cb();
        }
         
        switch (er.code) {
        case 'ENOENT':
            mkdirp(path.dirname(p), mode, function (er) {
                if (er) {
                    cb(er);
                } else {
                    mkdirp(p, mode, cb);
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

/**
 * Creates an event callback by wrapping the object with a closure.
 * @param {Object} obj The object the wrap with a closure.
 * @param {String} func The name of the object's function to call.
 * @returns{Function} The callback function.
 */
module.exports.objCallback = function (obj, func) {
    return function () {
        obj[func].apply(obj, arguments);
    };
};
