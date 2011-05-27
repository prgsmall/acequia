function acConnect(uri,callback){
    webSocket=new WebSocket(uri);
    dataCallback=null;
    
    webSocket.onopen=function(evt){
        callback();
    }
    
    webSocket.onclose=function(evt){
    
    }
    
    webSocket.onmessage=function(evt){
        var msg=JSON.parse(evt.data);
        if(dataCallback){dataCallback(msg.from,msg.title,msg.body);}
    }
    
    webSocket.onerror=function(evt){
    
    }
}


function acDisconnect(){
    acSend('','/disconnect');
}


function acSend(to,title,body){
    if(!(body instanceof Array)){body=new Array(body);}
    webSocket.send(JSON.stringify({"to":to,"title":title,"body":body}));
}


function acReceive(callback){
    dataCallback=callback;
}