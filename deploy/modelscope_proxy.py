"""Minimal reverse proxy for the existing loopback-only workbench. Cloud-facing bind: 0.0.0.0:7860."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
import os

UPSTREAM_PORT = int(os.environ.get('LOCAL_APP_PORT','8765'))
class Proxy(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def handle_proxy(self):
        size = int(self.headers.get('Content-Length') or 0)
        if size > 15 * 1024 * 1024:
            self.send_error(413,'Payload too large');return
        body=self.rfile.read(size) if size else None
        headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','connection','content-length','accept-encoding','transfer-encoding')}
        headers['Accept-Encoding']='identity'
        if body is not None:headers['Content-Length']=str(len(body))
        conn=HTTPConnection('127.0.0.1',UPSTREAM_PORT,timeout=600)
        try:
            conn.request(self.command,self.path,body=body,headers=headers)
            rsp=conn.getresponse();payload=rsp.read()
            self.send_response(rsp.status,rsp.reason)
            for k,v in rsp.getheaders():
                if k.lower() not in ('transfer-encoding','connection','content-length','keep-alive','content-encoding'):
                    self.send_header(k,v)
            self.send_header('Content-Length',str(len(payload)))
            self.end_headers()
            if self.command != 'HEAD':self.wfile.write(payload)
        except Exception:
            payload=b'Application backend not ready'
            self.send_response(502);self.send_header('Content-Length',str(len(payload)));self.end_headers()
            if self.command != 'HEAD':self.wfile.write(payload)
        finally:conn.close()
    def do_GET(self):self.handle_proxy()
    def do_POST(self):self.handle_proxy()
    def do_PUT(self):self.handle_proxy()
    def do_DELETE(self):self.handle_proxy()
    def do_HEAD(self):self.handle_proxy()

if __name__=='__main__':
    ThreadingHTTPServer(('0.0.0.0',7860),Proxy).serve_forever()
