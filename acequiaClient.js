/*global WebSocket console AcequiaMessage*/

/**
 * Creates an event callback by wrapping the object with a closure.
 * @param {Object} obj The object the wrap with a closure.
 * @param {String} func The name of the object's function to call.
 * @return {Function} The callback function.
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
    var m_connected = false;
    
    this.isConnected = function () {
        return m_connected;
    };
    
    this.setConnected = function (connected) {
        var idx;
        m_connected = connected;
        for (idx in this.connectionChangeHandlers) {
            this.connectionChangeHandlers[idx](connected);
        }
    };

    this.uri = uri;
    this.userName = userName;
    this.webSocket = null;
    
    this.listeners = {};
    
    this.connectionChangeHandlers = [];
    
    // Add listeners for the connect and disconnect commands
    this.addMessageListener(AcequiaClient.CONNECT, objCallback(this, "acequia_onConnect"));
    this.addMessageListener(AcequiaClient.DISCONNECT, objCallback(this, "acequia_onDisconnect"));
};

/**
 * {String} The connect command that will be sent to and receieved from acequia.
 */
AcequiaClient.CONNECT = "/connect";

/**
 * {String} The disconnect command that will be sent to and receieved from acequia.
 */
AcequiaClient.DISCONNECT = "/disconnect";

/**
 * {String} The getClients command that will be sent to and receieved from acequia.
 */
AcequiaClient.GETCLIENTS = "/getClients";

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

AcequiaClient.prototype.addConnectionChangeHandler = function (handler) {
    this.connectionChangeHandlers.push(handler);
};

/**
 * Connects to the Acequia server by creating a new web socket connection;
 */
AcequiaClient.prototype.connect = function () {
    if (this.isConnected()) {
        console.error("AcequiaClient.connect: client is already connected");
    } else {
        this.webSocket = new WebSocket(this.uri);
        this.webSocket.onopen    = objCallback(this, "ws_onopen");
        this.webSocket.onclose   = objCallback(this, "ws_onclose");
        this.webSocket.onmessage = objCallback(this, "ws_onmessage");
        this.webSocket.onerror   = objCallback(this, "ws_onerror");
    }
};

/**
 * Sends the disconnect message to the Acequia server.
 */
AcequiaClient.prototype.disconnect = function () {
    this.send(AcequiaClient.DISCONNECT);
};

/**
 * Sends the getClients message to the Acequia server.
 */
AcequiaClient.prototype.getClients = function () {
    this.send(AcequiaClient.GETCLIENTS, this.userName);
};

/**
 * Sends a message to the Acequia server.
 * @param {String} msgName The name of the message.
 * @param {Object} body The message body.
 * @param {String} to The name of the client that will receive the message.
 */
AcequiaClient.prototype.send = function (msgName, body, to) {
    if (msgName !== AcequiaClient.CONNECT && !this.isConnected()) {
        console.error("AcequiaClient.send " + msgName + ": client is not connected");
    } else {
        var msg = new AcequiaMessage(this.userName, msgName, body, to);
        this.webSocket.send(msg.toString());
    }
};

/**
 * Listens for the connect message, then sets connected flag to true.
 */
AcequiaClient.prototype.acequia_onConnect = function () {
    this.setConnected(true);
};

/**
 * Listens for the disconnect message, then sets connected flag to false and closes
 * the WebSocket connection.
 */
AcequiaClient.prototype.acequia_onDisconnect = function () {
    this.setConnected(false);
    this.webSocket.close();
};

/**
 * Handles the onopen event from the WebSocket.  This method sends the connect
 * message to the Acequia client.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.ws_onopen = function (evt) {
    this.send(AcequiaClient.CONNECT, this.userName);
};

/**
 * Handles the onclose event from the WebSocket.  This method sets the WebSocket
 * member to null.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.ws_onclose = function (evt) {
    this.webSocket = null;
    this.setConnected(false);
};

/**
 * Handles the onmessage event from the WebSocket.  This method calls any message listeners
 * that have registered for the message.  If there is a wildcard handler registered, then it
 * will call that as well.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.ws_onmessage = function (evt) {
    var i, msg = JSON.parse(evt.data);
    
    // if there is a message listener for this message, call it.
    if (msg.title in this.listeners) {
        for (i in this.listeners[msg.title]) {
            this.listeners[msg.title][i](msg, this);
        }
    } 
    
    // If there is a wildcard listener, call it.
    if ("*" in this.listeners) {
        for (i in this.listeners["*"]) {
            this.listeners["*"][i](msg, this);
        }
    }
};
    
/**
 * Handles the onerror event from the WebSocket.  This method disconnects from the acequia server
 * and closes the websocket connection, in case it is unable to send the message.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.ws_onerror = function (evt) {
    console.error("WebSocket Error: " + evt.data);
    this.disconnect();
    this.setConnected(false);
    this.webSocket.close();
};
