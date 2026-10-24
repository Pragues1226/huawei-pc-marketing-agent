"""No network: image-grounded writing and explicit per-image review coverage."""
from copy import deepcopy
import unittest

from agent.pipeline import MarketingPipeline
from agent.model import ModelError
from app.service import scene_strategy
from test_pipeline import FakeKnowledge, FakeModel, TASK


class ImageGroundingTests(unittest.TestCase):
    def setUp(self):
        self.model=FakeModel();self.pipeline=MarketingPipeline(FakeKnowledge(),scene_strategy,lambda:self.model)
    def generate(self):return self.pipeline.generate(TASK,['doc','image'],'fixture')

    def test_writer_receives_actual_candidate_images(self):
        self.generate()
        self.assertTrue(self.model.calls[1]['images'],'Writer was generating captions without seeing images')
        self.assertTrue(self.model.calls[1]['images'][0]['url'].startswith('data:image/png;base64,'))
        self.assertIn('I1',self.model.calls[1]['images'][0]['label'])

    def test_writer_uses_extracted_facts_without_reintroducing_full_source_claims(self):
        self.generate()
        writing=self.model.calls[1]['data']
        self.assertNotIn('documents',writing)
        self.assertEqual(writing['allowed_product_fact_ids'],['F1'])
        self.assertTrue(self.model.calls[2]['data']['documents'])

    def test_rewriter_sees_images_and_previous_review_problems(self):
        self.model.report['checks'][1]['status']='fail'
        self.model.report['checks'][1]['detail']='I1是图标，不能描述为功能界面'
        first=self.generate()
        self.pipeline.revise(first['run_ref'],'纠正图注或更换配图')
        rewrite=self.model.calls[3]
        self.assertTrue(rewrite['images'])
        self.assertTrue(rewrite['data']['previous_review_issues'])

    def test_explicit_image_results_cover_selected_images(self):
        self.model.report['checks']=[c for c in self.model.report['checks'] if c['category']!='image']
        self.model.report['image_checks']=[{'image_id':'I1','status':'pass','detail':'观察到合成测试图片，图注匹配'}]
        result=self.generate()
        self.assertEqual(result['status'],'ready')
        self.assertEqual(self.model.calls[2]['data']['required_image_ids'],['I1'])
        self.assertEqual(self.model.calls[2]['data']['image_review_targets'][0]['image_id'],'I1')

    def test_unknown_or_missing_image_ids_cannot_pass(self):
        self.model.report['checks']=[c for c in self.model.report['checks'] if c['category']!='image']
        self.model.report['image_checks']=[{'image_id':'I99','status':'pass','detail':'不应采用此无效引用'}]
        result=self.generate()
        self.assertEqual(result['status'],'blocked')
        self.assertTrue(any('I1' in c['detail'] and c['status']=='pending' for c in result['review']['checks']))

    def test_caption_mismatch_remains_blocked(self):
        self.model.report['checks']=[c for c in self.model.report['checks'] if c['category']!='image']
        self.model.report['image_checks']=[{'image_id':'I1','status':'fail','detail':'实际是图标，图注却称功能界面'}]
        result=self.generate()
        self.assertEqual(result['status'],'blocked')
        self.assertIsNone(result['result']['article'])


if __name__=='__main__':unittest.main()
