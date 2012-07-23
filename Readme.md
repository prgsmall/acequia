#acequia

A node-js message router supporting multiple connection protocols and a persistent data store.  The persistent datastore is also accessible through a REST interface.  Acequia can be run as a stand-alone server or integrated into your express.js web application.

The messaging server currently supports the following connection protocols:

* WebSockets via socket.io
* UDP connection using the Open Sound Control protocol
* TCP connection

## Installation

To install acequia, type the following into a command shell:

```shell
git clone git@github.com:prgsmall/acequia.git
cd acequia
npm install             # This installs all of the required submodules of acequia
```

If you wish to integrate acequia into your express.js app, simply add it to your package.json.

## Starting acequia
To start acequia as a stand alone server with all of the default values, type the following:
```shell
cd acequia
node ./server.js
```
