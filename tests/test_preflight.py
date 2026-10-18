import unittest
from copy import deepcopy

from agent.demo import development_fixture
from agent.preflight import prepare_task, review_structure, validate_shape


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.task, self.evidence, self.article = development_fixture()

    def review(self):
        return review_structure(self.task, self.evidence, self.article)

    def test_synthetic_data_never_certifies_ready(self):
        report = self.review()
        self.assertEqual(report["status"], "needs_review")
        self.assertTrue(any(c["status"] == "pending" for c in report["checks"]))

    def test_missing_audience_requests_clarification(self):
        self.task["audience"] = " "
        self.assertEqual(prepare_task(self.task)["status"], "needs_input")
        self.assertEqual(self.review()["status"], "blocked")

    def test_unconfirmed_product_requests_clarification(self):
        self.task["product"] = "MateBook（具体版本待确认）"
        self.assertEqual(prepare_task(self.task)["status"], "needs_input")

    def test_wrong_model_fact_is_blocked(self):
        self.evidence["facts"][0]["product"] = "另一个教学虚构型号"
        self.assertEqual(self.review()["status"], "blocked")

    def test_wrong_model_image_is_blocked(self):
        self.evidence["images"][0]["product"] = "另一个教学虚构型号"
        self.assertEqual(self.review()["status"], "blocked")

    def test_old_request_evidence_is_blocked(self):
        self.evidence["request_id"] = "old-task"
        self.assertEqual(self.review()["status"], "blocked")

    def test_fabricated_fact_reference_is_blocked(self):
        self.article["used_fact_ids"].append("nonexistent")
        self.assertEqual(self.review()["status"], "blocked")

    def test_fabricated_image_reference_is_blocked(self):
        self.article["image_plan"][0]["image_id"] = "nonexistent"
        self.assertEqual(self.review()["status"], "blocked")

    def test_missing_source_is_blocked(self):
        self.evidence["sources"] = []
        self.assertEqual(self.review()["status"], "blocked")

    def test_duplicate_images_cannot_satisfy_count(self):
        self.article["image_plan"] = [deepcopy(self.article["image_plan"][0]) for _ in range(3)]
        self.assertEqual(self.review()["status"], "blocked")

    def test_partial_retrieval_does_not_produce_final_output(self):
        self.evidence["status"] = "partial"
        self.assertEqual(self.review()["status"], "blocked")

    def test_platform_switch_changes_image_requirement(self):
        self.article["image_plan"] = self.article["image_plan"][:1]
        self.assertEqual(self.review()["status"], "blocked")
        self.task["platform"] = "wechat_moments"
        self.assertEqual(self.review()["status"], "needs_review")

    def test_risky_promotion_in_caption_is_caught(self):
        self.article["image_plan"][0]["caption"] = "全网第一，零风险"
        report = self.review()
        self.assertEqual(report["status"], "blocked")
        self.assertTrue(any(c["category"] == "compliance" and c["status"] == "fail" for c in report["checks"]))

    def test_price_expression_requires_review(self):
        self.article["body"] += " 到手价 999 元。"
        self.assertTrue(any("价格或权益" in c["detail"] and c["status"] == "pending" for c in self.review()["checks"]))

    def test_invalid_shape_is_safe(self):
        report = review_structure(None, {}, [])
        self.assertEqual(report["status"], "blocked")

    def test_source_timestamp_is_validated(self):
        self.evidence["sources"][0]["retrieved_at"] = "not-a-date"
        self.assertTrue(validate_shape("retrieval", self.evidence))

    def test_empty_image_placement_is_blocked(self):
        self.article["image_plan"][0]["position"] = " "
        self.assertEqual(self.review()["status"], "blocked")


if __name__ == "__main__":
    unittest.main()
