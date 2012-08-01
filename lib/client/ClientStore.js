/**
 *  ClientStore
 *
 *  Created by Peter R. G. Small on 2012-07-19.
 *  Copyright (c) 2012 PRGSoftware, LLC. All rights reserved.
 */

/*global $ msg */

/**
 * Constructor for ClientStore
 */
var ClientStore = function (path, acequiaClient) {
    this.path = path;
    this.acequiaClient = acequiaClient;
};

ClientStore.prototype.changedMessage = function (path) {
    return msg.MSG_DS_CHANGED + ":" + this.normalizePath(path);
};

/**
 * This method is used to create a normalized version of the path.  It removes
 * leadng and trailing "/" characters and the term "datastore/", if it is at the front
 * of the path
 * @param {String} path The path to normalize
 * @returns the normalized path
 */
ClientStore.prototype.normalizePath = function (path) {
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
 * @param {String} eventType : One of the following strings: 'value', 'child_added', 
 'child_changed', 'child_removed' or 'child_moved'.
 * @param {Function} callback : A callback that fires when the specified event occurs. 
 The callback will be passed a DataSnapshot. For ordering purposes, child_added, 
 child_changed, and child_moved will also be passed a string containing the name of 
 the previous child, by priority order (or null if it is the first child).
 */
ClientStore.prototype.on = function (eventType, callback) {
    this.acequiaClient.on(this.changedMessage(this.path), callback);
    this.subscribe();
};

ClientStore.prototype.set = function (value) {
    this.acequiaClient.send(msg.MSG_UPDATE_DS, value);
};

ClientStore.prototype.subscribe = function() {
    if (!this.acequiaClient.isConnected()) {
        this.acequiaClient.addConnectionChangeHandler(objCallback(this, "sub"));
    } else {
        this.sub();
    }
};

ClientStore.prototype.sub = function () {
    this.acequiaClient.send(msg.MSG_SUBSCRIBE_DS, {path: this.path});
};