/*global WebSocket*/

var objCallback = function (obj, func) {
    return function () {
        obj[func].apply(obj, arguments);
    };
};    


function AcequiaMessage(to, title, body) {
    this.to = to;
    this.title = title;
    this.body = (body instanceof Array) ? body : [body];
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
        this.send('', '/disconnect');
    },

    send: function (to, title, body) {
        var msg = new AcequiaMessage(to, title, body);
        this.webSocket.send(msg.toString());
    },

    ws_onopen : function (evt) {
        this.send('', '/connect', this.userName);
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