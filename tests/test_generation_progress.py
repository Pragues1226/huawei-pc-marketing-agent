"""Progress acceptance uses synthetic fixtures; no paid or knowledge-base calls."""
import importlib
import json
from pathlib import Path
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import urllib.error
import unittest

from agent.model import ModelError
from agent.pipeline import MarketingPipeline
from app.service import scene_strategy
from test_pipeline import FakeKnowledge, FakeModel, TASK


class GenerationProgressTests(unittest.TestCase):
    def store(self, **kwargs):
        from app import server
        self.assertTrue(hasattr(server, 'ProgressStore'), 'Live progress tracking is missing')
        return server.ProgressStore(**kwargs)

    def test_progress_does_not_advance_with_elapsed_time(self):
        now = [0]
        store = self.store(clock=lambda: now[0])
        ref = store.create()['progress_ref']
        now[0] = 120
        self.assertEqual(store.snapshot(ref)['completed'], 0)
        update = store.begin(ref)
        update('write')
        self.assertEqual(store.snapshot(ref)['completed'], 2)
        store.finish(ref, 'blocked')
        self.assertEqual(store.snapshot(ref)['completed'], 2)
        self.assertEqual(store.snapshot(ref)['status'], 'blocked')

    def test_finished_progress_is_terminal_and_single_use(self):
        store = self.store()
        ref = store.create()['progress_ref']
        update = store.begin(ref)
        with self.assertRaises(ModelError): store.begin(ref)
        update('review')
        store.finish(ref, 'ready')
        update('extract')
        self.assertEqual(store.snapshot(ref)['completed'], 4)
        self.assertEqual(store.snapshot(ref)['status'], 'ready')

    def test_progress_expires_and_capacity_is_bounded(self):
        now = [0]
        store = self.store(capacity=1, ttl=10, clock=lambda: now[0])
        ref = store.create()['progress_ref']
        with self.assertRaises(ModelError): store.create()
        now[0] = 11
        with self.assertRaises(ModelError): store.snapshot(ref)
        self.assertTrue(store.create()['progress_ref'])

    def test_pipeline_reports_only_stages_it_actually_enters(self):
        model = FakeModel()
        pipeline = MarketingPipeline(FakeKnowledge(), scene_strategy, lambda: model)
        events = []
        self.assertIn('progress', importlib.import_module('inspect').signature(pipeline.generate).parameters, 'Pipeline has no stage reporting')
        result = pipeline.generate(TASK, ['doc','image'], 'fixture', progress=lambda phase: events.append((phase,len(model.calls))))
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(events, [('sources',0),('extract',0),('write',1),('review',2)])

    def test_error_distinguishes_claim_text_from_invalid_fact_reference(self):
        model = FakeModel()
        pipeline = MarketingPipeline(FakeKnowledge(), scene_strategy, lambda: model)
        model.report['claims'][0]['text'] = '模型改写了稿件中不存在的句子'
        result = pipeline.generate(TASK, ['doc','image'], 'fixture')
        self.assertEqual(result['status'],'blocked')
        self.assertTrue(any('第1条' in c['detail'] and '未逐字出现在稿件' in c['detail'] for c in result['review']['checks']))
        model.report['claims'][0]['text'] = model.article['body']
        model.report['claims'][0]['fact_ids'] = ['F99']
        result = pipeline.generate(TASK, ['doc','image'], 'fixture')
        self.assertEqual(result['status'],'blocked')
        self.assertTrue(any('第1条' in c['detail'] and '事实编号' in c['detail'] for c in result['review']['checks']))

    def test_http_polling_observes_actual_work_and_records_failures(self):
        from app.server import WorkbenchServer
        from app.image_studio import ImageStudio
        from app.service import WorkbenchService
        entered, release = threading.Event(), threading.Event()
        class WaitingModel(FakeModel):
            def complete(self, system, data, images=None):
                if not self.calls:
                    entered.set()
                    if not release.wait(5): raise AssertionError('Fixture stalled')
                return super().complete(system,data,images)
        model = WaitingModel()
        service = WorkbenchService(model_factory=lambda:model)
        service.pipeline = MarketingPipeline(FakeKnowledge(),scene_strategy,lambda:model)
        service.record_access = lambda name: None
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            with WorkbenchServer(0,service=service,image_studio=ImageStudio(directory,env={})) as server:
                worker = threading.Thread(target=server.serve_forever,daemon=True);worker.start()
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                base = f'http://127.0.0.1:{server.server_port}'
                def request(path, body=None):
                    req = urllib.request.Request(base+path, data=None if body is None else json.dumps(body).encode(),headers={} if body is None else {'Content-Type':'application/json'})
                    try: response = opener.open(req,timeout=8)
                    except urllib.error.HTTPError as error: response = error
                    with response: return response.status,json.load(response)
                try:
                    ref = request('/api/progress',{})[1]['progress_ref']
                    payload = {'task':TASK,'references':['doc','image'],'progress_ref':ref}
                    with ThreadPoolExecutor(1) as executor:
                        future = executor.submit(request,'/api/generate',payload)
                        self.assertTrue(entered.wait(3))
                        snapshot = request('/api/progress/'+ref)[1]
                        self.assertEqual(snapshot,{'phase':'extract','completed':1,'status':'running','total':4})
                        self.assertFalse(future.done())
                        release.set()
                        self.assertEqual(future.result()[1]['status'],'ready')
                    self.assertEqual(request('/api/progress/'+ref)[1]['completed'],4)
                    self.assertEqual(request('/api/generate',payload)[0],400)
                    self.assertEqual(request('/api/progress/unknown')[0],404)
                    model.report['claims'][0]['text']='Not present in article'
                    ref = request('/api/progress',{})[1]['progress_ref']
                    payload['progress_ref']=ref
                    status, blocked = request('/api/generate',payload)
                    self.assertEqual(status,200)
                    self.assertEqual(blocked['status'],'blocked')
                    snapshot = request('/api/progress/'+ref)[1]
                    self.assertEqual(snapshot['status'],'blocked')
                    self.assertEqual(snapshot['completed'],3)
                    model.report['claims'][0]['text'] = model.article['body']
                    calls = len(model.calls)
                    status, checked = request('/api/revise',{'run_ref':blocked['run_ref'],'recheck_only':True,'article':{'body':'forged client content'}})
                    self.assertEqual(status,200)
                    self.assertEqual(checked['status'],'ready')
                    self.assertEqual(len(model.calls),calls+1)
                    self.assertEqual(checked['article'],blocked['article'])
                finally:
                    release.set();server.shutdown();worker.join(timeout=3)


if __name__ == '__main__': unittest.main()
