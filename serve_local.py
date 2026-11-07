# The site served for local checking: python3 serve_local.py 8093   (run from the site root)
# Pages, scripts, styles and data are never cached, so the browser always shows what is on disk.
# The arm meshes and the 3D library never change and are large (12 MB per arm), so those may be cached.
import http.server, sys

KEEP = (".stl", "three.min.js", "OrbitControls.js", "STLLoader.js")

class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def end_headers(self):
        keep = self.path.split("?")[0].endswith(KEEP)
        self.send_header("Cache-Control", "public, max-age=604800" if keep else "no-store, max-age=0")
        super().end_headers()
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("0.0.0.0", int(sys.argv[1]) if len(sys.argv) > 1 else 8093), H).serve_forever()
