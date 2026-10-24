import importlib
import json
from pathlib import Path
import tempfile
import threading
import urllib.request
import urllib.error
from http.cookiejar import CookieJar
import unittest


PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082')
ADMIN = 'test-admin-only-2468'
TEAM = 'test-team-only-1357'
FAKE_KEY = 'development-fixture-not-a-real-api-key'


class FakeClient:
    def __init__(self, settings):
        self.settings = settings

    def generate(self, prompt, size):
        return PNG


class ImageStudioTests(unittest.TestCase):
    def setUp(self):
        try:
            self.module = importlib.import_module('app.image_studio')
        except ModuleNotFoundError:
            self.fail('QwenImage team service has not been implemented')
        self.tmp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.studio = self.module.ImageStudio(self.root, env={}, client_factory=FakeClient)

    def initialize(self):
        return self.studio.setup(ADMIN, TEAM, allow_local=True)

    def configure(self):
        token = self.initialize()
        self.studio.save(token, {'api_key': FAKE_KEY, 'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'model': 'qwen-image-3.0-pro'})
        return token

    def test_setup_stores_hashes_and_is_not_repeatable(self):
        token = self.initialize()
        self.assertEqual(self.studio.role(token), 'admin')
        saved = (self.root / 'image-studio.json').read_text()
        self.assertNotIn(ADMIN, saved)
        self.assertNotIn(TEAM, saved)
        with self.assertRaises(self.module.ImageStudioError):
            self.initialize()

    def test_cloud_setup_requires_private_initialization_token(self):
        with self.assertRaises(self.module.ImageStudioError):
            self.studio.setup(ADMIN, TEAM, allow_local=False)
        cloud = self.module.ImageStudio(self.root, env={'WORKBENCH_SETUP_TOKEN': 'fixture-setup-token'})
        token = cloud.setup(ADMIN, TEAM, allow_local=False, setup_token='fixture-setup-token')
        self.assertEqual(cloud.role(token), 'admin')

    def test_member_cannot_read_or_write_secret(self):
        self.configure()
        member = self.studio.login('member', TEAM)
        self.assertEqual(self.studio.role(member), 'member')
        self.assertNotIn(FAKE_KEY, json.dumps(self.studio.status(member)))
        with self.assertRaises(self.module.ImageStudioError) as error:
            self.studio.save(member, {'api_key': 'another-key'})
        self.assertEqual(error.exception.status, 403)

    def test_configuration_survives_restart_without_returning_key(self):
        self.configure()
        reloaded = self.module.ImageStudio(self.root, env={})
        token = reloaded.login('admin', ADMIN)
        status = reloaded.status(token)
        self.assertTrue(status['configured'])
        self.assertEqual(status['model'], 'qwen-image-3.0-pro')
        self.assertNotIn(FAKE_KEY, json.dumps(status))

    def test_empty_key_preserves_existing_key_and_clear_is_explicit(self):
        token = self.configure()
        self.studio.save(token, {'api_key': '', 'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'model': 'qwen-image-2.1-turbo'})
        self.assertTrue(self.studio.status(token)['configured'])
        self.studio.clear(token)
        self.assertFalse(self.studio.status(token)['configured'])

    def test_untrusted_destinations_are_rejected(self):
        token = self.initialize()
        for destination in ['http://127.0.0.1:8765', 'https://example.com', 'https://dashscope.aliyuncs.com.evil.example/compatible-mode/v1']:
            with self.subTest(destination=destination), self.assertRaises(self.module.ImageStudioError):
                self.studio.save(token, {'api_key': FAKE_KEY, 'base_url': destination, 'model': 'qwen-image-3.0-pro'})

    def test_generation_requires_auth_and_configuration(self):
        with self.assertRaises(self.module.ImageStudioError):
            self.studio.generate('', {'prompt': 'a bright study desk', 'size': '1024x1024'})
        admin = self.initialize()
        with self.assertRaises(self.module.ImageStudioError):
            self.studio.generate(admin, {'prompt': 'a bright study desk', 'size': '1024x1024'})

    def test_member_generation_is_labeled_and_asset_is_private(self):
        self.configure()
        member = self.studio.login('member', TEAM)
        result = self.studio.generate(member, {'prompt': 'a bright study desk, no computer', 'size': '1024x1024'})
        self.assertEqual(result['status'], 'generated')
        self.assertEqual(result['kind'], 'ai_scene')
        self.assertIn('AI', result['notice'])
        ref = result['asset_url'].rsplit('/', 1)[1]
        self.assertEqual(self.studio.asset(member, ref), PNG)
        with self.assertRaises(self.module.ImageStudioError):
            self.studio.asset('', ref)

    def test_bad_prompt_or_size_does_not_invoke_model(self):
        token = self.configure()
        for body in [{'prompt': '', 'size': '1024x1024'}, {'prompt': 'desk', 'size': '0x0'}, {'prompt': 'x' * 6001, 'size': '1024x1024'}]:
            with self.subTest(body=str(body)[:30]), self.assertRaises(self.module.ImageStudioError):
                self.studio.generate(token, body)

    def test_concurrent_generation_reports_busy(self):
        token = self.configure()
        with self.studio.generation_lock:
            with self.assertRaises(self.module.ImageStudioError) as error:
                self.studio.generate(token, {'prompt': 'desk', 'size': '1024x1024'})
        self.assertEqual(error.exception.status, 409)

    def test_logout_and_invalid_password(self):
        token = self.initialize()
        self.studio.logout(token)
        self.assertEqual(self.studio.role(token), 'guest')
        with self.assertRaises(self.module.ImageStudioError):
            self.studio.login('admin', 'wrong-password')

    def test_corrupt_persistent_state_fails_closed(self):
        (self.root / 'image-studio.json').write_text('{broken')
        with self.assertRaises(self.module.ImageStudioError):
            self.module.ImageStudio(self.root, env={}).setup(ADMIN, TEAM, allow_local=True)


class TransportTests(unittest.TestCase):
    def test_official_images_protocol_and_credential_free_download(self):
        module = importlib.import_module('app.image_studio')
        calls = []

        class Response:
            def __init__(self, data): self.data = data
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return self.data[:limit]

        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                return Response(json.dumps({'data': [{'url': 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/fixture.png'}]}).encode() if len(calls) == 1 else PNG)

        client = module.QwenImageClient({'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': 'https://fixture-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'}, opener=Opener())
        self.assertEqual(client.generate('fixture background', '1024x1024'), PNG)
        payload = json.loads(calls[0].data)
        self.assertTrue(calls[0].full_url.endswith('/images/generations'))
        self.assertEqual(payload['n'], 1)
        self.assertNotIn(FAKE_KEY, calls[0].data.decode())
        self.assertEqual(calls[0].get_header('Authorization'), 'Bearer ' + FAKE_KEY)
        self.assertIsNone(calls[1].get_header('Authorization'))

    def test_shared_dashscope_domains_use_native_generation_not_missing_images_route(self):
        module = importlib.import_module('app.image_studio')
        for host in ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com']:
            with self.subTest(host=host):
                calls = []
                class Response:
                    def __init__(self, data): self.data = data
                    def __enter__(self): return self
                    def __exit__(self, *args): pass
                    def read(self, limit): return self.data[:limit]
                class Opener:
                    def open(self, request, timeout):
                        calls.append(request)
                        native = {'output': {'choices': [{'message': {'content': [{'text': 'fixture'}, {'image': 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/fixture.png'}]}}]}}
                        return Response(json.dumps(native).encode() if len(calls) == 1 else PNG)
                client = module.QwenImageClient({'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': 'https://' + host + '/compatible-mode/v1'}, opener=Opener())
                self.assertEqual(client.generate('fixture background', '1536x2048'), PNG)
                self.assertEqual(calls[0].full_url, 'https://' + host + '/api/v1/services/aigc/multimodal-generation/generation')
                payload = json.loads(calls[0].data)
                self.assertEqual(payload['input']['messages'][0]['content'], [{'text': 'fixture background'}])
                self.assertEqual(payload['parameters']['size'], '1536*2048')
                self.assertEqual(payload['parameters']['n'], 1)
                self.assertIsNone(calls[1].get_header('Authorization'))

    def test_failed_generation_is_not_retried_on_another_protocol(self):
        import io
        module = importlib.import_module('app.image_studio')
        calls = []
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                raise urllib.error.HTTPError(request.full_url, 404, 'Not Found', {}, io.BytesIO(b'{}'))
        client = module.QwenImageClient({'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': module.DEFAULT_BASE}, opener=Opener())
        with self.assertRaises(module.ImageStudioError):
            client.generate('fixture background', '1024x1024')
        self.assertEqual(len(calls), 1)

    def test_live_dashscope_accelerated_oss_result_is_downloaded_without_key(self):
        module = importlib.import_module('app.image_studio')
        calls = []
        class Response:
            def __init__(self, data): self.data = data
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return self.data[:limit]
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                native = {'output': {'choices': [{'message': {'content': [{'image': 'https://dashscope-fixture.oss-accelerate.aliyuncs.com/fixture.png?signature=fixture'}]}}]}}
                return Response(json.dumps(native).encode() if len(calls) == 1 else PNG)
        client = module.QwenImageClient({'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': module.DEFAULT_BASE}, opener=Opener())
        self.assertEqual(client.generate('fixture background', '1024x1024'), PNG)
        self.assertIsNone(calls[1].get_header('Authorization'))

    def test_similar_accelerated_domain_is_not_downloaded(self):
        module = importlib.import_module('app.image_studio')
        calls = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit):
                return b'{"output":{"choices":[{"message":{"content":[{"image":"https://dashscope-fixture.oss-accelerate.aliyuncs.com.example/fixture.png"}]}}]}}'
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                return Response()
        client = module.QwenImageClient({'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': module.DEFAULT_BASE}, opener=Opener())
        with self.assertRaises(module.ImageStudioError):
            client.generate('fixture', '1024x1024')
        self.assertEqual(len(calls), 1)

    def test_rejected_image_url_is_not_fetched(self):
        module = importlib.import_module('app.image_studio')
        calls = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{"data":[{"url":"http://127.0.0.1/private"}]}'
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                return Response()
        client = module.QwenImageClient({'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': module.DEFAULT_BASE}, opener=Opener())
        with self.assertRaises(module.ImageStudioError):
            client.generate('fixture', '1024x1024')
        self.assertEqual(len(calls), 1)


class ImageHttpTests(unittest.TestCase):
    def setUp(self):
        from app.image_studio import ImageStudio
        from app.server import WorkbenchServer
        self.tmp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.addCleanup(self.tmp.cleanup)
        self.studio = ImageStudio(Path(self.tmp.name), env={}, client_factory=FakeClient)
        self.server = WorkbenchServer(0, image_studio=self.studio)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(CookieJar()))

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def request(self, path, body=None, headers=None):
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            response = self.opener.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.read(), response.headers

    def setup_admin(self):
        return self.request('/api/images/setup', {'admin_password': ADMIN, 'team_password': TEAM})

    def test_setup_cookie_settings_and_member_generation(self):
        status, _, headers = self.setup_admin()
        self.assertEqual(status, 200)
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        status, raw, _ = self.request('/api/images/settings', {'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1'})
        self.assertEqual(status, 200)
        self.assertNotIn(FAKE_KEY.encode(), raw)
        self.assertNotIn(FAKE_KEY.encode(), self.request('/api/images/status')[1])
        self.request('/api/images/logout', {})
        self.assertEqual(self.request('/api/images/login', {'role': 'member', 'password': TEAM})[0], 200)
        self.assertEqual(self.request('/api/images/settings', {})[0], 403)
        status, raw, _ = self.request('/api/images/generate', {'prompt': 'fictional background', 'size': '1024x1024'})
        self.assertEqual(status, 200)
        result = json.loads(raw)
        self.assertEqual(self.request(result['asset_url'])[1], PNG)
        self.request('/api/images/logout', {})
        self.assertEqual(self.request(result['asset_url'])[0], 401)

    def test_remote_setup_and_cross_origin_requests_are_rejected(self):
        self.assertEqual(self.request('/api/images/setup', {'admin_password': ADMIN, 'team_password': TEAM}, {'X-Workbench-Proxy': '1'})[0], 403)
        self.assertEqual(self.request('/api/images/setup', {'admin_password': ADMIN, 'team_password': TEAM}, {'Origin': 'https://outside.example'})[0], 403)

    def test_shared_text_settings_enable_pipeline_and_reject_member_changes(self):
        self.setup_admin()
        self.request('/api/images/settings', {'api_key': FAKE_KEY, 'model': 'qwen-image-3.0-pro', 'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1'})
        status, raw, _ = self.request('/api/images/text-model/settings', {'model': 'qwen3-vl-plus'})
        self.assertEqual(status, 200)
        self.assertNotIn(FAKE_KEY.encode(), raw)
        status = json.loads(self.request('/api/status')[1])
        self.assertTrue(status['model_configured'])
        self.request('/api/images/logout', {})
        self.assertEqual(self.request('/api/model/probe', {})[0], 401)
        self.assertEqual(self.request('/api/generate', {})[0], 401)
        self.assertEqual(self.request('/api/progress', {})[0], 401)
        self.assertEqual(self.request('/api/progress/unknown')[0], 401)
        self.request('/api/images/login', {'role': 'member', 'password': TEAM})
        status, raw, _ = self.request('/api/progress', {})
        self.assertEqual(status, 200)
        ref = json.loads(raw)['progress_ref']
        self.assertEqual(self.request('/api/progress/' + ref)[0], 200)
        self.assertEqual(self.request('/api/images/text-model/settings', {'model': 'qwen-vl-max'})[0], 403)
        self.assertEqual(self.request('/api/images/text-model/probe', {})[0], 403)

    def test_private_files_are_never_served(self):
        self.setup_admin()
        for path in ['/private/image-studio.json', '/.env', '/api/images/unexpected/settings']:
            self.assertEqual(self.request(path, {} if path.startswith('/api/') else None)[0], 404)


if __name__ == '__main__':
    unittest.main()
