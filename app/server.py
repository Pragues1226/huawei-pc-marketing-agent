"""Loopback-only development workbench, using Python's standard HTTP server."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlsplit

from agent.preflight import prepare_task, review_structure
from agent.model import ModelError
from ima.client import ImaError
from .service import DEFAULT_KB, WorkbenchService, demo_result

STATIC = Path(__file__).resolve().parent / "static"
ASSETS = {"/": ("index.html", "text/html; charset=utf-8"), "/static/style.css": ("style.css", "text/css; charset=utf-8"), "/static/app.js": ("app.js", "text/javascript; charset=utf-8"), "/static/illustration.svg": ("illustration.svg", "image/svg+xml")}
ASSETS["/static/knowledge.css"] = ("knowledge.css", "text/css; charset=utf-8")
ASSETS["/static/ui-polish.css"] = ("ui-polish.css", "text/css; charset=utf-8")
ASSETS["/static/live.js"] = ("live.js", "text/javascript; charset=utf-8")
ASSETS["/static/semifinal.css"] = ("semifinal.css", "text/css; charset=utf-8")
ASSETS["/static/strategy-map.svg"] = ("strategy-map.svg", "image/svg+xml")


class WorkbenchServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port=8765, service=None):
        self.service = service or WorkbenchService()
        super().__init__(("127.0.0.1", port), Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "PCWorkbench"
    sys_version = ""

    def log_message(self, *args):
        pass

    def host_ok(self):
        return self.headers.get("Host", "") in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}

    def send_payload(self, status, payload, content_type="application/json; charset=utf-8"):
        if not isinstance(payload, bytes):
            payload = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.host_ok():
            return self.send_payload(403, {"error": "仅允许本机工作台访问"})
        path = urlsplit(self.path).path
        if path == "/api/status":
            return self.send_payload(200, self.server.service.status())
        if path == "/health":
            return self.send_payload(200, {"status": "ok"})
        if path.startswith("/api/asset/"):
            try:
                data, mime = self.server.service.knowledge.asset(path.removeprefix("/api/asset/"))
                return self.send_payload(200, data, mime)
            except ImaError as error:
                return self.send_payload(404, {"error": str(error)})
        if path not in ASSETS:
            return self.send_payload(404, {"error": "页面不存在"})
        filename, mime = ASSETS[path]
        return self.send_payload(200, (STATIC / filename).read_bytes(), mime)

    def do_POST(self):
        if not self.host_ok():
            return self.send_payload(403, {"error": "仅允许本机工作台访问"})
        origin = self.headers.get("Origin")
        valid_origins = {f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"}
        if origin and origin not in valid_origins:
            return self.send_payload(403, {"error": "请求来源不匹配"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.send_payload(415, {"error": "请使用 JSON 请求"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 262144:
                return self.send_payload(413, {"error": "请求为空或内容过大"})
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(body, dict):
                raise ValueError()
            path = urlsplit(self.path).path
            if path in {"/api/prepare", "/api/demo"}:
                if "task" not in body:
                    raise ValueError()
                result = prepare_task(body["task"]) if path.endswith("prepare") else demo_result(body["task"], body.get("angle_id"))
            elif path == "/api/review":
                if not all(key in body for key in ["task", "evidence", "article"]):
                    raise ValueError()
                result = review_structure(body["task"], body["evidence"], body["article"])
            elif path == "/api/model/probe":
                result = self.server.service.model_factory().probe()
            elif path == "/api/generate":
                name = body.get("knowledge_base", DEFAULT_KB)
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 200 or "task" not in body:
                    raise ValueError()
                result = self.server.service.pipeline.generate(body["task"], body.get("references"), name.strip())
                if result.get("article"):
                    self.server.service.record_access(name.strip())
            elif path == "/api/revise":
                result = self.server.service.pipeline.revise(body.get("run_ref"), revision=body.get("revision"), edited=body.get("article"))
            elif path in {"/api/probe", "/api/search", "/api/browse", "/api/read", "/api/retrieve"}:
                name = body.get("knowledge_base", DEFAULT_KB)
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 200:
                    raise ValueError()
                if path.endswith("probe"):
                    result = self.server.service.probe(name.strip())
                elif path.endswith("browse"):
                    result = self.server.service.knowledge.browse(name.strip(), body.get("folder_ref"), body.get("page_ref"))
                elif path.endswith("read"):
                    result = self.server.service.knowledge.read(body.get("ref"), name.strip())
                elif path.endswith("retrieve"):
                    request_id = body.get("request_id") or str(uuid4())
                    if not isinstance(request_id, str) or len(request_id) > 200:
                        raise ValueError()
                    result = self.server.service.knowledge.retrieve(body.get("references"), name.strip(), request_id)
                else:
                    query = body.get("query")
                    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200:
                        raise ValueError()
                    result = self.server.service.search(query.strip(), name.strip(), body.get("page_ref"))
                if not path.endswith("probe"):
                    self.server.service.record_access(name.strip())
            else:
                return self.send_payload(404, {"error": "功能入口不存在"})
            return self.send_payload(200, result)
        except (ValueError, UnicodeDecodeError, TypeError):
            return self.send_payload(400, {"error": "任务格式不正确，请检查填写内容"})
        except ImaError as error:
            return self.send_payload(400, {"error": str(error), "kind": error.kind})
        except ModelError as error:
            return self.send_payload(400, {"error": str(error), "kind": "model"})
        except Exception:
            return self.send_payload(500, {"error": "操作未完成，请重试或检查本机配置"})
