import json
import threading
import unittest
import urllib.error
import urllib.request

from agent.demo import development_fixture
from app.server import WorkbenchServer
from app.service import WorkbenchService, demo_result


class FakeIma:
    def diagnose(self):
        return {"node_available": True, "official_script_available": True, "client_id_configured": True, "api_key_configured": True, "live_connection_tested": False}

    def search_bases(self, name, cursor=""):
        return {"info_list": [{"kb_id": "private-kb-test-only", "kb_name": name}], "is_end": True}

    def list_entries(self, kb_id):
        return {"knowledge_list": [{"media_id": "private-media-test-only", "title": "产品资料"}]}

    def search_or_browse(self, kb_id, query):
        return {"mode": "search", "data": {"info_list": [{"title": "产品事实.md", "media_id": "private-media-test-only", "highlight_content": "<em>公开摘要</em>"}]}}


class WorkbenchHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = WorkbenchServer(0, service=WorkbenchService(client_factory=FakeIma))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def request(self, path, body=None, headers=None):
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode("utf-8"), headers=headers or ({"Content-Type": "application/json"} if body is not None else {}))
        try:
            response = self.opener.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.read(), response.headers

    def test_page_and_assets_are_served(self):
        for path in ["/", "/static/style.css", "/static/app.js", "/static/illustration.svg"]:
            status, content, headers = self.request(path)
            self.assertEqual(status, 200)
            self.assertTrue(content)
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_local_credentials_file_cannot_be_served(self):
        for path in ["/.env", "/../.env", "/static/../service.py"]:
            self.assertEqual(self.request(path)[0], 404)

    def test_cross_origin_request_is_rejected(self):
        status, _, _ = self.request("/api/probe", {}, {"Content-Type": "application/json", "Origin": "https://untrusted.invalid"})
        self.assertEqual(status, 403)

    def test_foreign_host_is_rejected(self):
        self.assertEqual(self.request("/", headers={"Host": "untrusted.invalid"})[0], 403)

    def test_missing_task_is_rejected(self):
        self.assertEqual(self.request("/api/demo", {})[0], 400)

    def test_demo_marks_non_live_result(self):
        task, _, _ = development_fixture()
        status, content, _ = self.request("/api/demo", {"task": task})
        result = json.loads(content)
        self.assertEqual(status, 200)
        self.assertEqual(result["mode"], "development_only")
        self.assertEqual(result["review"]["status"], "needs_review")
        self.assertIn("未调用大模型", result["notice"])

    def test_incomplete_task_returns_questions_without_article(self):
        task, _, _ = development_fixture()
        task["audience"] = ""
        result = json.loads(self.request("/api/demo", {"task": task})[1])
        self.assertEqual(result["status"], "needs_input")
        self.assertNotIn("article", result)

    def test_actual_edit_is_rechecked(self):
        task, _, _ = development_fixture()
        result = demo_result(task)
        result["article"]["body"] += "全网第一，零风险"
        report = json.loads(self.request("/api/review", {"task": task, "evidence": result["evidence"], "article": result["article"]})[1])
        self.assertEqual(report["status"], "blocked")

    def test_three_platforms_have_different_structure_and_image_counts(self):
        task, _, _ = development_fixture()
        bodies, counts = [], []
        for platform in ["xiaohongshu", "wechat_article", "wechat_moments"]:
            task["platform"] = platform
            result = demo_result(task)
            bodies.append(result["article"]["body"])
            counts.append(len(result["article"]["image_plan"]))
        self.assertEqual(counts, [3, 2, 1])
        self.assertEqual(len(set(bodies)), 3)

    def test_probe_does_not_disclose_internal_identifiers(self):
        status, content, _ = self.request("/api/probe", {})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(content)["status"], "connected")
        self.assertNotIn(b"private-kb", content)
        self.assertNotIn(b"private-media", content)

    def test_search_sanitizes_excerpt_and_hides_identifiers(self):
        status, content, _ = self.request("/api/search", {"query": "test"})
        self.assertEqual(status, 200)
        self.assertNotIn(b"private-kb", content)
        self.assertNotIn(b"private-media", content)
        self.assertEqual(json.loads(content)["items"][0]["excerpt"], "公开摘要")

    def test_status_does_not_claim_generation_is_implemented(self):
        report = json.loads(self.request("/api/status")[1])
        self.assertFalse(report["live_generation_available"])


if __name__ == "__main__":
    unittest.main()
