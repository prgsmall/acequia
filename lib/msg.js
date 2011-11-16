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
    function AcequiaMessage(from, name, body) {
        this.from = from;
        this.name = name;
        this.body = (typeof(body) === "undefined") ? [] : ((body instanceof Array) ? body : [body]);
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
    exports.MSG_CONNECT    = "/connect";
    exports.MSG_DISCONNECT = "/disconnect";
    exports.MSG_GETCLIENTS = "/getClients";

})(typeof(exports) === "undefined" ? this["msg"] = {} : exports);
