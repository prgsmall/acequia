var jspack = require('./node-jspack/jspack').jspack; 

var Osc=function(addr,tt,d){
	this.address=addr;
	this.typeTags=tt;
	this.data=d;
	return this;
}
exports.newOsc=Osc;

var OscBundle=function(addrs,tts,ds){
    this.addresses=addrs;
    this.typeTags=tts;
    this.datas=ds;
    return this;
}
exports.newOscBundle=OscBundle;

exports.bufferToOsc=function(buffer){
	var address='';
	var typeTags='';
	var data=[];
	var i=0;
	
	while(buffer[i]){
		address+=String.fromCharCode(buffer[i]);
		i++;
	}
	while((i%4)<3){i++;}
	i++;
	
	while(buffer[i]){
		if(buffer[i]=='f'.charCodeAt(0) || buffer[i]=='i'.charCodeAt(0) || buffer[i]=='s'.charCodeAt(0)){typeTags+=String.fromCharCode(buffer[i]);}
		i++;
	}
	while((i%4)<3){i++;}
	i++;
	
	for(var j=0; j<typeTags.length; j++){
		if(typeTags.charAt(j)=='i'){data.push(jspack.Unpack('i',buffer,i)); i+=4;}
		else if(typeTags.charAt(j)=='f'){data.push(jspack.Unpack('f',buffer,i)); i+=4;}
		else if(typeTags.charAt(j)=='s'){
			var str; str='';
			while(buffer[i]){str+=String.fromCharCode(buffer[i]); i++;}
			data.push(str);
			while((i%4)!=0){i++;}
		}
	}
	
	return new Osc(address,typeTags,data);
};

exports.bufferToOscBundle=function(buffer){
    var addresses=[],
        typeTags=[],
        datas=[];
    buffer=buffer.slice(16,buffer.length);
    
    var i=0;
    var j=0;
    while(true){
        size=jspack.Unpack('i',buffer,j);
        j+=4;
        var addr='';
        while(buffer[j]){
            addr+=String.fromCharCode(buffer[j]);
            j++;
        }
        addresses.push(addr);
        while((j%4)<3){j++;}
        j++;
        
        var tt='';
        while(buffer[j]){
            if(buffer[j]=='f'.charCodeAt(0) || buffer[j]=='i'.charCodeAt(0) || buffer[j]=='s'.charCodeAt(0)){tt+=String.fromCharCode(buffer[j]);}
            j++;
        }
        typeTags.push(tt);
        while((j%4)<3){j++;}
        j++;
        
        var data=[];
        for(var k=0; k<tt.length; k++){
            if(tt.charAt(k)=='i'){data.push(jspack.Unpack('i',buffer,j)[0]); j+=4;}
            else if(tt.charAt(k)=='f'){data.push(jspack.Unpack('f',buffer,j)[0]); j+=4;}
            else if(tt.charAt(k)=='s'){
                var str; str='';
                while(buffer[j]){str+=String.fromCharCode(buffer[j]); j++;}
                data.push(str);
                while((j%4)!=0){j++;}
            }
        }
        datas.push(data);
        
        if(j+16>=buffer.length){break;}
        i++;
    }
    return new OscBundle(addresses,typeTags,datas);
}

exports.oscToBuffer=function(osc){
	if(typeof osc.data=="undefined"){osc.data=[];}
	var buffer=new Buffer(osc.address.length+osc.typeTags.length+(osc.data.length*4)+80); //could be more efficient.
	
	var str=osc.address+'\0';
	while((str.length%4)!=0){str+='\0';}
	buffer.write(str);
	var offset=str.length;
	
	str=','+osc.typeTags+'\0';
	while((str.length%4)!=0){str+='\0';}
	buffer.write(str,offset);
	offset+=str.length;
	
	/*osc.typeTags=osc.typeTags.replace(/find/s,'c');
	var byteArr=jspack.Pack(osc.typeTags,osc.data);
	console.log(byteArr);
	for(var i=0; i<byteArr.length; i++){
		buffer[offset+i]=byteArr[i];
	}*/
	
	var byteArr;
	for(var i=0; i<osc.data.length; i++){
		if(osc.typeTags.charAt(i)=='i' || osc.typeTags.charAt(i)=='f'){
			byteArr=jspack.Pack(osc.typeTags.charAt(i),[osc.data[i]]);
			for(var j=0; j<byteArr.length; j++){
				buffer[offset]=byteArr[j];
				offset++;
			}
		}
		else{ //string
			for(var j=0; j<osc.data[i].length; j++){
				buffer[offset]=osc.data[i].charCodeAt(j);
				offset++;
			}
			buffer[offset]+='\0';
			offset++;
			while((offset%4)!=0){buffer[offset]+='\0'; offset++;}
		}
	}
	return buffer.slice(0,offset);
}

exports.oscBundleToBuffer=function(bundle){
    var buffer=new Buffer(1000);
    
    var str='#bundle\0';
    buffer.write(str);
    var offset=str.length;
    
    str='0000001\0';
    buffer.write(str,offset);
    offset+=str.length;
    
    
    for(var i=0; i<bundle.addresses.length; i++){
        var size=bundle.addresses[i].length;
        while((size%4)!=0){size++;}
        size+=bundle.typeTags[i].length;
        while((size%4)!=0){size++;}
        for(var j=0; j<bundle.typeTags[i].length; j++){
            if(bundle.typeTags[i].charAt(j)=='i'){size+=4;}
            else if(bundle.typeTags[i].charAt(j)=='f'){size+=4;}
            else{
                size+=bundle.datas[i][j].length;
                while((size%4)!=0){size++;}
            }
        }
        
        var byteArr; byteArr=jspack.Pack('i',[size]);
        for(var j=0; j<byteArr.length; j++){
            buffer[offset]=byteArr[j];
            offset++;
        }
        
        str=bundle.addresses[i]+'\0';
        while((str.length%4)!=0){str+='\0';}
        buffer.write(str,offset);
        offset+=str.length;
        
        str=','+bundle.typeTags[i]+'\0';
        while((str.length%4)!=0){str+='\0';}
        buffer.write(str,offset);
        offset+=str.length;
        
        for(var j=0; j<bundle.datas[i].length; j++){
            if(bundle.typeTags[i].charAt(j)=='i' || bundle.typeTags[i].charAt(j)=='f'){
                byteArr=jspack.Pack(bundle.typeTags[i].charAt(j),[bundle.datas[i][j]]);
                for(var k=0; k<byteArr.length; k++){
                    buffer[offset]=byteArr[k];
                    offset++;
                }
            }
            else{ //string
                for(var k=0; k<bundle.datas[i][j].length; k++){
                    buffer[offset]=bundle.datas[i][j].charCodeAt(k);
                    offset++;
                }
                buffer[offset]+='\0';
                offset++;
                while((offset%4)!=0){buffer[offset]+='\0'; offset++;}
            }
        }
    }
    return buffer.slice(0,offset);
}