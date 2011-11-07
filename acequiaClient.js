/*global document console io msg*/

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
 * @param {String} uri The uri of the connection to the WebSocket.
 * @param {String} userName The user name, used to uniquely identify this user.
 */
var AcequiaClient = function (uri, userName) {
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
        for (idx in m_connectionChangeHandlers) {
            m_connectionChangeHandlers[idx](connected);
        }
    };
    
    this.uri = uri;
    this.userName = userName;
    this.socket = null;
    
    this.listeners = {};
};

AcequiaClient.prototype.getSocketIOJS = function (onload) {
    var fileref = document.createElement('script');
    fileref.setAttribute("type","text/javascript");
    fileref.setAttribute("src", this.uri + "/socket.io/socket.io.js");
    fileref.onload = onload;
    document.body.appendChild(fileref)
}

/**
 * Adds a listener for the message with the message name.
 * @param {String} msgName The name of the message to listen to.
 * @param {Function} callback The callback function which will be called when the
 * message arrives.
 */
AcequiaClient.prototype.addMessageListener = function (msgName, callback) {
    if (!(msgName in this.listeners)) {
        this.listeners[msgName] = [];
    }

    this.listeners[msgName].push(callback);
};

/**
 * Adds a listener for the message with the message name.
 * @param {String} msgName The name of the message to listen to.
 * @param {Function} callback The callback function which will be called when the
 * message arrives.
 */
AcequiaClient.prototype.removeMessageListener = function (msgName, callback) {
    var idx = this.listeners[msgName].indexOf(callback);
    this.listeners[msgName].splice(idx, 1);
};

/**
 * Connects to the Acequia server by creating a new web socket connection;
 */
AcequiaClient.prototype.connect = function () {
    var onload = function(that) {
        return function (evt) {
            that.socket = io.connect(that.uri);
            that.socket.on("connect", objCallback(that, "onConnect"));
        };
    };
    
    if (!this.socket || (!this.socket.socket.connected && !this.socket.socket.connecting)) {
        this.getSocketIOJS(onload(this));
    }
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
 * @param {String} to The name of the client that will receive the message.
 */
AcequiaClient.prototype.send = function (msgName, body, to) {
    if (msgName !== msg.MSG_CONNECT && !this.isConnected()) {
        console.error("AcequiaClient.send " + msgName + ": client is not connected");
    } else {
        var message = new msg.AcequiaMessage(this.userName, msgName, body, to);
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
    this.send(msg.MSG_CONNECT);
};

/**
 * Handles the onclose event from the WebSocket.  This method sets the WebSocket
 * member to null.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onDisconnect = function (evt) {
    this.setConnected(false);
    this.socket = null;
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
 * Calls the message listeners for the given msgName.
 * @param {AcequiaMessage} msg The message to send.
 * @param {String} msgName The name of the message to look for in the listeners.
 */
AcequiaClient.prototype.callListeners = function (message, msgName) {
    var i;
    
    if (typeof(msgName) === "undefined") {
        msgName = message.name;
    }
    
    if (msgName in this.listeners) {
        for (i in this.listeners[msgName]) {
            this.listeners[msgName][i](message, this);
        }
    }    
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
    
    // Call the message listeners.
    this.callListeners(message);

    // Call the wildcard message listeners.
    this.callListeners(message, "*");
};
