from threading import Thread, Timer
import socket
import simplejson
import struct

fromname = "argggghhh"
connectionMessage = "/connect"

def newAcequiaMessage (name, body):
    return {"from" : fromname,
            "to"   : "",
            "name" : name,
            "body" : body}

class AcequiaMessageThread(Thread):

    def __init__(self):
        Thread.__init__(self)
        self.stopped = False

    def sendMessage(self, msg):
        msg = simplejson.dumps(msg)
        slen = struct.pack(">L", len(msg)) 
        self.sock.send(slen + msg)
        
    def stopIt(self):
        print "stopIt"
        self.sock.shutdown(socket.SHUT_RDWR)
        self.sock.close()
        self.stopped = True

    def run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try :
            sock.connect(("localhost", 9092))
            self.sock = sock
            self.sendMessage(newAcequiaMessage(connectionMessage, []))
            # Timer(10.0, self.stopIt).start()
                        
        except socket.error, e:
            print "Error connecting %s" % e

        self.stopped = False
        while not self.stopped:
            try:
                data = self.sock.recv(4)
                if not data:
                    print "connection closed"
                    break
                
                (size,) = struct.unpack('>L', data)
                print "message size: %d" % size
                
                data = self.sock.recv(size)
                if not data:
                    print "connection closed"
                    break

                print data
                message = simplejson.loads(data)
                
                if message["name"] == connectionMessage:
                    self.sendMessage(newAcequiaMessage("/getClients", []))
                elif message["name"] == "/getClients":
                    for i in range(0,210):
                        self.sendMessage(newAcequiaMessage("chewbacca", []));
                    raise Exception("Message Blast complete")

            except Exception, e:
                print e
                self.stopped = True

        self.stopIt();

if __name__ == "__main__":
    acequiaMessageThread = AcequiaMessageThread()
    acequiaMessageThread.start()