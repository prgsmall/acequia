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
    this.from = from;
    this.to   = (typeof(to) === "undefined") ? "" : to;
    this.name = name;
    this.body = (typeof(body) === "undefined") ? [] : ((body instanceof Array) ? body : [body]);
}

/**
 * Returns a JSON string of the message object.
 * @return {String} The stringified message object.
 */
AcequiaMessage.prototype.toString = function () {
    return JSON.stringify(this);
};