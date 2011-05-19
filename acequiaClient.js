function acConnect(callback){
    webSocket=new WebSocket("ws://192.168.0.80:9091");
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


function acSend(to,title,body){
    webSocket.send(JSON.stringify({"to":to,"title":title,"body":body}));
}


function acReceive(callback){
    dataCallback=callback;
}