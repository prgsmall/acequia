/**
 *  datastore
 *
 *  Created by Peter R. G. Small on 2011-12-04.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require process */

var fs     = require("fs"),
    path   = require("path"),
    URL    = require("url"),
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
    var client, body, changeMessage = this.changedMessage(message.body[0].path);
    
    // Subscribe the referenced client to the msg.MSG_DS_CHANGED message
    client = this.acequiaServer.acequiaClients.get(message.from);
    client.subscribe(changeMessage);
    
    // Send out an initial dataStoreChanged message to the client with the data that they requested
    body = {
        path: message.body[0].path,
        value: this.objectFromPath
    };
    this.acequiaServer.send("datastore", changeMessage, body, message.from);
};

/**
 * Sends a series of change events starting at the top level down through the specific 
 * piece that changed.
 * @param {String} path The path in the datastore that changed.
 */
DatastoreBase.prototype.sendChangeEvents = function (path) {
    // Loop through the path and send the MSG_DS_CHANGED event for each piece
    var i, parts = path.split("/"), msg_path = "", obj = this.datastore;
    for (i = 0; i < parts.length; i += 1) {
        msg_path += "/" + parts[i];
        obj = obj[parts[i]];
        this.acequiaServer.send("datastore", 
                                 this.changedMessage(msg_path),
                                 {path: msg_path,
                                  value: obj});
    }
};

/**
 * Handler for the UpdateDataStore message.
 * @param {Object} message The message received by the system.
 */
DatastoreBase.prototype.onUpdateDataStore = function (message) {
    if (this.updateInProgress) {
        // TODO:  Queue up the change to be applied and apply them when writing is complete
        this.queueMessage(message);
    } else {
        this.setDataStoreValue(message.body[0].path, message.body[0].value);
        this.saveDatastore(message.body[0].path);
    }
};

/**
 * This method is used to create a normalized version of the path.  It removes
 * leadng and trailing "/" characters and the term "datastore/", if it is at the front
 * of the path
 * @param {String} path The path to normalize
 * @returns the normalized path
 */
DatastoreBase.prototype.normalizePath = function (path) {
    path = path.split("?")[0];
    
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

/**
 * Retrives an object from the datastore, given the path value, or null if the path
 * does not exist in the datastore.
 * @param {String} path The path to search for.
 * @returns {Object} The object found or null, if not found.
 */
DatastoreBase.prototype.objectFromPath = function (path) {
    var parts, i, obj;
    
    path = this.normalizePath(path);
    
    parts = path.split("/");
    
    for (i = 0, obj = this.datastore; obj && i < parts.length; i += 1) {
        obj = obj[parts[i]];
    }
    
    return obj;
};

/**
 * Recursively create the object in the datastore and then assign it the value
 * @param {String} path The path to search for.
 * @param {String} value The value of the data to assign
 * @returns {Object} the objct value from the datastore.
 */
DatastoreBase.prototype.setDataStoreValue = function (path, value) {
    var i, parts, cp, obj;
    
    path = this.normalizePath(path);
    parts = path.split("/");
    
    for (i = 0, obj = this.datastore; i < parts.length; i += 1) {
        if (!obj[parts[i]]) {
            obj[parts[i]] = {};
        }
        obj = obj[parts[i]];
    }
    
    cp = deepCopy(value);
    this.appendAttributes(obj, cp);
    
    return obj;
};

/**
 * Appends the set of attributes from one obect to another
 * @param {Object} dest The object to receive the attributes
 * @param {Object} src The object that is the source of the attributes.;p
 */
DatastoreBase.prototype.appendAttributes = function (dest, src) {
    for (var name in src) {
        dest[name] = src[name];
    }
};

/**
 * Creates a response to return in the REST calls.
 * @param {String} path The path that is being operated upon by the REST request.
 * @param {String} description A description of an error message
 * @returns {Object} an object containing the path, status, and description
 */
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

DatastoreBase.prototype.parseQS = function (qs) {
    var i, ret = {}, parts, pair;
    if (typeof(qs) !== "undefined") {
        parts = qs.split("&");
        for (i = 0; i < parts.length; i += 1) {
            pair = parts[i].split("=");
            ret[pair[0]] = pair[1];
        }
    }
    return ret;
};

DatastoreBase.prototype.parseUrl = function (url) {
    var urlObject = URL.parse(url), qs = this.parseQS(urlObject.query);
    return {
        path: urlObject.pathname,
        callback: qs.callback
    };
};

DatastoreBase.prototype.genResponse = function (obj, callback) {
    if (typeof(callback) === "undefined") {
        return obj;
    } else {
        return callback + "(" + JSON.stringify(obj) + ")";
    }
};

/**
 * Handler for the REST GET request
 * @param {Object} req The request object
 * @param {Object} res The response object
 */
DatastoreBase.prototype.get = function (req, res) {
    logger.debug("GET: " + req.url);
    
    var obj, urlobj;
    urlobj = this.parseUrl(req.url);
    obj = this.objectFromPath(urlobj.path);
    
    if (typeof(obj) === "undefined") {
        obj = this.createResponse(req.url, urlobj.path + " is undefined");
        res.statusCode = 404;
    }
    return res.send(this.genResponse(obj, urlobj.callback));
};

/**
 * Handler for the REST POST request
 * @param {Object} req The request object
 * @param {Object} res The response object
 */
DatastoreBase.prototype.post = function (req, res) {
    logger.debug("POST: " + req.url);
    
    var obj, urlobj;
    urlobj = this.parseUrl(req.url);
    obj = this.objectFromPath(urlobj.path);

    if (typeof(obj) !== "undefined") {
        obj = this.createResponse(req.url, "Cannot create: " + urlobj.path + ".  It is already defined.");
        res.statusCode = 404;
    } else {
        obj = this.setDataStoreValue(req.url, req.body);
        this.saveDatastore(urlobj.path);
    }
    return res.send(this.genResponse(obj, urlobj.callback));
};

/**
 * Handler for the REST PUT request
 * @param {Object} req The request object
 * @param {Object} res The response object
 */
DatastoreBase.prototype.put = function (req, res) {
    logger.debug("PUT: " + req.url);
    
    var obj, urlobj;
    urlobj = this.parseUrl(req.url);
    obj = this.objectFromPath(urlobj.path);

    if (typeof(obj) !== "undefined") {
        this.appendAttributes(obj, req.body);
    } else {
        obj = this.setDataStoreValue(req.url, req.body);
    }

    this.saveDatastore(req.url);
    
    return res.send(this.genResponse(obj, urlobj.callback));
};

/**
 * Handler for the REST DELETE request
 * @param {Object} req The request object
 * @param {Object} res The response object
 */
DatastoreBase.prototype.del = function (req, res) {
    logger.debug("DELETE: " + req.url);
    
    var parts, i, path, 
    urlobj = this.parseUrl(req.url),
    obj = this.objectFromPath(urlobj.path);
    
    if (typeof(obj) === "undefined") {
        obj = this.createResponse(req.url, req.url + " is undefined.");
        res.statusCode = 404;
    } else {
        path = this.normalizePath(req.url);
        parts = path.split("/");

        for (i = 0, obj = this.datastore; i < parts.length - 1; i += 1) {
            obj = obj[parts[i]];
        }        

        delete obj[parts[i]];
        
        this.saveDatastore(req.url);
        obj = this.createResponse(req.url);
    }
    
    return res.send(this.genResponse(obj, urlobj.callback));
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
