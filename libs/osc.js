var jspack = require('./node-jspack/jspack').jspack; 

var Osc=function(addr,tt,d){
	this.address=addr;
	this.typeTags=tt;
	this.data=d;
	return this;
}
exports.newOsc=Osc;

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