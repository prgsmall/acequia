/**
 *  datastore
 *
 *  Created by Peter R. G. Small on 2011-12-04.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*global exports require process console */

var ac     = require("./client"),
    fs     = require("fs"),
    msg    = require("./msg"),
    path   = require("path"),
    mkdirp = require("./utils").mkdirp;

/*    
        name: setDataStoreValue
        body: [
            {
            namespace: "a namespace value",
            name: param name
            value: "the data values"
            },
            ...
        ]

        name: setDataStoreValueResponse
        from: datastore
        body: [
            {
            status: SUCCESS/FAIL
            }
        ]


        name: getDataStoreValue
        body: [
            {
            namespace: "a namespace value",
            name: param name
            },
            ...  (there can be multiple values to retrieve
        ]
        
        name: getDataStoreValueResponse
        from: datastore
        body: [
            {
            status: SUCCESS/FAIL
            namespace: "a namespace value",
            name: param name
            value:  The data value read from the data store.
            },
            ...  (there can be multiple values to retrieve)
        ]
*/

var datastore = {};

var datastoreFile = path.join(process.cwd(), "datastore", "acequia.ds");

var acequiaClients = null;

var onWriteFile = function (err, to) {
    if (err) {
        console.error("onWriteFile error %s", err);
    }

    // Send the response message
    var message, response = {};
    response.status = err ? "FAIL" : "SUCCESS";
    message = new msg.AcequiaMessage("datastore", "setDataStoreValueResponse", response, to);
    
    acequiaClients.sendTo(message);
};

var onSetDataStoreValue = function (message) {
    var i, data, callback;
    for (i in message.body) {
        data = message.body[i];
        if (!(data.namespace in datastore)) {
            datastore[data.namespace] = {};
        }
    
        datastore[data.namespace][data.name] = data.value;
    }

    // Write the local datastore to the file system.  Create a callback that will send
    // a response when the datastore has been written.
    callback = function (to) {
        return function (err) {
            onWriteFile(err, to);
        };
    }(message.from);
    
    fs.writeFile(datastoreFile, JSON.stringify(datastore), "utf8", callback);
};

var onGetDataStoreValue = function (message) {
    var i, data, body = [], response, reply;
    for (i in message.body) {
        data = message.body[i];
        response = {};
        response.name = data.name;
        try {
            response.value = datastore[data.namespace][data.name];
            response.status = "SUCCESS";
        } catch (e) {
            response.value = null;
            response.status = "FAIL";
        }
        body.push(response);
    }
    
    reply = new msg.AcequiaMessage("datastore", "getDataStoreValueResponse", body, message.from);
    acequiaClients.sendTo(reply);
};

var onReadFile = function (err, data) {
    if (err) {
        console.error(err);
    } else {
        datastore = JSON.parse(data);
    }
};

exports.init = function (clients) {
    acequiaClients = clients;
    
    ac.msgEmitter.addListener("setDataStoreValue", onSetDataStoreValue);
    ac.msgEmitter.addListener("getDataStoreValue", onGetDataStoreValue);

    mkdirp(path.join(process.cwd(), "datastore"));
    
    fs.readFile(datastoreFile, onReadFile);
};
