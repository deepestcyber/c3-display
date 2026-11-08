"""Showcase backend for pages/python.html.

deepsplay starts it with the port as argument (see [backend] in screen.toml) and
forwards /c/<config>/backend/* to it. Standard library only, so nothing needs to be
installed but Python itself.

  GET /health  ready check for deepsplay
  GET /info    facts about this Python process, as JSON
"""

import json
import os
import platform
import socket
import sys
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STARTED = time.time()
requests = 0


def primes_below(n: int) -> int:
    """Counts the primes below n with a sieve: a little work done in Python per request."""
    if n < 3:
        return 0
    sieve = bytearray([1]) * n
    sieve[0:2] = b"\x00\x00"
    for i in range(2, int(n**0.5) + 1):
        if sieve[i]:
            sieve[i * i :: i] = bytearray(len(range(i * i, n, i)))
    return sum(sieve)


def info() -> dict:
    now = datetime.now(timezone.utc)
    limit = 100_000 + now.second * 10_000
    t0 = time.perf_counter()
    primes = primes_below(limit)
    return {
        "python": platform.python_version(),
        "implementation": platform.python_implementation(),
        "compiler": platform.python_compiler(),
        "executable": sys.executable,
        "platform": platform.platform(),
        "hostname": socket.gethostname(),
        "pid": os.getpid(),
        "config": os.environ.get("DEEPSPLAY_CONFIG"),
        "time": now.isoformat(timespec="milliseconds"),
        "uptime": round(time.time() - STARTED, 1),
        "requests": requests,
        "primes": {"below": limit, "count": primes, "ms": round((time.perf_counter() - t0) * 1000, 2)},
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global requests
        requests += 1
        if self.path == "/health":
            self.answer(200, {"ok": True})
        elif self.path.split("?")[0] == "/info":
            self.answer(200, info())
        else:
            self.answer(404, {"error": "not found"})

    def answer(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        pass  # one request a second per screen would flood the output on the status page


if __name__ == "__main__":
    port = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"python {platform.python_version()} listening on 127.0.0.1:{port}", flush=True)
    server.serve_forever()
