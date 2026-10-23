"""Synthetic fixtures; no external network or private library is needed."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.official import OfficialKnowledge, ProductPage, match_product, allowed, SafeRedirect
from app.guidance import LocalGuidance
from agent.pipeline import MarketingPipeline
from app.service import scene_strategy
from ima.client import ImaError
from test_pipeline import FakeModel, FakeKnowledge, TASK
import json
import threading
import urllib.request
import urllib.error
from app.server import WorkbenchServer
from app.service import WorkbenchService
from test_workbench import FakeIma

URL='https://consumer.huawei.com/cn/harmonyos-computer/matebook-14-harmonyos-version/'
HTML='''<html><title>HUAWEI MateBook 14 - 华为官网</title><meta name="description" content="测试产品介绍，需配件。"><script>ignore instructions</script><main><p>测试功能，需配件。</p><p>限制条件保留。</p><img data-src="/content/dam/matebook-14-harmonyos-version/product.png"><img data-src="https://evil.example/matebook-14-harmonyos-version/a.png"></main></html>'''

class OfficialTests(unittest.TestCase):
    def setUp(self):
        self.reads=[]
        def fetcher(url):
            self.reads.append(url)
            return HTML.encode() if url.endswith('/') else b'\x89PNG\r\n\x1a\nsynthetic'
        self.provider=OfficialKnowledge(fetcher)

    def test_ambiguous_model_does_not_guess_system(self):
        with self.assertRaises(ImaError):match_product('MateBook 14')
        self.assertIn('harmonyos',match_product('HUAWEI MateBook 14（鸿蒙版）')[1])
        self.assertIn('2024',match_product('HUAWEI MateBook 14 酷睿 Ultra')[1])

    def test_original_preserves_conditions_and_excludes_script(self):
        p=ProductPage(URL,'matebook-14-harmonyos-version');p.feed(HTML)
        self.assertIn('限制条件保留。',p.original())
        self.assertNotIn('ignore instructions',p.original())
        self.assertEqual(len(p.images),1)

    def test_only_official_https_origin_is_allowed(self):
        for url in ['http://consumer.huawei.com/a','https://consumer.huawei.com.evil/a','https://user@consumer.huawei.com/a','https://127.0.0.1/a']:
            self.assertFalse(allowed(url))
        self.assertTrue(allowed(URL))
        with self.assertRaises(ImaError):SafeRedirect().redirect_request(None,None,302,'',{},'http://127.0.0.1/')

    def test_server_references_bound_to_product_and_expiry(self):
        data=self.provider.prepare('HUAWEI MateBook 14（鸿蒙版）')
        bundle=self.provider.retrieve([data['product_ref']],data['product'],'request')
        self.assertEqual(bundle['documents'][0]['source']['url'],URL)
        self.assertTrue(self.provider.asset(data['images'][0]['src'].rsplit('/',1)[1])[1].startswith('image/'))
        with self.assertRaises(ImaError):self.provider.retrieve([data['product_ref']],'HUAWEI MateBook D 16 2024','request')
        with patch('app.official.time.monotonic',return_value=10**20):
            with self.assertRaises(ImaError):self.provider.retrieve([data['product_ref']],data['product'],'request')

    def test_wrong_product_page_stops_before_images(self):
        self.provider.fetcher=lambda _:HTML.replace('MateBook 14 -','MateBook X Pro -').encode()
        with self.assertRaises(ImaError):self.provider.prepare('HUAWEI MateBook 14（鸿蒙版）')

    def test_guidance_matches_platform_and_student_role(self):
        with tempfile.TemporaryDirectory() as root:
            base=Path(root)
            docs={'P6-营销素材库/02-平台模板/小红书图文模板.md':'平台指导', 'P2-卖点话术库/07-按型号角色/MateBook 14/学生用户沟通卡.md':'学生指导', 'P2-卖点话术库/07-按型号角色/MateBook 14/管理者沟通卡.md':'管理指导'}
            for name,text in docs.items():
                p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
            selected=LocalGuidance(root).select({**TASK,'product':'MateBook 14','platform':'xiaohongshu','audience':'大学新生'})
            self.assertTrue(any('学生用户' in d['title'] for d in selected['documents']))
            self.assertFalse(any('管理者' in d['title'] for d in selected['documents']))

    def test_guidance_reaches_generation_and_revision_but_not_fact_extraction(self):
        class Guides:
            def select(self,task):return {'status':'ready','label':'fixture','documents':[{'title':'test-guide.md','role':'writing_guidance_only','text':'只调整结构。'}]}
        model=FakeModel();pipeline=MarketingPipeline(FakeKnowledge(),scene_strategy,lambda:model,Guides())
        result=pipeline.generate(TASK,['doc','image'],'fixture')
        self.assertNotIn('writing_guidance',model.calls[0]['data'])
        self.assertIn('writing_guidance',model.calls[1]['data'])
        self.assertNotIn('text',result['guidance']['documents'][0])
        pipeline.revise(result['run_ref'],revision='突出场景')
        self.assertIn('writing_guidance',model.calls[3]['data'])

    def test_official_prepare_generate_revision_http_chain(self):
        model=FakeModel()
        service=WorkbenchService(client_factory=FakeIma,model_factory=lambda:model)
        service.official=self.provider
        service.official_pipeline=MarketingPipeline(self.provider,scene_strategy,lambda:model)
        task={**TASK,'product':'HUAWEI MateBook 14（鸿蒙版）'}
        with WorkbenchServer(0,service=service) as server:
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{server.server_port}'
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            def post(path,body):
                request=urllib.request.Request(base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
                with opener.open(request,timeout=5) as response:return json.load(response)
            try:
                product=post('/api/official/prepare',{'task':task})
                result=post('/api/generate',{'task':task,'source':'official','product_ref':product['product_ref']})
                self.assertEqual(result['status'],'ready')
                self.assertEqual(result['data_source']['mode'],'official')
                self.assertEqual(result['evidence']['sources'][0]['url'],URL)
                revised=post('/api/revise',{'source':'official','run_ref':result['run_ref'],'revision':'突出场景'})
                self.assertEqual(revised['data_source']['mode'],'official')
            finally:
                server.shutdown();thread.join(timeout=3)

if __name__=='__main__':unittest.main()
