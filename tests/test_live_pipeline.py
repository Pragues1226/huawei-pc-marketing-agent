import json
import unittest

from agent.model import LLMClient, ModelError
from agent.pipeline import run_live, verify_article


PRODUCT = "HUAWEI MateBook 14（鸿蒙版）"


def task():
    return {
        "request_id": "live-test", "product": PRODUCT, "audience": "大学新生",
        "scenario": "开学购机，兼顾课堂学习和日常携带。", "platform": "xiaohongshu",
        "goal": "帮助判断是否适合", "purchase_stage": "了解与比较",
    }


def context(image_count=3):
    source = {"knowledge_base": "测试库", "title": "MateBook 14 鸿蒙版产品资料.md", "path": ["P1", "MateBook 14 鸿蒙版"], "retrieved_at": "2026-10-18T08:00:00+00:00"}
    images = []
    for index in range(image_count):
        images.append({"kind": "image", "source": {**source, "title": f"MateBook 14 鸿蒙版图片{index + 1}.png"}, "asset_url": f"/api/asset/image-{index + 1}"})
    return {"request_id": "raw", "status": "retrieved", "documents": [{"kind": "document", "source": source, "text": "产品采用轻量化设计，适合在教室和宿舍之间携带。"}], "images": images, "warnings": []}


class FakeModel:
    def __init__(self, quote="轻量化设计"):
        self.quote = quote
        self.calls = []

    def diagnose(self):
        return {"api_key_configured": True, "base_url_configured": True, "model_configured": True, "ready": True, "note": "test"}

    def json_task(self, instruction, payload):
        self.calls.append((instruction, payload))
        if "提取本次明确型号" in instruction:
            return {
                "scenario_analysis": "面向大学新生的开学携带场景。",
                "strategy": {"angle": "从课堂到宿舍的移动路线切入。", "priorities": ["携带", "学习任务"], "questions": ["确认专业软件"]},
                "facts": [{"statement": "产品采用轻量化设计。", "conditions": ["具体体验因配置而异"], "source_ids": ["source-1"], "quotes": [{"source_id": "source-1", "quote": self.quote}]}],
            }
        if "仅用输入 facts" in instruction:
            return {
                "title": "开学带电脑，先看一天怎么用", "lead": "从课堂到宿舍，先把携带场景想清楚。",
                "body": "产品采用轻量化设计，适合关注日常携带的同学。", "cta": "可到店结合自己的课程安排体验。",
                "tags": ["开学购机", "学习装备"], "used_fact_ids": ["fact-1"],
                "image_plan": [{"image_id": f"image-{i}", "position": f"第{i}段后", "caption": f"产品图{i}", "reason": "展示当前型号"} for i in range(1, 4)],
            }
        return {"checks": [
            {"category": "fact", "status": "pass", "detail": "正文声明与事实一致。", "evidence_ids": ["fact-1"]},
            {"category": "compliance", "status": "pass", "detail": "未发现高风险营销表达。", "evidence_ids": []},
            {"category": "platform", "status": "pass", "detail": "符合小红书结构要求。", "evidence_ids": []},
        ]}


class Response:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _):
        return self.value


class LivePipelineTests(unittest.TestCase):
    def test_complete_evidence_reaches_ready(self):
        result = run_live(task(), context(), FakeModel())
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["article"]["used_fact_ids"], ["fact-1"])
        self.assertEqual(len(result["evidence"]["images"]), 3)
        self.assertEqual(result["evidence"]["facts"][0]["quotes"][0]["quote"], "轻量化设计")
        self.assertTrue(all(check["status"] == "pass" for check in result["verification"]))

    def test_quote_must_exist_in_original_document(self):
        result = run_live(task(), context(), FakeModel(quote="原文中不存在的参数"))
        self.assertEqual(result["status"], "blocked")
        self.assertIsNone(result["article"])

    def test_wrong_model_images_do_not_count(self):
        raw = context()
        for image in raw["images"]:
            image["source"]["title"] = "另一个型号.png"
            image["source"]["path"] = ["P1", "另一个型号"]
        result = run_live(task(), raw, FakeModel())
        self.assertEqual(result["status"], "blocked")
        self.assertIn("至少需要 3 张", result["verification"][0]["detail"])

    def test_skipped_items_do_not_create_duplicate_source_ids(self):
        raw = context()
        raw["documents"].insert(0, {"kind": "document", "source": {}, "text": ""})
        raw["images"].insert(0, {"kind": "image", "source": {}, "asset_url": ""})
        result = run_live(task(), raw, FakeModel())
        ids = [source["source_id"] for source in result["evidence"]["sources"]]
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(ids), len(set(ids)))

    def test_risky_manual_edit_is_blocked_before_model_review(self):
        ready = run_live(task(), context(), FakeModel())
        article = ready["article"]
        article["body"] += " 全网第一，零风险。"
        report = verify_article(task(), ready["evidence"], article, FakeModel())
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(any(check["category"] == "compliance" and check["status"] == "fail" for check in report["checks"]))

    def test_model_client_sends_key_only_in_header_and_parses_json(self):
        captured = {}
        payload = json.dumps({"choices": [{"message": {"content": "```json\n{\"ok\": true}\n```"}}]}).encode()

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return Response(payload)

        client = LLMClient("secret-test-key", "https://models.example/v1", "test-model", opener=opener)
        self.assertEqual(client.json_task("test", {"value": 1}), {"ok": True})
        self.assertEqual(captured["request"].full_url, "https://models.example/v1/chat/completions")
        self.assertEqual(captured["request"].get_header("Authorization"), "Bearer secret-test-key")
        self.assertNotIn(b"secret-test-key", captured["request"].data)

    def test_optional_reasoning_effort_replaces_temperature(self):
        captured = {}
        payload = json.dumps({"choices": [{"message": {"content": "{\"ok\": true}"}}]}).encode()

        def opener(request, timeout):
            captured["body"] = json.loads(request.data)
            return Response(payload)

        client = LLMClient("key", "https://models.example/v1", "test-model", opener=opener, reasoning_effort="low")
        client.json_task("test", {})
        self.assertEqual(captured["body"]["reasoning_effort"], "low")
        self.assertNotIn("temperature", captured["body"])

    def test_insecure_remote_model_url_is_rejected(self):
        client = LLMClient("key", "http://models.example", "model", opener=lambda *_args, **_kwargs: None)
        with self.assertRaises(ModelError):
            client.json_task("test", {})


if __name__ == "__main__":
    unittest.main()
