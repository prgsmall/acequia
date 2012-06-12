/*globals exports */
(function (exports) {
    /**
     * Class to define the json messages to and from from the acequia client.
     * @param {String} from The name of the unique user who is sending this message.
     * @param {String} name The name of the message.
     * @param {Object} body The body of the messaage, which will contain mesage-specific
     * data.
     * @param {String} to The name of the user that will receive the message.  If blank, it will
     * be a broadcasted message
     */
    function AcequiaMessage(from, name, body, to) {
        var message;
        if (typeof(from) === "object") {
            message = from;
            this.name = message.name;
            this.body = message.body;
            this.from = message.from;
            this.to   = message.to;
        } else {
            this.name = name;
            this.body = (typeof(body) === "undefined") ? [] : ((body instanceof Array) ? body : [body]);
            this.from = from;
            this.to   = (typeof(to) === "undefined") ? "" : to;
        }
        this.timestamp = "";
    }

    /**
     * Returns a JSON string of the message object.
     * @returns{String} The stringified message object.
     */
    AcequiaMessage.prototype.toString = function () {
        this.timestamp = this.xsdDateTime();
        return JSON.stringify(this);
    };

    /**
     * Given a Date object, return an xsd representation of the current date/time.
     * @param {Date} inDate The date object to generate the xsd date from.
     * @returns {String} The xsd date
     */
    AcequiaMessage.prototype.xsdDateTime = function () {
        var inDate = new Date(),
        
        pad = function (n) {
            var s = n.toString();
            return s.length < 2 ? '0' + s : s;
        };

        return  inDate.getFullYear() + 
            '-' + pad(inDate.getMonth() + 1) + 
            '-' + pad(inDate.getDate()) + 
            'T' + pad(inDate.getHours()) + 
            ':' + pad(inDate.getMinutes()) + 
            ':' + pad(inDate.getSeconds()) +
            "." + inDate.getMilliseconds().toString();
    };

    exports.AcequiaMessage = AcequiaMessage;
    
    // The standard messages that the acequia system handles.
    exports.MSG_CONNECT      = "ACEQUIA_CONNECT";
    exports.MSG_DISCONNECT   = "ACEQUIA_DISCONNECT";
    exports.MSG_GETCLIENTS   = "ACEQUIA_GETCLIENTS";
    exports.MSG_SUBSCRIBE    = "ACEQUIA_SUBSCRIBE";
    exports.MSG_UNSUBSCRIBE  = "ACEQUIA_UNSUBSCRIBE";
    exports.MSG_DS_CHANGED   = "ACEQUIA_DATASTORECHANGED";
    exports.MSG_SUBSCRIBE_DS = "ACEQUIA_SUBSCRIBEDATASTORE";
    exports.MSG_UPDATE_DS    = "ACEQUIA_UPDATEDATASTORE";
    

})(typeof(exports) === "undefined" ? this["msg"] = {} : exports);
