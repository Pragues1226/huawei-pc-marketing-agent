import base64
import unittest
from unittest.mock import Mock

from ima.client import ImaError
from ima.retrieval import ImaKnowledge, ResourceRedirects, fetch_resource, official_resource_url

NAME = "教学测试知识库"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=")


class KnowledgeClient:
    def search_bases(self, query, cursor=""):
        return {"info_list": [{"kb_id": "private-base-test", "kb_name": NAME}], "is_end": True}

    def search_or_browse(self, kb_id, query):
        return {"mode": "search", "data": {"info_list": [
            {"media_id": "private-doc-test", "title": "教学事实.md", "media_type": 7, "parent_folder_id": "private-folder-test"},
            {"media_id": "private-image-test", "title": "教学图片.png", "media_type": 9, "parent_folder_id": "private-folder-test"},
            {"media_id": "private-folder-test", "title": "教学目录", "media_type": 99},
            {"media_id": "private-note-test", "title": "教学笔记", "media_type": 11},
        ], "is_end": True}}

    def list_entries(self, kb_id, cursor="", folder_id=None):
        return {"knowledge_list": [{"media_id": "private-doc-test", "title": "教学事实.md", "media_type": 7}], "current_path": [{"folder_id": "private-folder-test", "name": "教学目录"}], "is_end": True}

    def media_info(self, media_id):
        if "note" in media_id:
            return {"media_type": 11, "notebook_ext_info": {"notebook_id": "private-note-content-test"}}
        image = "image" in media_id
        return {"media_type": 9 if image else 7, "url_info": {"url": "https://test.ima.myqcloud.com/image.png" if image else "https://test.ima.myqcloud.com/document.md", "headers": {"X-IMA-Sign": "temporary-signature-placeholder"}}}

    def note_content(self, note_id):
        return {"content": "教学笔记正文\n不是实际产品信息"}


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.client = KnowledgeClient()
        self.fetch = Mock(side_effect=lambda info: (PNG, "image/png", None) if "image.png" in info["url"] else ("# 教学材料\n\n原文引号与限定条件必须保留。".encode(), "text/markdown", "utf-8"))
        self.knowledge = ImaKnowledge(client_factory=lambda: self.client, fetcher=self.fetch)
        self.items = self.knowledge.search("教学", NAME)["items"]

    def by_kind(self, kind):
        return next(item for item in self.items if item["kind"] == kind)

    def test_real_text_is_returned_with_source_and_without_private_ids(self):
        result = self.knowledge.read(self.by_kind("document")["ref"], NAME)
        self.assertIn("原文引号与限定条件必须保留。", result["text"])
        self.assertEqual(result["source"]["path"], ["教学目录"])
        self.assertEqual(result["source"]["knowledge_base"], NAME)
        self.assertNotIn("private-", str(result))
        self.assertNotIn("temporary-signature", str(result))

    def test_image_uses_local_asset_reference(self):
        result = self.knowledge.read(self.by_kind("image")["ref"], NAME)
        self.assertTrue(result["asset_url"].startswith("/api/asset/"))
        self.assertNotIn("myqcloud", result["asset_url"])
        data, mime = self.knowledge.asset(result["ref"])
        self.assertEqual(data, PNG)
        self.assertEqual(mime, "image/png")

    def test_html_is_not_misreported_as_image(self):
        self.fetch.side_effect = None
        self.fetch.return_value = (b"<html>login page</html>", "text/html", "utf-8")
        with self.assertRaises(ImaError):
            self.knowledge.read(self.by_kind("image")["ref"], NAME)

    def test_html_is_not_misreported_as_document(self):
        self.fetch.side_effect = None
        self.fetch.return_value = (b"<html>login page</html>", "text/html", "utf-8")
        with self.assertRaises(ImaError):
            self.knowledge.read(self.by_kind("document")["ref"], NAME)

    def test_unknown_and_wrong_library_refs_are_rejected(self):
        for reference, name in [("unknown", NAME), (self.by_kind("document")["ref"], "another library")]:
            with self.assertRaises(ImaError):
                self.knowledge.read(reference, name)
        self.fetch.assert_not_called()

    def test_folders_cannot_be_read_as_facts(self):
        with self.assertRaises(ImaError):
            self.knowledge.read(self.by_kind("folder")["ref"], NAME)
        self.fetch.assert_not_called()

    def test_note_content_uses_read_only_note_branch(self):
        note = next(x for x in self.items if x["title"] == "教学笔记")
        self.assertIn("教学笔记正文", self.knowledge.read(note["ref"], NAME)["text"])
        self.fetch.assert_not_called()

    def test_bundle_reads_actual_documents_and_images(self):
        result = self.knowledge.retrieve([self.by_kind("document")["ref"], self.by_kind("image")["ref"]], NAME, "test-request")
        self.assertEqual(result["status"], "retrieved")
        self.assertEqual(result["request_id"], "test-request")
        self.assertEqual(len(result["documents"]), 1)
        self.assertEqual(len(result["images"]), 1)
        self.assertNotIn("facts", result)

    def test_bundle_failure_is_reported_as_partial(self):
        result = self.knowledge.retrieve([self.by_kind("document")["ref"], "invalid-reference"], NAME, "test")
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["warnings"]), 1)

    def test_bundle_is_bounded_and_deduplicates(self):
        reference = self.by_kind("document")["ref"]
        self.assertEqual(len(self.knowledge.retrieve([reference, reference], NAME, "test")["documents"]), 1)
        with self.assertRaises(ImaError):
            self.knowledge.retrieve([reference] * 9, NAME, "test")

    def test_expired_ref_requires_fresh_search(self):
        reference = self.by_kind("document")["ref"]
        self.knowledge.references[reference]["expires"] = 0
        with self.assertRaises(ImaError):
            self.knowledge.read(reference, NAME)

    def test_browse_folder_and_breadcrumbs(self):
        result = self.knowledge.browse(NAME, self.by_kind("folder")["ref"])
        self.assertEqual(result["mode"], "directory")
        self.assertEqual(result["items"][0]["title"], "教学事实.md")
        self.assertEqual(result["breadcrumbs"][0]["title"], "教学目录")
        self.assertNotIn("private-", str(result))

    def test_nonofficial_resource_urls_are_rejected(self):
        for url in ["http://test.ima.myqcloud.com/file", "file:///etc/passwd", "https://127.0.0.1/file", "https://test.myqcloud.com.untrusted.invalid/file", "https://user:password@test.myqcloud.com/file"]:
            self.assertFalse(official_resource_url(url))
            with self.assertRaises(ImaError):
                fetch_resource({"url": url})
        self.assertTrue(official_resource_url("https://test.ima.myqcloud.com/file"))

    def test_credentials_are_never_forwarded_as_resource_headers(self):
        with self.assertRaises(ImaError):
            fetch_resource({"url": "https://test.ima.myqcloud.com/file", "headers": {"ima-openapi-apikey": "placeholder"}})

    def test_cross_host_redirect_is_rejected(self):
        from urllib.request import Request
        request = Request("https://test.ima.myqcloud.com/file", headers={"Authorization": "temporary-placeholder"})
        with self.assertRaises(ImaError):
            ResourceRedirects().redirect_request(request, None, 302, "redirect", {}, "https://other.myqcloud.com/file")

    def test_directory_pagination_uses_server_stored_cursor(self):
        item = {"media_id": "private-page-document", "title": "分页测试.md", "media_type": 7}
        self.client.list_entries = Mock(side_effect=[{"knowledge_list": [item], "is_end": False, "next_cursor": "private-next-cursor"}, {"knowledge_list": [item], "is_end": True}])
        first = self.knowledge.browse(NAME)
        self.assertTrue(first["next_page_ref"])
        self.assertNotIn("private-next-cursor", str(first))
        second = self.knowledge.browse(NAME, page_ref=first["next_page_ref"])
        self.assertIsNone(second["next_page_ref"])
        self.assertEqual(self.client.list_entries.call_args.kwargs["cursor"], "private-next-cursor")

    def test_search_pagination_rejects_changed_query(self):
        self.client.search_or_browse = Mock(return_value={"mode": "search", "data": {"info_list": [], "is_end": False, "next_cursor": "private-search-page"}})
        first = self.knowledge.search("original", NAME)
        with self.assertRaises(ImaError):
            self.knowledge.search("changed", NAME, first["next_page_ref"])


if __name__ == "__main__":
    unittest.main()
