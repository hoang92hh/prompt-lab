"""Local HTTP Bridge using only Python's standard library. No website logic."""
import argparse
import json
import logging
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit
from .connection_state import ConnectionState
from .job_manager import JobManager
from .output_store import OutputStore
from .project_store import ProjectStore
from .protocol import ProtocolError, fail

MAX_BODY_BYTES = 1024 * 1024
GUI_ROOT = (Path(__file__).parent.parent / "app" / "gui").resolve()
ASSET_CONTENT_TYPES = {".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8"}

def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON key")
        value[key] = item
    return value

def _invalid_constant(value):
    raise ValueError("Non-JSON numeric constant")

class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port: int = 8765, poll_timeout: float = 20):
        self.manager = JobManager()
        self.outputs = OutputStore()
        self.projects = ProjectStore()
        self.connection_state = ConnectionState()
        self.poll_timeout = poll_timeout
        super().__init__(("127.0.0.1", port), BridgeHandler)

class BridgeHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, format, *args):
        pass  # Lifecycle logs only; do not print request content.

    def _send(self, status, value=None):
        body = b"" if value is None else json.dumps(value, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _body(self):
        if self.headers.get_content_type() != "application/json":
            fail(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type: application/json.")
        if self.headers.get("Transfer-Encoding"):
            fail(400, "INVALID_REQUEST", "Chunked request bodies are not supported.")
        try:
            size = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            fail(400, "INVALID_REQUEST", "Invalid Content-Length.")
        if size < 0:
            fail(400, "INVALID_REQUEST", "Content-Length is required.")
        if size > MAX_BODY_BYTES:
            fail(413, "REQUEST_TOO_LARGE", "Maximum body size is 1 MiB.")
        try:
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError("Incomplete body")
            return json.loads(data.decode("utf-8"), object_pairs_hook=_unique_object,
                              parse_constant=_invalid_constant)
        except (ValueError, RecursionError):
            fail(400, "INVALID_JSON", "Body must be valid UTF-8 JSON with unique keys.")

    def _dispatch(self):
        origin = self.headers.get("Origin")
        parsed_origin = urlsplit(origin) if origin else None
        extension_origin = (parsed_origin and parsed_origin.scheme == "chrome-extension"
                            and bool(parsed_origin.netloc) and parsed_origin.path == ""
                            and not parsed_origin.query and not parsed_origin.fragment)
        local_origin = origin == f"http://127.0.0.1:{self.server.server_port}"
        if origin and not (extension_origin or local_origin):
            fail(403, "FORBIDDEN_ORIGIN", "Only extension origins or local clients are supported.")
        url = urlsplit(self.path)
        if url.query or url.fragment:
            fail(400, "INVALID_REQUEST", "Query parameters are not supported.")
        path = url.path
        manager = self.server.manager
        if path == "/api/connection":
            if self.command != "GET":
                fail(405, "METHOD_NOT_ALLOWED", "Use GET for connection state.")
            self._send(200, self.server.connection_state.snapshot())
        elif path == "/api/connection/mytool":
            if self.command != "POST":
                fail(405, "METHOD_NOT_ALLOWED", "Use POST to register the MyTool session.")
            request = self._body()
            if (not isinstance(request, dict) or set(request) != {"session_id"}
                    or not isinstance(request["session_id"], str)
                    or not request["session_id"].strip()
                    or len(request["session_id"]) > 128):
                fail(400, "INVALID_REQUEST", "A non-blank session_id is required.")
            self._send(200, self.server.connection_state.register_mytool(request["session_id"]))
        elif path == "/api/projects":
            if self.command != "GET":
                fail(405, "METHOD_NOT_ALLOWED", "Use GET for projects.")
            self._send(200, {"projects": self.server.projects.list()})
        elif path.startswith("/api/outputs/"):
            if self.command != "POST":
                fail(405, "METHOD_NOT_ALLOWED", "Use POST to save an output.")
            step = path[len("/api/outputs/"):]
            if not step or "/" in step:
                fail(404, "NOT_FOUND", "Unknown output step.")
            self._send(201, self.server.outputs.save(step, self._body()))
        elif path.startswith("/assets/"):
            if self.command != "GET":
                fail(405, "METHOD_NOT_ALLOWED", "Use GET for application assets.")
            raw_asset = path[len("/assets/"):]
            if not raw_asset or "\\" in raw_asset:
                fail(404, "NOT_FOUND", "Unknown application asset.")
            asset_path = (GUI_ROOT / raw_asset).resolve()
            try:
                asset_path.relative_to(GUI_ROOT)
            except ValueError:
                fail(404, "NOT_FOUND", "Unknown application asset.")
            content_type = ASSET_CONTENT_TYPES.get(asset_path.suffix)
            if content_type is None or not asset_path.is_file():
                fail(404, "NOT_FOUND", "Unknown application asset.")
            body = asset_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)
        elif path == "/":
            if self.command != "GET":
                fail(405, "METHOD_NOT_ALLOWED", "Use GET for the application page.")
            body = (GUI_ROOT / "index.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(body)
        elif path == "/api/jobs":
            if self.command != "POST":
                fail(405, "METHOD_NOT_ALLOWED", "Use POST for job creation.")
            request = self._body()
            if isinstance(request, dict) and request.get("project_id"):
                project = self.server.projects.get(request["project_id"])
                if request.get("project_url") != project["url"]:
                    fail(400, "INVALID_REQUEST", "Project URL does not match the saved project.")
            self._send(201, manager.enqueue(request))
        elif path == "/api/jobs/next":
            if self.command != "GET":
                fail(405, "METHOD_NOT_ALLOWED", "Use GET for claiming jobs.")
            extension_session_id = self.headers.get("X-MyTool-Extension-Session")
            if extension_session_id is not None:
                if not extension_session_id.strip() or len(extension_session_id) > 128:
                    fail(400, "INVALID_REQUEST", "Invalid extension session marker.")
                self.server.connection_state.register_extension(extension_session_id)
            job = manager.next_job(self.server.poll_timeout)
            self._send(204 if job is None else 200, job)
        elif path.startswith("/api/jobs/"):
            tail = path[len("/api/jobs/"):]
            result_route = tail.endswith("/result")
            raw_id = tail[:-len("/result")] if result_route else tail
            if not raw_id or "/" in raw_id:
                fail(404, "NOT_FOUND", "Unknown endpoint; URL-encode job IDs.")
            job_id = unquote(raw_id, encoding="utf-8", errors="strict")
            if result_route and self.command == "POST":
                response = self._body()
                request = manager.store.record(job_id)["request"]
                if isinstance(response, dict) and response.get("status") == "completed":
                    if request["action"] == "create_project" and not response.get("project"):
                        fail(400, "INVALID_REQUEST", "Project creation requires a confirmed project.")
                    if request["action"] != "create_project" and response.get("project"):
                        fail(400, "INVALID_REQUEST", "A prompt result cannot create a project.")
                record = manager.finish(job_id, response)
                if isinstance(response, dict) and response.get("status") == "completed" and response.get("project"):
                    self.server.projects.save(response["project"])
                self._send(200, record)
            elif not result_route and self.command == "GET":
                self._send(200, manager.get(job_id))
            else:
                fail(405, "METHOD_NOT_ALLOWED", "Method is not supported for this endpoint.")
        else:
            fail(404, "NOT_FOUND", "Unknown endpoint.")

    def _handle(self):
        try:
            self._dispatch()
        except ProtocolError as exc:
            self._send(exc.status, {"error": exc.code, "message": str(exc)})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            logging.getLogger(__name__).warning("Client disconnected; no job is requeued.")
        except (UnicodeError, ValueError):
            self._send(400, {"error": "INVALID_REQUEST", "message": "Invalid request URL."})
        except Exception:
            logging.getLogger(__name__).exception("Bridge internal error")
            self._send(500, {"error": "INTERNAL_ERROR", "message": "Bridge internal error."})

    do_GET = _handle
    do_POST = _handle
    do_OPTIONS = _handle
    do_PUT = _handle
    do_DELETE = _handle

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    with BridgeServer(port=args.port) as server:
        logging.info("Bridge listening at http://127.0.0.1:%s", server.server_port)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            logging.info("Bridge stopped; in-memory jobs discarded.")

if __name__ == "__main__":
    main()
