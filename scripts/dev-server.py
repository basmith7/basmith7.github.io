#!/usr/bin/env python3
"""Serve the resume site locally without Jekyll.

GitHub Pages compiles assets/main.scss to /assets/main.css. The file is plain CSS behind
Jekyll front matter, so this server strips the front matter and serves it at that path.
Usage: python3 scripts/dev-server.py [port] [host]   (default 8765 on 127.0.0.1; pass 0.0.0.0 to expose)
"""
import re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
HOST = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        if self.path.split('?')[0] == '/assets/main.css':
            css = (ROOT / 'assets' / 'main.scss').read_text()
            css = re.sub(r'\A---\s*\n(.*?\n)?---\s*\n', '', css, flags=re.S)
            body = css.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/css; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    print(f'http://{HOST}:{PORT}/')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
