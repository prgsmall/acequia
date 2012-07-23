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

    this.removeConnectionChangeHandler = function (handler) {
        for (var i = 0; i < m_connectionChangeHandlers.length; i += 1) {
            if (m_connectionChangeHandlers[i] === handler) {
                m_connectionChangeHandlers.splice(i, 1);
                break;
            }
        }
    };

    this.setConnected = function (connected) {
        var idx;
        if (m_connected !== connected) {
            m_connected = connected;
            for (idx = 0; idx < m_connectionChangeHandlers.length; idx += 1) {
                m_connectionChangeHandlers[idx](connected);
            }
        }
    };

    if (!clientName) {
        clientName = "ACEQUIA-CLIENT-X-" + Math.random();
    }
    
    this.uri        = this.getURI(uri);
    this.socket     = null;
    this.clientName = clientName;

    this.listeners  = {};
    this.subscribes = [];
    
    this.connecting = false;
};

/**
 * Gets the uri for the Acequia client from either the passed in uri, or the location
 * of the script file.
 * @param {String} uri The uri passed in to the constructor of AcequiaClient.
 * @returns {String} the URI
 */
AcequiaClient.prototype.getURI = function (uri) {
    var i, scripts, pos;
    
    if (typeof(uri) !== "undefined") {
        return uri;
    } else {
        scripts = document.getElementsByTagName("script");
        for (i = 0; i < scripts.length; i += 1) {
            pos = scripts[i].src.indexOf("/acequia/acequia.js");
            if (pos !== -1) {
                return scripts[i].src.substring(0, pos);
            }
        }
    }
    console.error("Unable to resolve uri");
    return null;    
};

/**
 * Downloads the socket.io javascript file from the given server and then
 * calls the onload function once has been loaded.
 * @param {Function} onload the function to call when the script is downloaded.
 * If the script aleady exists, then call the onlod function immediately.
 */
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
    var onload = (function (that, uri) {
        return function (evt) {
            if (!that.socket) {
                uri = (typeof(uri) === "undefined") ? that.uri : uri;
                that.socket = io.connect(uri);
                that.socket.on("connect", objCallback(that, "onConnect"));
                that.socket.on("reconnect", objCallback(that, "onReconnect"));
                that.socket.on("disconnect", objCallback(that, "onDisconnect"));
                that.socket.on("message",    objCallback(that, "onMessage"));
            } else {
                that.socket.socket.connect();
            }
        };
    }(this, url));
    
    this.getSocketIOJS(onload);    
};

/**
 * Sends the disconnect message to the Acequia server.
 */
AcequiaClient.prototype.disconnect = function () {
    this.socket.disconnect();
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
 * @to {String} to The intended recipient of the message.
 */
AcequiaClient.prototype.send = function (msgName, body, to) {
    var message;
    if (msgName !== msg.MSG_CONNECT && !this.isConnected()) {
        console.error("AcequiaClient.send " + msgName + ": client is not connected");
    } else {
        message = new msg.AcequiaMessage(this.clientName, msgName, body, to);
        this.socket.send(message.toString());
    }
};

/**
 * Sends the CONNECT message to the acequia server to establish a connection to
 * send and receive messages.
 */
AcequiaClient.prototype.sendConnect = function () {
    if (!this.connecting && !this.isConnected()) {
        console.debug("connecting...");
        this.connecting = true;
        this.send(msg.MSG_CONNECT, this.subscribes);
    }
};

/**
 * Handles the connect event from the WebSocket.  This method sends the connect
 * message to the Acequia client.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onConnect = function (evt) {
    console.debug("onConnect");
    this.sendConnect();
};

/**
 * Handles the reconnect event from the WebSocket.  This method sends the connect
 * message to the Acequia client.  This event is fired when the connection to the
 * server is reestablished following a disconnect.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onReconnect = function (evt) {
    console.debug("onReconnect");
    this.sendConnect();
};

/**
 * Handles the onclose event from the WebSocket.  This method sets the WebSocket
 * member to null.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onDisconnect = function (evt) {
    console.debug("onDisconnect");
    this.connecting = false;
    this.setConnected(false);
};

/**
 * Handles the onmessage event from the WebSocket.  This method calls any message listeners
 * that have registered for the message.  If there is a wildcard handler registered, then it
 * will call that as well.
 * @param {Event} evt  The event object.
 */
AcequiaClient.prototype.onMessage = function (data) {
    var i, message = JSON.parse(data);
    
    console.debug("Received " + message.name);
    
    switch (message.name) {
    case msg.MSG_CONNECT:
        if (message.body[0] === -1) {
            console.error('ERROR logging in: ' + message.body);
        } else {
            this.setConnected(true);
        }
        this.connecting = false;
        break;
        
    case msg.MSG_DISCONNECT:
        this.setConnected(false);
        this.socket.disconnect();
        break;

    default:
        if (message.name in this.listeners) {
            for (i = 0; i < this.listeners[message.name].length; i += 1) {
                this.listeners[message.name][i](message, this);
            }
        }
    }
};

/**
 * Creates a new instance of the client store
 * @param {String} path The path in the datastore to set and get
 * @returns {Object} The client store object.
 */
AcequiaClient.prototype.createClientStore = function (path) {
    return new ClientStore(path, this);
};
