"""Synthetic data only: these tests never access ima or a model service."""
from copy import deepcopy
import io
import json
import unittest
from unittest.mock import patch
import urllib.error

from agent.model import ModelClient, ModelError, NoRedirect
from agent.pipeline import MarketingPipeline
from app.service import scene_strategy

TASK = {"request_id": "synthetic", "product": "虚构PC-Q（测试版）", "audience": "资料整理用户", "scenario": "整理资料", "platform": "wechat_moments", "goal": "咨询体验"}
STATEMENT = "虚构测试功能需要配件D才可使用。"
ARTICLE = {"title": "整理资料前，先确认需求", "lead": "", "body": STATEMENT, "cta": "带着需求咨询。", "tags": [], "image_plan": [{"image_id": "I1", "position": "封面", "caption": "虚构测试图片", "reason": "说明外观"}], "used_fact_ids": ["F1"]}


class FakeKnowledge:
    def __init__(self):
        source = {"title": "虚构测试资料.md", "path": ["测试库", TASK["product"]], "retrieved_at": "2026-10-18T10:00:00Z"}
        self.bundle = {"documents": [{"kind": "document", "text": STATEMENT, "source": source}], "images": [{"kind": "image", "source": {**source, "title": "虚构图片.png"}, "asset_url": "/api/asset/mock"}], "warnings": []}
        self.calls = 0

    def retrieve(self, references, name, request_id):
        self.calls += 1
        return deepcopy(self.bundle)

    def asset(self, reference):
        if reference != "mock": raise ValueError()
        return b"synthetic-image-input", "image/png"


class FakeModel:
    def __init__(self):
        self.calls = []
        self.extraction = {"facts": [{"source_id": "S1", "quote_ids": ["S1:P1"], "statement": STATEMENT, "conditions": ["配件D"], "product_match": True}], "questions": [], "conflicts": []}
        self.article = {**deepcopy(ARTICLE), "scenario_analysis": "资料整理任务，先核对配件。", "strategy": "朋友圈聚焦一个有条件的功能。"}
        self.report = {"claims": [{"text": STATEMENT, "fact_ids": ["F1"], "status": "pass", "detail": "条件未改变"}], "checks": [{"category": c, "status": "pass", "detail": "合成测试中已检查", "evidence_ids": ["I1"] if c == "image" else []} for c in ("fact", "image", "compliance", "platform")]}

    def complete(self, system, data, images=None):
        self.calls.append({"data": deepcopy(data), "images": images})
        if "只负责从提供" in system: return deepcopy(self.extraction)
        if "单独的复核步骤" in system: return deepcopy(self.report)
        return deepcopy(self.article)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.knowledge, self.model = FakeKnowledge(), FakeModel()
        self.pipeline = MarketingPipeline(self.knowledge, scene_strategy, lambda: self.model)

    def run_task(self, **updates):
        return self.pipeline.generate({**TASK, **updates}, ["mock-doc", "mock-image"], "synthetic-only")

    def test_missing_task_data_never_reads_or_calls_model(self):
        self.assertEqual(self.run_task(audience="")["status"], "needs_input")
        self.assertEqual(self.knowledge.calls, 0)
        self.assertEqual(self.model.calls, [])

    def test_image_shortage_stops_before_model_cost(self):
        result = self.run_task(platform="xiaohongshu")
        self.assertEqual(result["status"], "needs_input")
        self.assertEqual(self.model.calls, [])

    def test_partial_retrieval_does_not_generate(self):
        self.knowledge.bundle["warnings"] = ["读取失败"]
        self.assertEqual(self.run_task()["status"], "needs_input")
        self.assertEqual(self.model.calls, [])

    def test_quote_must_exist_in_selected_original(self):
        self.model.extraction["facts"][0]["quote_ids"] = ["S1:P999"]
        with self.assertRaisesRegex(ModelError, "逐字定位"): self.run_task()
        self.assertEqual(len(self.model.calls), 1)

    def test_wrong_source_id_is_rejected(self):
        self.model.extraction["facts"][0]["source_id"] = "S99"
        with self.assertRaises(ModelError): self.run_task()

    def test_unconfirmed_product_is_rejected(self):
        self.model.extraction["facts"][0]["product_match"] = False
        with self.assertRaisesRegex(ModelError, "型号"): self.run_task()

    def test_conflicting_originals_never_produce_a_draft(self):
        self.model.extraction["conflicts"] = ["资料冲突，需人工确认"]
        result = self.run_task()
        self.assertEqual(result["status"], "blocked")
        self.assertIsNone(result["result"]["article"])
        self.assertEqual(len(self.model.calls), 1)

    def test_model_questions_stop_before_generation(self):
        self.model.extraction["questions"] = ["请确认销售版本"]
        self.assertEqual(self.run_task()["status"], "needs_input")
        self.assertEqual(len(self.model.calls), 1)

    def test_success_requires_three_steps_and_real_image_inputs(self):
        result = self.run_task()
        self.assertEqual(result["status"], "ready")
        self.assertEqual(len(self.model.calls), 3)
        self.assertTrue(self.model.calls[-1]["images"][0]["url"].startswith("data:image/png;base64,"))
        self.assertEqual(result["result"]["article"], ARTICLE)
        self.assertEqual(result["quotes"][0]["quote"], STATEMENT)

    def test_missing_image_review_cannot_be_ready(self):
        self.model.report["checks"] = [c for c in self.model.report["checks"] if c["category"] != "image"]
        result = self.run_task()
        self.assertEqual(result["status"], "blocked")
        self.assertIsNone(result["result"]["article"])
        self.assertIsNotNone(result["article"])

    def test_pending_semantics_cannot_be_ready(self):
        self.model.report["claims"][0]["status"] = "pending"
        self.assertEqual(self.run_task()["status"], "blocked")

    def test_verifier_cannot_cite_unknown_fact(self):
        self.model.report["claims"][0]["fact_ids"] = ["F99"]
        with self.assertRaisesRegex(ModelError, "引用无效"): self.run_task()

    def test_verifier_cannot_pass_a_claim_without_evidence(self):
        self.model.report["claims"][0]["fact_ids"] = []
        with self.assertRaisesRegex(ModelError, "无依据"): self.run_task()

    def test_absolute_claim_blocked_before_semantic_verification(self):
        self.model.article["body"] += "全网第一"
        result = self.run_task()
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(len(self.model.calls), 2)

    def test_revision_uses_server_originals_and_new_request(self):
        first = self.run_task()
        second = self.pipeline.revise(first["run_ref"], "语气更自然")
        self.assertNotEqual(first["task"]["request_id"], second["task"]["request_id"])
        self.assertEqual(second["task"]["request_id"], second["evidence"]["request_id"])
        self.assertEqual(self.model.calls[3]["data"]["documents"][0]["text"], STATEMENT)
        self.assertEqual(self.model.calls[3]["data"]["task"]["revision"], "语气更自然")

    def test_manual_edit_invalidates_previous_verification(self):
        first = self.run_task()
        article = deepcopy(ARTICLE); article["body"] += "零风险"
        second = self.pipeline.revise(first["run_ref"], edited=article)
        self.assertEqual(second["status"], "blocked")
        self.assertIsNone(second["result"]["article"])

    def test_expired_or_forged_run_cannot_be_revised(self):
        with self.assertRaises(ModelError): self.pipeline.revise("fake", "修改")
        result = self.run_task()
        with patch("agent.pipeline.time.monotonic", return_value=10**12):
            with self.assertRaises(ModelError): self.pipeline.revise(result["run_ref"], "修改")


class FakeOpener:
    def __init__(self, payload): self.payload, self.request = payload, None
    def open(self, request, timeout):
        self.request = request
        return io.BytesIO(self.payload)


class ModelTransportTests(unittest.TestCase):
    def setUp(self):
        self.env = {"LLM_API_KEY": "synthetic-test-key", "LLM_BASE_URL": "https://model.test/v1", "LLM_MODEL": "test-model"}

    def test_no_default_destination_or_network_when_config_missing(self):
        opener = FakeOpener(b"")
        with self.assertRaisesRegex(ModelError, "配置不完整"): ModelClient(env={}, opener=opener).complete("test", {})
        self.assertIsNone(opener.request)

    def test_secure_destination_and_json_shape(self):
        opener = FakeOpener(json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": '{"ok":true}'}}]}).encode())
        self.assertTrue(ModelClient(env=self.env, opener=opener).probe()["status"] == "connected")
        self.assertEqual(opener.request.full_url, "https://model.test/v1/chat/completions")
        self.assertNotIn("synthetic-test-key", opener.request.data.decode())

    def test_incomplete_or_unparseable_output_is_never_used(self):
        for payload in [b"not-json", json.dumps({"choices": [{"finish_reason": "length", "message": {"content": '{"ok":true}'}}]}).encode()]:
            with self.assertRaises(ModelError): ModelClient(env=self.env, opener=FakeOpener(payload)).complete("test", {})

    def test_reject_credentials_and_queries_in_endpoint(self):
        for url in ["http://example.test/v1", "https://user:pass@example.test/v1", "https://example.test/v1?key=value"]:
            with self.assertRaises(ModelError): ModelClient(env={**self.env,"LLM_BASE_URL":url}, opener=FakeOpener(b"")).complete("test", {})

    def test_redirect_does_not_forward_bearer_token(self):
        with self.assertRaises(ModelError): NoRedirect().redirect_request(None,None,302,"",{},"https://other.test")


if __name__ == "__main__": unittest.main()
