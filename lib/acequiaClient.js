/*global document window console io msg*/

/**
 * Creates an event callback by wrapping the object with a closure.
 * @param {Object} obj The object the wrap with a closure.
 * @param {String} func The name of the object's function to call.
 * @returns{Function} The callback function.
 */
var objCallback = function (obj, func) {
    return function () {
        obj[func].apply(obj, arguments);
    };
};

/**
 * Defines the AcequiaClient object, which is used to connect with the Acequia server
 * through a WebSocket connection.
 * @param {String} clientName The name used to uniquely identify this client.
 * @param {String} uri The uri of the connection to the WebSocket. [optional]
 */
var AcequiaClient = function (clientName, uri) {
    var m_connected = false,
        m_connectionChangeHandlers = [];
    
    this.isConnected = function () {
        return m_connected;
    };
    
    this.addConnectionChangeHandler = function (handler) {
        m_connectionChangeHandlers.push(handler);
    };

    this.setConnected = function (connected) {
        var idx;
        m_connected = connected;
        for (idx = 0; idx < m_connectionChangeHandlers.length; idx += 1) {
            m_connectionChangeHandlers[idx](connected);
        }
    };
    
    this.uri = this.getURI(uri);
    this.clientName = clientName;
    this.socket = null;
    
    this.listeners = {};
    this.subscribes = [];
};

/**
 * Gets the URI for the Acequia client from window.location using the default
 * Acequia port.
 * @param {String} uri The uri passed in to the constructor of AcequiaClient.  This can
 * be either a full uri, a port number or undefined.
 * @returns {String} the URI
 */
AcequiaClient.prototype.getURI = function (uri) {
    var port = 9091, i;
    
    if (typeof(uri) !== "undefined") {
        i = parseInt(uri, 10);
        if (isNaN(i)) {
            return uri;
        } else {
            port = i;
        }
    }
    
    return window.location.protocol + "//" + window.location.hostname + ":" + port;
};

AcequiaClient.prototype.getSocketIOJS = function (onload) {
    if (typeof(io) === "undefined") {
        var fileref = document.createElement('script');
        fileref.setAttribute("type", "text/javascript");
        fileref.setAttribute("src", this.uri + "/socket.io/socket.io.js");
        fileref.onload = onload;
        document.body.appendChild(fileref);
    } else {
        onload();
    }
};

/**
 * Adds a listener for the message with the message name.
 * @param {String} msgName The name of the message to listen to.
 * @param {Function} callback The callback function which will be called when the
 * message arrives.
 */
AcequiaClient.prototype.addListener = function (msgName, callback) {
    var i, callbackFound = false;
    
    if (!(msgName in this.listeners)) {
        this.listeners[msgName] = [];
        this.listeners[msgName].push(callback);
        this.subscribes.push(msgName);
        if (this.isConnected()) {
            this.send(msg.MSG_SUBSCRIBE, msgName);
        }
    } else {
        for (i = 0; i < this.listeners[msgName].length && !callbackFound; i += 1) {
            callbackFound = (callback === this.listeners[msgName][i]);
        }
        if (!callbackFound) {
            this.listeners[msgName].push(callback);
        }
    }
};

/**
 * Adds a listener for the message with the message name.
 * @param {String} msgName The name of the message to listen to.
 * @param {Function} callback The callback function which will be called when the
 * message arrives.
 */
AcequiaClient.prototype.on = function (msgName, callback) {
    this.addListener(msgName, callback);
};

/**
 * Removes a listener for the message with the message name.
 * @param {String} msgName The name of the message to listen to.
 * @param {Function} callback The callback function which will be called when the
 * message arrives.
 */
AcequiaClient.prototype.removeListener = function (msgName, callback) {
    var idx = this.listeners[msgName].indexOf(callback);
    this.listeners[msgName].splice(idx, 1);
    
    if (this.listeners[msgName].length === 0 && this.isConnected()) {
        this.send(msg.MSG_UNSUBSCRIBE, msgName);
    }
};

/**
 * Connects to the Acequia server by creating a new web socket connection;
 * @param {String} url The URL of the acequia server to connect to 
 */
AcequiaClient.prototype.connect = function (url) {
    var onload = function (that, uri) {
        return function (evt) {
            uri = (typeof(uri) === "undefined") ? that.uri : uri;
            that.socket = io.connect(uri, {reconnect: false});
            that.socket.on("connect", objCallback(that, "onConnect"));
        };
    };
    
    this.getSocketIOJS(onload(this, url));    
};

/**
 * Sends the disconnect message to the Acequia server.
 */
AcequiaClient.prototype.disconnect = function () {
    this.send(msg.MSG_DISCONNECT);
};

/**
 * Sends the getClients message to the Acequia server.
 */
AcequiaClient.prototype.getClients = function () {
    this.send(msg.MSG_GETCLIENTS);
};

/**
 * Sends a message to the Acequia server.
 * @param {String} msgName The name of the message.
 * @param {Object} body The message body.
 */
AcequiaClient.prototype.send = function (msgName, body) {
    if (msgName !== msg.MSG_CONNECT && !this.isConnected()) {
        console.error("AcequiaClient.send " + msgName + ": client is not connected");
    } else {
        var message = new msg.AcequiaMessage(this.clientName, msgName, body);
        this.socket.send(message.toString());
    }
};

/**
 * Handles the connect event from the WebSocket.  This method sends the connect
 * message to the Acequia client.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onConnect = function (evt) {
    this.socket.on("disconnect", objCallback(this, "onDisconnect"));
    this.socket.on("message",    objCallback(this, "onMessage"));
    this.send(msg.MSG_CONNECT, this.subscribes);
};

/**
 * Handles the onclose event from the WebSocket.  This method sets the WebSocket
 * member to null.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onDisconnect = function (evt) {
//    alert("onDisconnect");
//    this.setConnected(false);
//    this.socket = null;
};

/**
 * Default message handler for messages.  If the message is the connect message
 * and the body of the message is an error code, this method returns false.
 * @param {AcequiaMessage} message The message to process.
 * @returns{boolean} False if there is an error, true otherwise.
 */
AcequiaClient.prototype.ac_onmessage = function (message) {
    var ret = true;
    if (message.name === msg.MSG_CONNECT) {

        if (message.body[0] === -1) {
            console.error('ERROR logging in: ' + message.body);
            ret = false;
        } else {
            this.setConnected(true);
        }
    } else if (message.name === msg.MSG_DISCONNECT) {
        this.setConnected(false);
        this.socket.disconnect();
    }
    
    return ret;
};

/**
 * Handles the onmessage event from the WebSocket.  This method calls any message listeners
 * that have registered for the message.  If there is a wildcard handler registered, then it
 * will call that as well.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onMessage = function (data) {
    var i, message = JSON.parse(data);

    if (!this.ac_onmessage(message)) {
        return;
    }
    
    if (message.name in this.listeners) {
        for (i = 0; i < this.listeners[message.name].length; i += 1) {
            this.listeners[message.name][i](message, this);
        }
    }    
};
