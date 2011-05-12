#!/usr/bin/node


//Imports and 'globals'.
var sys=require('sys'),
		http=require('http'),
		URL=require('url'),
		net=require('net'),
		osc=require('./libs/osc.js'),
		ws=require('./libs/ws/ws/server.js'),
		dgram=require('dgram'),
        netIP=require('./libs/netIP.js'),
        DEBUG=1,
		INTERNAL_IP='',
		OSC_PORT=9090,
		WS_PORT=9091,
		HTTP_PORT=9092,
		TCP_PORT=9093,
        TIMEOUT=60; //Seconds before kicking idle clients.


//Client array structure.
var clients=[],
		TYP_OSC=0,
		TYP_WS=1,
		TYP_TCP=2,
		USER_PROTOCOL=0,		//Which protocol they're using (see above constants).
        USER_WS_ID=1,			//If they are a ws client, we only need their id (no ip/port required).
		USER_IP=1,				//The client's ip.
		USER_PORT_IN=2,			//The port used as a lookup when receiving a message from a client.  ('in' should be used when RECEIVING a message).
		USER_PORT_OUT=3,		//The port the client is listening on, so we can send to the right port.  ('out' should be used when sending OUT a message).
		USER_NAME=4,			//Metadata for now.  Used in authentication later
        USER_LAST_MSG=5,		//The time at which the last message was received.  It if exceeds a certain number, the client is dropped (use ping/keepalive packets).
        nextClientId=0;


var oscServer,wsServer;


//Message routing goes here.
function msgRec(client,mesid,data){
    var time; time=(new Date()).getTime();
    debug('Received message "'+mesid+'" from client #'+client);
    if(client==-1){return;}
    clients[client][USER_LAST_MSG]=time;
    switch(mesid){
    	case "/connect":
    		msgSnd(client,'/connect',['cody','scott'],'ss');
    	break;

        case "/message":
            msgSndAll(client,'/message',data[0],'s');
        break;
    }
}



//Logs str to the console if the 'global' debug is set to 1.
function debug(str){
    if(DEBUG){console.log('['+(new Date()).getTime()+'] '+str);}
}


//Utility function for sending an osc message to a given client.
function msgSndOsc(client,mesid,data,tt){
    var oscMsg=osc.newOsc(mesid,tt,data),
        buffer=osc.oscToBuffer(oscMsg);
    oscServer.send(buffer,0,buffer.length,clients[client][USER_PORT_OUT],clients[client][USER_IP]);
}


//Utility function for sending a websocket message to a given client.
function msgSndWs(client,mesid,data){
    wsServer.send(clients[client][USER_WS_ID],JSON.stringify([mesid,data]));
}


//To-be-written utility function for sending a raw tcp message to a given client.
function msgSndTcp(client,mesid,data){
    //TCP is under construction.
}


//The master sending function which takes a message meant for a client, decides which protocol to use, and calls the appropriate function.
function msgSnd(client,mesid,data,tt){
    if(client==-1){return;}
    switch(clients[client][USER_PROTOCOL]){
        case TYP_OSC:
            msgSndOsc(client,mesid,data,tt);
            debug("Sent message "+mesid+" to client #"+client);
        break;
        
        case TYP_WS:
            msgSndWs(client,mesid,data);
            debug("Sent message "+mesid+" to client #"+client);
        break;
    }
}



//The master function which sends messages to all clients except for exc.
function msgSndAll(exc,mesid,data,tt){
    var i;
    for(i=0; i<clients.length; i++){
        if(i!=exc){msgSnd(i,mesid,data,tt);}
    }
}


//Often we only know the IP and Port of the sender of a message.  This function translates this data into a 'usable' client ID number.
function lookupClient(protocol,var1,var2){
    switch(protocol){
        case TYP_OSC:
            var i;
            for(i=0; i<clients.length; i++){
                if(clients[i][USER_PROTOCOL]==TYP_OSC){
                    if(clients[i][USER_IP]==var1 && clients[i][USER_PORT_IN]==var2){return i;}
                }
            }
        break;
        
        case TYP_WS:
            var i;
            for(i=0; i<clients.length; i++){
                if(clients[i][USER_PROTOCOL]==TYP_WS){
                    if(clients[i][USER_WS_ID]==var1){return i;}
                }
            }
        break;
        
        case TYP_TCP:
            //There might be a way to get this for free.  Working on it.
        break;
    }
    return -1;
}


//Kicks any clients who we have not heard from for a while.
function kickIdle(){
    var time=(new Date()).getTime(),
        i;
    for(i=0; i<clients.length; i++){
        if((time-clients[i][USER_LAST_MSG])>TIMEOUT*1000){
            dropClient(i,'timeout');
            nextClientId--;
            i--;
        }
    }
}


//Drops a client from the server (they disconnect, timeout, error, etc.)
function dropClient(client,reason){
    clients.splice(client,1);
    debug('Dropped client #'+client+' from server.  ('+reason+')');
}


//The export'ed function is called to start the server.  It starts a server for each individual protocol.
function start(){
    
    //First, we need to get our internal IP, by parsing ifconfig:
    netIP.getNetworkIP(function(error,ip){
        INTERNAL_IP=ip;
        startServers();
        if(error){
            console.log('error:', error);
        }
    },false);


    //Once we actually get our internal IP, we start the servers.
    function startServers(){
    
        //OSC Server.
        oscServer=dgram.createSocket('udp4');
        oscServer.on('message',function(msg,rinfo){
            var oscMsg=osc.bufferToOsc(msg);
            
            switch(oscMsg.address){
                case "/connect":
                    //If they send us the connect message, add them to the list of clients.
                    clients[nextClientId]=[];
                    clients[nextClientId][USER_PROTOCOL]=TYP_OSC;
                    clients[nextClientId][USER_IP]=rinfo.address;
                    clients[nextClientId][USER_PORT_IN]=rinfo.port;
                    clients[nextClientId][USER_PORT_OUT]=oscMsg.data[0];  //when they connect, they send us the port we should send to.
                    clients[nextClientId][USER_NAME]=oscMsg.data[1]; //authentication stuff goes here.
                    clients[nextClientId][USER_LAST_MSG]=(new Date()).getTime();
                    nextClientId++;
                    debug('New OSC client ('+rinfo.address+':'+rinfo.port+', client #'+(nextClientId-1)+')');
                    msgRec(lookupClient(TYP_OSC,rinfo.address,rinfo.port),oscMsg.address,oscMsg.data);
                break;
                
                case "/disconnect":
                    //Delete them from the client array, send any appropriate messages.
                break;
                
                default:
                    /*console.log("Received following OSC message from client ID "+lookupClient(TYP_OSC,rinfo.address,rinfo.port)+":");
                    console.log("\t"+oscMsg.address);
                    for(var i=0; i<oscMsg.data.length; i++){
                        console.log("\t\t"+oscMsg.data[i]);
                    }
                    console.log("\tend"+oscMsg.address);
                    console.log("");*/
                    
                    //Handle routing of messages:
                    msgRec(lookupClient(TYP_OSC,rinfo.address,rinfo.port),oscMsg.address,oscMsg.data);
                break;
            }
        });
        
        //This is the bit of code that tells plasticSarcastic what ip and port we are.  Essentially our authentication/auto-discovery method for right now.
        oscServer.on('listening',function(){
            var addr=oscServer.address();
            debug('oscServer is listening on '+addr.address+':'+addr.port);
            
            var httpClient=http.createClient('80','plasticsarcastic.com');
            var request=httpClient.request('GET','/nodejs/scrCreateServer.php?ip='+INTERNAL_IP+'&port='+OSC_PORT,{'host':'plasticsarcastic.com'});
            request.end();
            request.on('response',function(response){
                response.setEncoding('utf8');
                response.on('data',function(txt){
                    if(txt=='0'){
                        throw new Error('Couldn\'t create server.\n');
                    }
                });
            });
        });

        //"Finalize" the OSC server.
        oscServer.bind(OSC_PORT,INTERNAL_IP);

        
        //Websocket server:
        wsServer=ws.createServer();
        wsServer.addListener('connection',function(con){
        
            //Add them to the clients list when they connect.
            clients[nextClientId]=[];
            clients[nextClientId][USER_PROTOCOL]=TYP_WS;
            clients[nextClientId][USER_WS_ID]=con.id;
            clients[nextClientId][USER_LAST_MSG]=(new Date()).getTime();
            nextClientId++;
            debug('New WS client (ws id '+con.id+', client #'+(nextClientId-1)+')');
        
            con.addListener('message',function(msg){
                var message=JSON.parse(msg),
                    mesid=message.shift();
                
                msgRec(lookupClient(TYP_WS,con.id),mesid,message);
            });
        });

        wsServer.addListener('close',function(con){
            console.log(con.id+" left.");
        });

        wsServer.addListener('listening',function(){
            debug('wsServer is listening on '+INTERNAL_IP+":"+WS_PORT);
        });
        
        //"Finalize" websocket server.
        wsServer.listen(WS_PORT);

        
        
        //The next two servers are under construction and are technically not part of the server yet.
        
        //HTTP server.
        /*http.createServer(function(req,res){
            var pathName=URL.parse(req.url,true).pathname;
            console.log("HTTP server received "+pathName);
            res.writeHead("200",{'Content-type':'text/plain'});
            switch(pathName){
                case "/connect":
                    //Not sure if these will be real clients yet.
                break;
            }
            res.end("\n");
        }).listen(HTTP_PORT);
        debug("httpServer is listening on "+INTERNAL_IP+":"+HTTP_PORT);


        //Raw TCP server:
        var tcpStream;
        var tcpServer=net.createServer(function(stream){
            tcpStream=stream;
            stream.setEncoding('utf8');
            stream.on('connect',function(rinfo){
                clients[nextClientId]=[];
                clients[nextClientId][USER_PROTOCOL]=TYP_TCP;
                clients[nextClientId][USER_IP]=rinfo.address;
                clients[nextClientId][USER_PORT]=rinfo.port;
                clients[netxClientId][USER_NAME]=''; //authentication.
                clients[nextClientId][USER_LAST_MSG]=(new Date()).getTime();
                nextClientId++;
            });
            stream.on('data',function(data){
                //Figure out who sent it and pipe to the routing function.
                console.log("Received the following message from "+stream.remoteAddress+":");
                console.log(data);
            });
        }).listen(TCP_PORT,INTERNAL_IP);
        debug("tcpServer is listening on "+INTERNAL_IP+":"+TCP_PORT);
        */
        
        setInterval(kickIdle,1000);
    }
}

exports.start=start;