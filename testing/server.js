var io = require('socket.io').listen(8888);

io.sockets.on('connection', function (socket) {
  socket.on('message', function (data) { 
      console.log(data);
      socket.send("BLAHHHHH");
  });
  socket.on('disconnect', function () { });
});