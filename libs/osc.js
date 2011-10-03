/*globals require exports */
var jspack = require('../vendor/node-jspack/jspack').jspack;
var Buffer = require('buffer').Buffer;

var Osc = function (addr, tt, d) {
	this.address = addr;
	this.typeTags = tt;
	this.data = d;
	return this;
};
exports.newOsc = Osc;

var OscBundle = function (addrs, tts, ds) {
    this.addresses = addrs;
    this.typeTags = tts;
    this.datas = ds;
    return this;
};
exports.newOscBundle = OscBundle;

exports.bufferToOsc = function (buffer) {
	var address = '',  typeTags = '', data = [],  i = 0, j, str;
	
	while (buffer[i]) {
		address += String.fromCharCode(buffer[i]);
		i += 1;
	}
	
	while ((i % 4) < 3) {
	    i += 1;
	}
	i += 1;
	
	while (buffer[i]) {
		if (buffer[i] === 'f'.charCodeAt(0) || buffer[i] === 'i'.charCodeAt(0) || 
		    buffer[i] === 's'.charCodeAt(0)) { 
		    typeTags += String.fromCharCode(buffer[i]);
		}
		i += 1;
	}
	while ((i % 4) < 3) {
	    i += 1;
	}
	i += 1;
	
	for (j = 0; j < typeTags.length; j += 1) {
		if (typeTags.charAt(j) === 'i') {
		    data.push(jspack.Unpack('i', buffer, i)); 
		    i += 4;
		} else if (typeTags.charAt(j) === 'f') {
		    data.push(jspack.Unpack('f', buffer, i)); 
		    i += 4;
		} else if (typeTags.charAt(j) === 's') {
			str = '';
			while (buffer[i]) {
			    str += String.fromCharCode(buffer[i]);
			    i += 1;
			}
			data.push(str);
			while ((i % 4) !== 0) {
			    i += 1;
			}
		}
	}
	
	return new Osc(address, typeTags, data);
};

exports.bufferToOscBundle = function (buffer) {
    var i, j, k, tt, data, str, addr, size,
    addresses = [],
    typeTags = [],
    datas = [];
        
    buffer = buffer.slice(16, buffer.length);
    
    i = 0;
    j = 0;
    while (true) {
        size = jspack.Unpack('i', buffer, j);
        j += 4;
        addr = '';
        while (buffer[j]) {
            addr += String.fromCharCode(buffer[j]);
            j += 1;
        }
        addresses.push(addr);
        while ((j % 4) < 3) { 
            j += 1;
        }
        j += 1;
        
        tt = '';
        while (buffer[j])
        {
            if (buffer[j] === 'f'.charCodeAt(0) || 
                buffer[j] === 'i'.charCodeAt(0) || 
                buffer[j] === 's'.charCodeAt(0)) {
                tt += String.fromCharCode(buffer[j]);
            }
            j += 1;
        }
        typeTags.push(tt);
        while ((j % 4) < 3) {
            j += 1;
        }
        j += 1;
        
        data = [];
        for (k = 0; k < tt.length; k += 1) {
            if (tt.charAt(k) === 'i') {
                data.push(jspack.Unpack('i', buffer, j)[0]); 
                j += 4;
            } else if (tt.charAt(k) === 'f') {
                data.push(jspack.Unpack('f', buffer, j)[0]); 
                j += 4;
            } else if (tt.charAt(k) === 's') {
                str = '';
                while (buffer[j]) {
                    str += String.fromCharCode(buffer[j]); 
                    j += 1;
                }
                data.push(str);
                while ((j % 4) !== 0) {
                    j += 1;
                }
            }
        }
        datas.push(data);
        
        if (j + 16 >= buffer.length) {
            break;
        }
        i += 1;
    }
    return new OscBundle(addresses, typeTags, datas);
};

exports.oscToBuffer = function (osc) {
    var byteArr, buffer, str, offset, i, j;
    
	if (typeof osc.data === "undefined") {
	    osc.data = [];
	}
	
	// This could be more efficient:
	buffer = new Buffer(osc.address.length + osc.typeTags.length + (osc.data.length * 4) + 80);
	str = osc.address + '\0';
	while ((str.length % 4) !== 0) {
	    str += '\0';
	}
	buffer.write(str);
	offset = str.length;
	
	str = ',' + osc.typeTags + '\0';
	while ((str.length % 4) !== 0) {
	    str += '\0';
	}
	buffer.write(str, offset);
	offset += str.length;
	
	/*osc.typeTags=osc.typeTags.replace(/find/s,'c');
	var byteArr=jspack.Pack(osc.typeTags,osc.data);
	console.log(byteArr);
	for (var i=0; i<byteArr.length; i++) {
		buffer[offset+i]=byteArr[i];
	}*/
	
	for (i = 0; i < osc.data.length; i += 1) {
		if (osc.typeTags.charAt(i) === 'i' || osc.typeTags.charAt(i) === 'f') {
			byteArr = jspack.Pack(osc.typeTags.charAt(i), [osc.data[i]]);
			for (j = 0; j < byteArr.length; j += 1) {
				buffer[offset] = byteArr[j];
				offset += 1;
			}
		} else { //string
			for (j = 0; j < osc.data[i].length; j += 1) {
				buffer[offset] = osc.data[i].charCodeAt(j);
				offset += 1;
			}
			buffer[offset] += '\0';
			offset += 1;
			while ((offset % 4) !== 0) {
			    buffer[offset] += '\0'; 
			    offset += 1;
			}
		}
	}
	return buffer.slice(0, offset);
};

exports.oscBundleToBuffer = function (bundle) { 
    var i, j, k, size, byteArr,
    buffer = new Buffer(1000),
    str = '#bundle\0',
    offset = str.length;
    buffer.write(str);
    
    str = '0000001\0';
    buffer.write(str, offset);
    offset += str.length;
    
    for (i = 0; i < bundle.addresses.length; i += 1) {
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
        
        byteArr = jspack.Pack('i', [size]);
        for (j = 0; j < byteArr.length; j += 1) {
            buffer[offset] = byteArr[j];
            offset += 1;
        }
        
        str = bundle.addresses[i] + '\0';
        while ((str.length % 4) !== 0) {
            str += '\0';
        }
        buffer.write(str, offset);
        offset += str.length;
        
        str = ',' + bundle.typeTags[i] + '\0';
        while ((str.length % 4) !== 0) {
            str += '\0';
        }
        buffer.write(str, offset);
        offset += str.length;
        
        for (j = 0; j < bundle.datas[i].length; j += 1) {
            if (bundle.typeTags[i].charAt(j) === 'i' || bundle.typeTags[i].charAt(j) === 'f') {
                byteArr = jspack.Pack(bundle.typeTags[i].charAt(j), [bundle.datas[i][j]]);
                for (k = 0; k < byteArr.length; k += 1) {
                    buffer[offset] = byteArr[k];
                    offset += 1;
                }
            } else { //string
                for (k = 0; k < bundle.datas[i][j].length; k += 1) {
                    buffer[offset] = bundle.datas[i][j].charCodeAt(k);
                    offset += 1;
                }
                buffer[offset] += '\0';
                offset += 1;
                while ((offset % 4) !== 0) {
                    buffer[offset] += '\0'; 
                    offset += 1;
                }
            }
        }
    }
    return buffer.slice(0, offset);
};