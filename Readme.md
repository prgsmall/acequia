#acequia

A node-js message router supporting multiple connection protocols and a persistent data store.  The persistent datastore is also accessible through a REST interface.  Acequia can be run as a stand-alone server or integrated into your express.js web application.

The messaging server currently supports the following connection protocols:

* WebSockets via socket.io
* UDP connection using the Open Sound Control protocol
* TCP connection

## To install acequia:

```shell
git clone git@github.com:prgsmall/acequia.git

cd acequia

npm install # To install all of the submodules
```