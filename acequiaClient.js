/*global WebSocket*/

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
 * Class to define the outgoing messages from the acequia client.
 * @param {String} to
 */
function AcequiaMessage(to, title, body) {
    this.to = (typeof(to) === "undefined") ? "" : to;
    this.title = title;
    this.body = (typeof(body) === "undefined") ? [] : 
                ((body instanceof Array) ? body : [body]);
}

AcequiaMessage.prototype.toString = function () {
    return JSON.stringify(this);
};

var acequiaClient = {
    
    dataCallback: null,
    
    userName: "",
    
    webSocket: null,
    
    connect: function (uri, userName, callback) {
        this.userName = userName;
        this.dataCallback = callback;
        
        this.webSocket = new WebSocket(uri);
        this.webSocket.onopen    = objCallback(this, "ws_onopen");
        this.webSocket.onclose   = objCallback(this, "ws_onclose");
        this.webSocket.onmessage = objCallback(this, "ws_onmessage");
        this.webSocket.onerror   = objCallback(this, "ws_onerror");
    },
    
    disconnect: function () {
        this.send('/disconnect');
    },

    send: function (title, body, to) {
        var msg = new AcequiaMessage(to, title, body);
        this.webSocket.send(msg.toString());
    },

    ws_onopen : function (evt) {
        this.send('/connect', this.userName);
    },
    
    ws_onclose: function (evt) {
    },
    
    ws_onmessage: function (evt) {
        var msg = JSON.parse(evt.data);
        this.dataCallback(msg.from, msg.title, msg.body);
    },
    
    ws_onerror: function (evt) {
    }
};
