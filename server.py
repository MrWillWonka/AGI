"""Local dev server: serves this directory with caching disabled.

Usage: python3 server.py [port] [--no-browser]
"""
import functools
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(ThreadingHTTPServer):
    # The review report's browsers load the game at once; the default queue of 5 waiting connections made Windows
    # refuse the rest (ERR_CONNECTION_REFUSED).
    request_queue_size = 128


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8000
    handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).parent))
    with Server(("127.0.0.1", port), handler) as httpd:
        url = f"http://localhost:{port}"
        print(f"Serving on {url} (Ctrl+C to stop)")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
