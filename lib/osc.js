/*globals require exports */
var Buffer = require('buffer').Buffer;

var logger = require('log4js').getLogger("osc");

var Osc = function (addr, tt, d) {
    this.address  = addr;
    this.typeTags = tt;
    this.data     = d;
};

var OscBundle = function (addrs, tts, ds) {
    this.addresses = addrs;
    this.typeTags = tts;
    this.datas = ds;
};

/**
 * Reads in an OSC String from a buffer, returning the string value and the offset
 * in the buffer at which to start reading the next value.
 * @param {Buffer} buffer The buffer to read the string from.
 * @param {Integer} startIndex The index at which to start reading the buffer.
 * @return {Object} contains the string and the offset.
 */
var readOSCString = function (buffer, startIndex) {
    var str = '', i = startIndex;
    while (buffer[i]) {
        str += String.fromCharCode(buffer[i]);
        i += 1;
    }
    i += 1;
    
    while ((i % 4) !== 0) {
        i += 1;
    }

    return {
        str : str,
        offset : i - startIndex
    };
};

/**
 * Parses an OSC Message to extract the data types and type tags.
 * @param {Buffer} buffer The buffer of data to parse
 * @returns {Array} An array of OSC messages with a single element.
 */
var parseMessage = function (buffer) {
    var address = "", typeTags = "", i = 0, j, data = [], sd;
    
    sd = readOSCString(buffer, i);
    address = sd.str;
    i += sd.offset;
    
    sd = readOSCString(buffer, i);
    typeTags = sd.str;
    i += sd.offset;

    for (j = 0; j < typeTags.length; j += 1) {
        switch (typeTags.charAt(j)) {
        case "i":
            data.push(buffer.readInt32BE(i)); 
            i += 4;
            break;

        case "f":
            data.push(buffer.readFloatBE(i)); 
            i += 4;
            break;

        case "s":
            sd = readOSCString(buffer, i);
            data.push(sd.str);
            i += sd.offset;
            break;

        case "b":
            // TODO:  OSC-blob
            break;

        default:
            break;
        }
    }
    
    return [new Osc(address, typeTags, data)];
};

/**
 * Parses an OSC Bundle to extract the messages contained therein.
 * @param {Buffer} buffer The buffer of data to parse
 * @returns {Array} An array of OSC messages
 */
var parseBundle = function (buffer) {
    var i = 0, j, size, packet, ret = [], msgs = [];

    // Skip the name ("#bundle\0") and time tag (8 bytes)
    i += 16;
    
    while (i < buffer.length) {
        // Read the size of the first packet
        size = buffer.readUInt32BE(i);
        i += 4;
    
        packet = buffer.slice(i, i + size);
        i += size;
        
        msgs = parsePacket(new Buffer(packet));
        
        for (j in msgs) {
            ret.push(msgs[j]);
        }
    }
    
    return ret;
};

/**
 * Parses a single OSC packet.
 * @param {Buffer} buffer The buffer of data to parse
 * @returns {Array} An array of OSC messages
 */
var parsePacket = function (buffer) {
    // Determine if this is a bundle or a message
    if (String.fromCharCode(buffer[0]) === "#") {
        return parseBundle(buffer);
    } else {
        return parseMessage(buffer);
    }
};

/**
 * Converts a buffer of data, returned by dgram to an array of OSC messages
 * @param {SlowBuffer} buffer The buffer of data to parse
 * @returns {Array} An array of OSC messages 
 */
exports.bufferToOsc = function (slowBuffer) {
    // Convert the SlowBuffer to a Buffer and parse the packet
    return parsePacket(new Buffer(slowBuffer));
};

var toOSCString = function (instr) {
    var str = instr + '\0';
    while ((str.length % 4) !== 0) {
        str += '\0';
    }
    return str;
};

var writeOSCString = function (instr, buffer, offset) {
    var str = toOSCString(instr);
    buffer.write(str, offset);
    return str.length;
};

var writeOSCInt = function (value, buffer, offset) {
    buffer.writeInt32BE(value, offset);
    return 4;
};

var writeOSCFloat = function (value, buffer, offset) {
    buffer.writeFloatBE(value, offset);
    return 4;
};

exports.oscToBuffer = function (osc) {
    var buffer, offset = 0, i, j;
    
    // This could be more efficient:
    buffer = new Buffer(osc.address.length + osc.typeTags.length + (osc.data.length * 4) + 80);
    
    offset += writeOSCString(osc.address, buffer, offset);    
    offset += writeOSCString(',' + osc.typeTags, buffer, offset);
    
    for (i = 0; i < osc.data.length; i += 1) {
        switch (osc.typeTags.charAt(i)) {
        case "i":
            offset += writeOSCInt(osc.data[i], buffer, offset);
            break;

        case "f":
            offset += writeOSCFloat(osc.data[i], buffer, offset);
            break;

        case "s":
            offset += writeOSCString(osc.data[i], buffer, offset);        
            break;
        
        case "b":
            // TODO:  OSC-blob
            break;

        default:
            break;
        /*
        TODO:
        OSC Type Tags that must be used for certain nonstandard argument types
        OSC Type Tag	Type of corresponding argument
        h	64 bit big-endian two's complement integer
        t	OSC-timetag
        d	64 bit ("double") IEEE 754 floating point number
        S	Alternate type represented as an OSC-string (for example, for systems that differentiate "symbols" from "strings")
        c	an ascii character, sent as 32 bits
        r	32 bit RGBA color
        m	4 byte MIDI message. Bytes from MSB to LSB are: port id, status byte, data1, data2
        T	True. No bytes are allocated in the argument data.
        F	False. No bytes are allocated in the argument data.
        N	Nil. No bytes are allocated in the argument data.
        I	Infinitum. No bytes are allocated in the argument data.
        [	Indicates the beginning of an array. The tags following are for data in the Array until a close brace tag is reached.
        ]	Indicates the end of an array.
        */
        }
    }
    return buffer.slice(0, offset);
};

exports.oscBundleToBuffer = function (bundle) { 
    var i, j, k, size, offset = 0,
    buffer = new Buffer(1000);
    
    offset += writeOSCString("#bundle", buffer, offset);
    offset += writeOSCString("0000001", buffer, offset);
    
    for (i = 0; i < bundle.addresses.length; i += 1) {
        
        // Calculate the size of the message
        size = bundle.addresses[i].length;
        while ((size % 4) !== 0) {
            size += 1;
        }
        size += bundle.typeTags[i].length;
        while ((size % 4) !== 0) { 
            size += 1;
        }
        for (j = 0; j < bundle.typeTags[i].length; j += 1) {
            if (bundle.typeTags[i].charAt(j) === 'i') {
                size += 4;
            } else if (bundle.typeTags[i].charAt(j) === 'f') {
                size += 4;
            } else {
                size += bundle.datas[i][j].length;
                while ((size % 4) !== 0) {
                    size += 1;
                }
            }
        }
        
        offset += writeOSCInt(size, buffer, offset);
        offset += writeOSCString(bundle.addresses[i], buffer, offset);
        offset += writeOSCString(',' + bundle.typeTags[i], buffer, offset);
        
        for (j = 0; j < bundle.datas[i].length; j += 1) {
            switch (bundle.typeTags[i].charAt(j)) {
            case "i":
                offset += writeOSCInt(bundle.datas[i][j], buffer, offset);
                break;
                
            case "f":             
                offset += writeOSCFloat(bundle.datas[i][j], buffer, offset);
                break;
                
            case "s":
                offset += writeOSCString(bundle.datas[i][j], buffer, offset);
                break;
            }
        }
    }
    return buffer.slice(0, offset);
};

var ttForVal = function (val) {
    switch (typeof(val)) {
    case "string":
        return "s";
    case "number":
        if (val.indexOf(".") === -1) {
            return "i";
        } else {
            return "f";
        }
        break;
    }

};

exports.jsonToOsc = function (jsonMessage) {
    var i, j, tt = [], data = [], address, values, val, pushVal;
    
    pushVal = function (val) {
        data.push(val);
        tt.push(ttForVal(val));        
    };
    
    address = jsonMessage.name;
    if (address.indexOf("/") !== 0) {
        address = "/" + address;
    }
    
    values = [jsonMessage.from].concat(jsonMessage.body);
    
    for (i in values) {
        val = values[i];
        if (typeof(val) === "object") {
            for (j in val) {
                pushVal(j);
                pushVal(val[j]);
            }
        } else {
            pushVal(val);
        }
    }
    
    return new Osc(address, tt, data);
};
