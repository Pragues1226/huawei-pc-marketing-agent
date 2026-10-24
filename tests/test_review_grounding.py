"""Synthetic acceptance for the reviewer fact boundary and recoverable drafts."""
from copy import deepcopy
import unittest

from agent.model import ModelError
from agent.pipeline import MarketingPipeline
from app.service import scene_strategy
from test_pipeline import FakeKnowledge, FakeModel, TASK, STATEMENT


class ReviewGroundingTests(unittest.TestCase):
    def setUp(self):
        self.model = FakeModel()
        self.pipeline = MarketingPipeline(FakeKnowledge(), scene_strategy, lambda:self.model)

    def generate(self): return self.pipeline.generate(TASK,['doc','image'],'fixture')

    def test_review_receives_exactly_the_article_fact_scope(self):
        self.model.extraction['facts'].append({**deepcopy(self.model.extraction['facts'][0]),'statement':'未在稿件使用的虚构功能。'})
        self.generate()
        review = self.model.calls[-1]['data']
        self.assertEqual([f['fact_id'] for f in review['evidence']['facts']], ['F1'])
        self.assertEqual([q['fact_id'] for q in review['quotes']], ['F1'])
        self.assertEqual(review['allowed_claim_fact_ids'], ['F1'])

    def test_sixth_invalid_claim_preserves_blocked_draft_without_invalid_ids(self):
        self.model.report['claims'] = [deepcopy(self.model.report['claims'][0]) for _ in range(6)]
        self.model.report['claims'][5]['fact_ids'] = ['F99']
        result = self.generate()
        self.assertEqual(result['status'],'blocked')
        self.assertIsNone(result['result']['article'])
        self.assertIsNotNone(result['article'])
        self.assertTrue(result['run_ref'])
        invalid = [c for c in result['review']['checks'] if '第6条' in c['detail']]
        self.assertEqual(len(invalid),1)
        self.assertEqual(invalid[0]['status'],'pending')
        self.assertNotIn('F99',invalid[0]['evidence_ids'])

    def test_only_recheck_keeps_article_and_makes_one_review_call(self):
        self.model.report['claims'][0]['fact_ids']=['F99']
        first = self.generate()
        self.assertEqual(first['status'],'blocked')
        self.model.report['claims'][0]['fact_ids']=['F1']
        self.assertTrue(hasattr(self.pipeline,'recheck'),'No review-only recovery')
        second = self.pipeline.recheck(first['run_ref'])
        self.assertEqual(len(self.model.calls),4)
        self.assertEqual(second['status'],'ready')
        self.assertEqual(first['article'],second['article'])
        self.assertNotEqual(first['task']['request_id'],second['task']['request_id'])

    def test_report_format_and_transport_failure_cannot_discard_or_approve_draft(self):
        for report in [{}, {'claims':[{}],'checks':[{}]}, {'claims':[],'checks':[]}]:
            self.model.report=report
            result=self.generate()
            self.assertEqual(result['status'],'blocked')
            self.assertTrue(result['run_ref'])
            self.assertIsNone(result['result']['article'])

    def test_bad_claim_text_and_unsupported_pass_remain_pending(self):
        for update in [{'text':'没有出现在稿件的句子'}, {'fact_ids':[]}]:
            self.model.report = FakeModel().report
            self.model.report['claims'][0].update(update)
            result=self.generate()
            self.assertEqual(result['status'],'blocked')
            self.assertTrue(any(c['status']=='pending' for c in result['review']['checks']))

    def test_review_connection_failure_preserves_draft_without_automatic_retry(self):
        original = self.model.complete
        attempts = []
        def complete(system,data,images=None):
            if '单独的复核步骤' in system:
                attempts.append(True)
                raise ModelError('fixture connection timeout')
            return original(system,data,images)
        self.model.complete = complete
        result = self.generate()
        self.assertEqual(result['status'],'blocked')
        self.assertIsNotNone(result['article'])
        self.assertTrue(result['run_ref'])
        self.assertEqual(len(attempts),1)


if __name__ == '__main__': unittest.main()
