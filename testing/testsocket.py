from threading import Thread
import socket
import simplejson

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

    def run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try :
            sock.connect(("localhost", 9092))
            self.sock = sock
            msg = newAcequiaMessage(connectionMessage, [])
            self.sock.send(simplejson.dumps(msg))
            
        except socket.error, e:
            print "Error connecting %s" % e

        self.stopped = False
        while not self.stopped:
            try:
                data = self.sock.recv(1024)
                if not data:
                    print "connection closed"
                    break
                else:
                    print data
                    message = simplejson.loads(data)
                    
                    if message["name"] == connectionMessage:
                        msg = newAcequiaMessage("/getClients", [])
                        self.sock.send(simplejson.dumps(msg))

                        
            except socket.error, e:
                print e
                break

        self.stopped = True

if __name__ == "__main__":
    acequiaMessageThread = AcequiaMessageThread()
    acequiaMessageThread.start()