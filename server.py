#!/usr/bin/env python3
"""
DEVNET — Interactive Computer Networks Protocol Simulator
Zero-dependency lightweight HTTP server.

Usage:
    python server.py
    python server.py --port 8080
"""

import http.server
import socketserver
import webbrowser
import sys
import os

DEFAULT_PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        # Clean terminal logging
        sys.stderr.write(f"[DEVNET HTTP] {self.address_string()} - {format%args}\n")

def find_available_port(start_port):
    import socket
    port = start_port
    while port < start_port + 100:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
            port += 1
    return start_port

def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    elif '--port' in sys.argv:
        idx = sys.argv.index('--port')
        if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit():
            port = int(sys.argv[idx + 1])

    port = find_available_port(port)
    url = f"http://localhost:{port}"

    print("=" * 68)
    print(" DEVNET: Interactive Computer Networks Protocol Simulator")
    print(" Apple Liquid Glass Design Language • CS601 Academic Assignment")
    print("=" * 68)
    print(f" Serving directory : {DIRECTORY}")
    print(f" Local URL         : {url}")
    print(" Press Ctrl+C to terminate server.")
    print("=" * 68)

    # Launch browser only if not run in automated/CI mode
    if '--no-browser' not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    with socketserver.TCPServer(("", port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down DEVNET server gracefully.")

if __name__ == '__main__':
    main()

