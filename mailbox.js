/**
 *  MailboxServer
 *
 *  Created by Peter R. G. Small on 2011-10-01.
 *  Copyright (c) 2011 PRGSoftware, LLC. All rights reserved.
 */

/*globals console require */

var url = require("url");
var http = require("http");
var querystring = require("querystring");
var log4js = require('../vendor/log4js-node');
var logger = log4js.getLogger("mailbox");
var msg = require("./msg.js");
var ac = require("./client.js");

/**
 * Constructor for MailboxServer
 */
var MailboxServer = function (port, clients) {
    this.mailboxes = {};
    this.clients = clients;
    this.server = this.createServer(port);
};

MailboxServer.prototype.createServer = function (port) {
    logger.debug("httpServer is listening on port " + port);
    return http.createServer(this.onRequest).listen(port);
};

MailboxServer.prototype.onRequest = function (request, response) {

    var pathName = url.parse(request.url, true).pathname,
        postData = "", client, m;
    console.log("HTTP server received " + pathName);
    
    request.setEncoding("utf8");
    
    request.addListener("data", function (postDataChunk) {
        postData += postDataChunk;
        console.log("Received POST data chunk '" + postDataChunk + "'.");
    });

    request.addListener("end", function () {
        response.writeHead(200, {"Content-Type": "text/plain"});
        
        var message = JSON.parse(querystring.parse(postData).msg);
        
        switch (message.name) {
        case MSG_CONNECT:
            client = new ac.HttpClient(message.from, this.server);
            try {
                this.clients.add(client);
                client.send("SYS", MSG_CONNECT, 1);
            } catch (e) {
                m = new msg.AcequiaMessage("SYS", MSG_CONNECT, -1);
                response.end(m.toString());
            }        
            break;
            
        case MSG_DISCONNECT:
            break;
        
        case MSG_GETCLIENTS:
            break;
        
        default:
            break;
        }

    });
};

MailboxServer.prototype.onmessage = function (data) {
    
};

MailboxServer.prototype.send = function (userName, message) {
    this.mailboxes[userName].append(message);
};

MailboxServer.prototype.createMailbox = function (userName) {
    this.mailboxes[userName] = [];
};

MailboxServer.prototype.readMailbox = function () {
    var ret = JSON.stringify(this.mailboxes);
    this.mailboxes.clear();
    return ret;
};

 

