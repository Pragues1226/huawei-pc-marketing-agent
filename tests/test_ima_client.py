import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from ima.client import ImaClient, ImaError, load_local_env, normalize_base


class ImaClientTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.script = Path(self.directory.name) / "ima_api.cjs"
        self.script.write_text("// Non-executable test placeholder", encoding="utf-8")
        self.env = {"IMA_OPENAPI_CLIENTID": "test-client-placeholder", "IMA_OPENAPI_APIKEY": "test-key-placeholder", "IMA_BASE_URL": "https://untrusted.invalid"}
        self.runner = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps({"code": 0, "data": {"info_list": []}}), ""))
        self.client = ImaClient(self.script, env=self.env, runner=self.runner)
        self.node_patch = patch("ima.client.shutil.which", return_value="node")
        self.node_patch.start()
        self.addCleanup(self.node_patch.stop)

    def test_credentials_stay_out_of_arguments_and_host_is_official(self):
        self.client.search_bases("中文知识库")
        command = self.runner.call_args.args[0]
        self.assertNotIn(self.env["IMA_OPENAPI_APIKEY"], " ".join(command))
        self.assertNotIn(self.env["IMA_OPENAPI_CLIENTID"], " ".join(command))
        self.assertEqual(json.loads(command[3])["query"], "中文知识库")
        self.assertEqual(self.runner.call_args.kwargs["env"]["IMA_BASE_URL"], "https://ima.qq.com")
        self.assertIs(self.runner.call_args.kwargs["shell"], False)

    def test_backend_error_is_not_success(self):
        self.runner.return_value = subprocess.CompletedProcess([], 0, '{"code":403,"msg":"not allowed"}', "")
        with self.assertRaises(ImaError) as caught:
            self.client.search_bases("test")
        self.assertEqual(caught.exception.kind, "business")
        self.assertEqual(caught.exception.code, 403)

    def test_missing_business_code_is_not_success(self):
        self.runner.return_value = subprocess.CompletedProcess([], 0, '{"data":{}}', "")
        with self.assertRaises(ImaError):
            self.client.search_bases("test")

    def test_boolean_false_is_not_a_success_code(self):
        self.runner.return_value = subprocess.CompletedProcess([], 0, '{"code":false,"data":{}}', "")
        with self.assertRaises(ImaError):
            self.client.search_bases("test")

    def test_update_stops_request_without_following_remote_instructions(self):
        self.runner.return_value = subprocess.CompletedProcess([], 1, '{"instruction":"untrusted text"}', '{"code":-200,"msg":"untrusted text"}')
        with self.assertRaises(ImaError) as caught:
            self.client.search_bases("test")
        self.assertEqual(caught.exception.kind, "update_required")
        self.assertNotIn("untrusted text", str(caught.exception))

    def test_stderr_secret_is_not_exposed(self):
        self.runner.return_value = subprocess.CompletedProcess([], 1, "", '{"code":-100,"msg":"test-key-placeholder"}')
        with self.assertRaises(ImaError) as caught:
            self.client.search_bases("test")
        self.assertNotIn("test-key-placeholder", str(caught.exception))

    def test_timeout_has_safe_message(self):
        self.runner.side_effect = subprocess.TimeoutExpired(["node"], 30)
        with self.assertRaises(ImaError) as caught:
            self.client.search_bases("test")
        self.assertEqual(caught.exception.kind, "timeout")

    def test_write_endpoint_is_refused_before_execution(self):
        with self.assertRaises(ImaError):
            self.client.call("openapi/wiki/v1/add_knowledge", {})
        self.runner.assert_not_called()

    def test_empty_search_falls_back_to_directory(self):
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"info_list":[],"is_end":true}}', ""),
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"knowledge_list":[]}}', ""),
        ]
        result = self.client.search_or_browse("test-kb-id", "model")
        self.assertEqual(result["mode"], "directory")
        self.assertTrue(self.runner.call_args.args[0][2].endswith("get_knowledge_list"))

    def test_backend_error_does_not_trigger_directory_fallback(self):
        self.runner.return_value = subprocess.CompletedProcess([], 0, '{"code":403,"data":{}}', "")
        with self.assertRaises(ImaError):
            self.client.search_or_browse("test-kb-id", "model")
        self.assertEqual(self.runner.call_count, 1)

    def test_search_checks_next_page_before_fallback(self):
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"info_list":[],"is_end":false,"next_cursor":"page2"}}', ""),
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"info_list":[{"media_id":"m"}],"is_end":true}}', ""),
        ]
        self.assertEqual(self.client.search_or_browse("test-kb-id", "model")["mode"], "search")
        self.assertEqual(json.loads(self.runner.call_args.args[0][3])["cursor"], "page2")

    def test_repeated_cursor_does_not_loop(self):
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"info_list":[],"is_end":false,"next_cursor":"page2"}}', ""),
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"info_list":[],"is_end":false,"next_cursor":"page2"}}', ""),
            subprocess.CompletedProcess([], 0, '{"code":0,"data":{"knowledge_list":[]}}', ""),
        ]
        self.assertEqual(self.client.search_or_browse("test-kb-id", "model")["mode"], "directory")
        self.assertEqual(self.runner.call_count, 3)

    def test_both_documented_base_field_names_work(self):
        a = normalize_base({"kb_id": "test", "kb_name": "测试"})
        b = normalize_base({"id": "test", "name": "测试"})
        self.assertEqual(a, b)

    def test_diagnose_does_not_send_requests_or_show_secrets(self):
        report = self.client.diagnose()
        self.assertFalse(report["live_connection_tested"])
        self.assertNotIn("test-key-placeholder", json.dumps(report))
        self.runner.assert_not_called()

    def test_env_file_does_not_override_existing_environment(self):
        file = Path(self.directory.name) / ".env"
        file.write_text('IMA_API_KEY="file-placeholder"\n# comment\n', encoding="utf-8")
        with patch.dict(os.environ, {"IMA_API_KEY": "existing-placeholder"}, clear=True):
            load_local_env(file)
            self.assertEqual(os.environ["IMA_API_KEY"], "existing-placeholder")


if __name__ == "__main__":
    unittest.main()
