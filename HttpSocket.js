/**
 *  HttpSocket
 *  This class defines a "HttpSocket" that has the exact same interface as 
 *  WebSocket, but uses a polling ajax call to retrieve data from a server.
 *  To use this to communicate with a server, create an instance of SocketServer,
 *  set the event handlers (onopen, onerror, onclose, onmessage).
 *
 *  Created by Peter R. G. Small on 2011-10-01.
 *  Copyright (c) 2010 Detector Networks International, LLC. All rights reserved.
 */

/*global $ Utils clearInterval clearTimeout setInterval setTimeout console*/

/**
 * {Integer} The number of millisconds to wait when attempting to reconnect following
 * an error.
 */
var DISCONNECT_INTERVAL = 3000;

/**
 * Constructor for HttpSocket
 * @param {String} url The url of the "socket" connection.
 * @param {Integer} refreshInterval The number of milliseconds to wait to
 * send a keep-alive message to the server.
 */
var HttpSocket = function (url, refreshInterval) {
    this.url              = url;
    this.refreshInterval  = Utils.setIfDefined(refreshInterval, 50);
    this.intervalId       = 0;
    this.timeoutID        = 0;

    this.onopen = null;
    this.onerror = function () {};
    this.onclose  = function () {};
    this.onmessage = function () {};
    
    // Start an interval that lasts 1 second to simulate an onopen event
    this.elapsed = 0;
    this.intervalId = setInterval(this.waitForOnOpen, 20);
};

/**
 * Polls the server to get messages
 * @param {Integer} interval The number of milliseconds to set the timeout to.
 */
HttpSocket.prototype.poll = function (interval) {
    clearTimeout(this.timeoutID);
    
    if (typeof interval === "undefined") {
        interval = this.refreshInterval;
    }
    this.timeoutID = setTimeout(Utils.objCallback(this, "send"), interval);
};

/**
 * This method simulates a socket connection by calling the onopen handler,
 * if there is one.
 */
HttpSocket.prototype.waitForOnOpen = function () {
    this.elapsed += 20;
    if (this.onopen) {
        clearInterval(this.intervalId);
        this.onopen();
        this.poll();
    } else if (this.elapsed >= 1000) {
        clearInterval(this.intervalId);
        this.poll();
    }
};

/**
 * Closes the "connection" by stopping the repetitive polling of the url
 */
HttpSocket.prototype.close = function () {
    clearInterval(this.intervalId);
    clearTimeout(this.timeoutID);
    this.onclose();
};

/**
 * Sends the data to the server
 * @param {Array} data The data to send to the server, of the form of an array
 * of objects which contain two members "name" and "value".
 */
HttpSocket.prototype.send = function (data) {
    if (typeof(data) === "undefined") {
        data = [];
    }

    $.ajax({
        url: this.url,
        dataType: 'text',
        data: data,
        success: Utils.objCallback(this, "handleSuccess"),
        error:   Utils.objCallback(this, "handleError")
    });
};

/**
 * Handles the error from the ajax request.  Calls the onerror event handler.
 * @param {XMLHttpRequest} xhr The xml http request object.
 * @param {String} status The status of the ajax call.
 * @param {String} errorThrown The error that was thrown on the server.
 */
HttpSocket.prototype.handleError = function (xhr, status, errorThrown) {
    var errorText = this.getErrorText(xhr, errorThrown);
    
    console.error(errorText);
    this.onerror({data: errorText});
    this.poll(DISCONNECT_INTERVAL);
};

/**
 * Builds an error string from the data supplied by errorHnadler
 * @param {XMLHttpRequest} xhr The xml http request object.
 * @param {String} errorThrown The error that was thrown on the server.
 */
HttpSocket.prototype.getErrorText = function (xhr, errorThrown) {
    if (typeof errorThrown === "undefined") {
        if (xhr.responseText) {
            return xhr.responseText;
        } else {
            return xhr.status + " error.  " + xhr.statusText;
        }
    } else {
        return errorThrown;
    }
};

/**
 * Processes the response from the ajax call.  Calls the onmessage event handler.
 * @param {String} response The data sent from the server.
 * @param {String} status The status of the ajax call.
 * @param {XMLHttpRequest} xhr The xml http request object.
 */
HttpSocket.prototype.handleSuccess = function (response, status, xhr) {
    var errorText;

    if (xhr.status !== 0) {
        this.onmessage({data: response});
        this.poll();
    } else {
        this.handleError(xhr, status, "Disconnected from server");
    }
};
