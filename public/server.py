#!/usr/bin/python3

import http.server, ssl

server_address = ('localhost', 443)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)
httpd.socket = ssl.wrap_socket(httpd.socket,
                               server_side=True,
                               keyfile='privkey.pem',
                               certfile='certificate.pem',
                               ssl_version=ssl.PROTOCOL_TLS)
httpd.serve_forever()