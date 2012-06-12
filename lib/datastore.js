/**
 *  datastore
 *
 *  Created by Peter R. G. Small on 2011-12-04.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require process */

var fs     = require("fs"),
    path   = require("path"),
    msg = require("./msg"),
    mkdirp = require("./utils").mkdirp,
    deepCopy = require("./utils").deepCopy,
    objCallback = require("./utils").objCallback;
    
var logger = require('log4js').getLogger("datastore");

/*    
    name: ACEQUIA_SUBSCRIBEDATASTORE
    body: [
        {
        path: "the/path/to/the/entry/to/subscribe"
        }
    ]

    name: ACEQUIA_DATASTORECHANGED
    from: datastore
    body: [
        {
        path: "the/path/to/the/entry/to/retrieve"
        value:  The data value read from the data store {Object}
        }
    ]
    
    name: ACEQUIA_UPDATEDATASTORE
    body: [
        {
        path: "the/path/to/the/entry/to/update/or/create",
        value: "the data values"
        },
        ...
    ]
*/

/**
 * Defines the base class for all datastore classes
 * @param {Object} acequiaServer The instance of AcequiaServer to use to send 
 * and register for messages
 */
var DatastoreBase = function () {
    this.updateInProgress = false;    
    this.datastore = {};
};

/**
 * Initializes the datastore
 */
DatastoreBase.prototype.init = function (acequiaServer) {
    this.acequiaServer = acequiaServer;
    
    this.loadDatastore();
    
    this.acequiaServer.on(msg.MSG_SUBSCRIBE_DS, objCallback(this, "onSubscribeDataStore"));
    this.acequiaServer.on(msg.MSG_UPDATE_DS,    objCallback(this, "onUpdateDataStore"));    
};

/**
 * Loads the datastore into the object model.  This must be overridden by any class
 * that derives from DatastoreBase.
 */
DatastoreBase.prototype.loadDatastore = function () {
    throw new Error("loadDatastore NOT IMPLEMENTED");
};

/**
 * Saves the datastore to the persistent storage device.  This must be overridden 
 * by any class that derives from DatastoreBase.
 */
DatastoreBase.prototype.saveDatastore = function (path) {
    throw new Error("saveDatastore NOT IMPLEMENTED");
};

/**
 * Creates a changed messsage by combining the MSG_DS_CHANGED with the path value
 * @param {String} path The path to the location in the datastore.
 * @returns {String} the change message.
 */
DatastoreBase.prototype.changedMessage = function (path) {
    return msg.MSG_DS_CHANGED + ":" + this.normalizePath(path);
};

/**
 * Message handler for the MSG_SUBSCRIBE_DS message.  This will register the client
 * to receive the change message.
 * @param {Object} message The message received.
 */
DatastoreBase.prototype.onSubscribeDataStore = function (message) {
    var client, body, changeMessage = this.changedMessage(message.path);
    
    // Subscribe the referenced client to the msg.MSG_DS_CHANGED message
    client = this.acequiaServer.acequiaClients.get(message.from);
    client.subscribe(changeMessage);
    
    // Send out an initial dataStoreChanged message to the client with the data that they requested
    body = {
        path: message.path,
        value: this.objectFromPath
    };
    this.acequiaServer.send("datastore", changeMessage, body, message.from);
};

/**
 * Sends a series of change events
 */
DatastoreBase.prototype.sendChangeEvents = function (path) {
    // Loop through the path and send the MSG_DS_CHANGED event for each piece
    var i, parts = path.split("/"), msg_path = "", obj = this.datastore;
    for (i = 0; i < parts.length; i += 1) {
        msg_path += "/" + parts[i];
        obj = obj[parts[i]];
        this.acequiaServer.send("datastore", 
                                 this.changedMessage(path),
                                 {path: msg_path,
                                  value: obj});
    }
};

DatastoreBase.prototype.onUpdateDataStore = function (message) {
    if (this.updateInProgress) {
        // TODO:  Queue up the change to be applied and apply them when writing is complete
        this.queueMessage(message);
    } else {
        this.setDataStoreValue(message.body[0].path, message.body[0].value);
        this.saveDatastore(message.body[0].path);
    }
};

DatastoreBase.prototype.normalizePath = function (path) {
    if (path[0] === "/") {
        path = path.substring(1);
    }
    if (path[path.length - 1] === "/") {
        path = path.substring(0, path.length - 1);
    }
    if (path.indexOf("datastore/") === 0) {
        path = path.substring("datastore/".length);
    }
    return path;
};

DatastoreBase.prototype.objectFromPath = function (path) {
    var urlParts, i, obj;
    
    path = this.normalizePath(path);
    
    urlParts = path.split("/");
    
    for (i = 0, obj = this.datastore; obj && i < urlParts.length; i += 1) {
        obj = obj[urlParts[i]];
    }
    
    return obj;
};

DatastoreBase.prototype.setDataStoreValue = function (path, value) {
    // Recursively create the object and then assign it the data from the post
    var i, urlParts, cp, obj;
    
    path = this.normalizePath(path);
    urlParts = path.split("/");
    
    for (i = 0, obj = this.datastore; i < urlParts.length; i += 1) {
        if (!obj[urlParts[i]]) {
            obj[urlParts[i]] = {};
        }
        obj = obj[urlParts[i]];
    }
    
    cp = deepCopy(value);
    this.appendAttributes(obj, cp);
    
    return obj;
};

DatastoreBase.prototype.appendAttributes = function (dest, src) {
    for (var name in src) {
        dest[name] = src[name];
    }
};

DatastoreBase.prototype.createResponse = function (path, description) {
    var status = "FAIL";
    
    if (typeof description === "undefined") {
        status = "SUCCESS";
        description = "";
    }
    
    return {
        path: path,
        status: status,
        description: description
    };
};

DatastoreBase.prototype.get = function (req, res) {
    var obj = this.objectFromPath(req.url);
    
    if (typeof(obj) === "undefined") {
        obj = this.createResponse(req.url, req.url + " is undefined");
        return res.json(obj, 404);
    } else {
        return res.send(obj);
    }
};

DatastoreBase.prototype.post = function (req, res) {
    var obj = this.objectFromPath(req.url);

    if (typeof(obj) !== "undefined") {
        obj = this.createResponse(req.url, "Cannot create: " + req.url + ".  It is already defined.");
        return res.json(obj, 404);
    } else {
        obj = this.setDataStoreValue(req.url, req.body);
        this.saveDatastore(req.url);
        return res.send(obj);
    }
};

DatastoreBase.prototype.put = function (req, res) {
    var obj = this.objectFromPath(req.url);

    if (typeof(obj) !== "undefined") {
        this.appendAttributes(obj, req.body);
    } else {
        obj = this.setDataStoreValue(req.url, req.body);
    }

    this.saveDatastore(req.url);
    
    return res.send(obj);
};

DatastoreBase.prototype.del = function (req, res) {
    var urlParts, i, path, obj = this.objectFromPath(req.url);

    if (typeof(obj) === "undefined") {
        obj = this.createResponse(req.url, req.url + " is undefined.");
        return res.json(obj, 404);
    } else {
        path = this.normalizePath(req.url);
        urlParts = path.split("/");

        for (i = 0, obj = this.datastore; i < urlParts.length - 1; i += 1) {
            obj = obj[urlParts[i]];
        }        

        delete obj[urlParts[i]];
        
        obj = {
            status: req.url + " deleted"
        };

        this.saveDatastore(req.url);

        return res.send(obj);
    }
};


var FileBasedDatastore = function (server) {
    this.datastoreFile = path.join(process.cwd(), "datastore", "acequia.ds");
    DatastoreBase.call(this, server);
};
FileBasedDatastore.prototype = new DatastoreBase();

FileBasedDatastore.prototype.loadDatastore = function () {
    mkdirp(path.join(process.cwd(), "datastore"));
    
    fs.readFile(this.datastoreFile, objCallback(this, "onReadFile"));
};

DatastoreBase.prototype.saveDatastore = function (path) {
    path = this.normalizePath(path);
    
    // Write the local datastore to the file system.  Create a callback that will send
    // a response when the datastore has been written.
    var callback = (function (self, PATH) {
        return function (err) {
            self.onWriteFile(err, PATH);
        };
    }(this, path));
    
    fs.writeFile(this.datastoreFile, JSON.stringify(this.datastore), "utf8", callback);
};

FileBasedDatastore.prototype.onReadFile = function (err, data) {
    if (err) {
        if (err.code !== "ENOENT") {
            logger.error(err);
            // TODO:  Attempt to read three times
        }
        this.datastore = {};
    } else {
        this.datastore = JSON.parse(data);
    }
};

FileBasedDatastore.prototype.onWriteFile = function (err, path) {
    if (err) {
        logger.error("Unable to write to datastore: onWriteFile error %s", err);
        // TODO:  make multiple attempts
    } else {
        this.sendChangeEvents(path);
    }

    this.updateInProgress = false;
};

var fbds = new FileBasedDatastore();

exports.REST = fbds;

exports.init = function (server) {
    fbds.init(server);
};
