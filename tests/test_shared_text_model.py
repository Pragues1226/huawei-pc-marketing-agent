import base64
import importlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib


ADMIN = 'fixture-admin-password'
TEAM = 'fixture-team-password'
KEY = 'fixture-shared-key-not-a-real-key'


class SharedTextModelTests(unittest.TestCase):
    def setUp(self):
        self.module = importlib.import_module('app.image_studio')
        self.tmp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.studio = self.module.ImageStudio(self.root, env={})
        self.admin = self.studio.setup(ADMIN, TEAM, allow_local=True)
        self.studio.save(self.admin, {'api_key': KEY, 'model': 'qwen-image-3.0-pro', 'base_url': self.module.DEFAULT_BASE})
        if not hasattr(self.studio, 'save_text_model'):
            self.fail('Website text/vision model settings have not been implemented')

    def test_text_model_reuses_key_without_duplicating_it(self):
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        client = self.studio.text_model_client()
        self.assertEqual(client.model, 'qwen3-vl-plus')
        self.assertEqual(client.key, KEY)
        self.assertTrue(client.diagnose()['configured'])
        saved = (self.root / 'image-studio.json').read_text()
        self.assertEqual(saved.count(KEY), 1)
        self.assertNotIn(KEY, json.dumps(self.studio.status()))

    def test_bailian_client_requests_json_in_non_thinking_mode(self):
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        requests = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'{"choices":[{"finish_reason":"stop","message":{"content":"{\\"ok\\":true}"}}]}'
        class Opener:
            def open(self, request, timeout):
                requests.append(request)
                return Response()
        client = self.studio.text_model_client()
        client.opener = Opener()
        self.assertEqual(client.complete('Return JSON', {'operation': 'fixture'}), {'ok': True})
        payload = json.loads(requests[0].data)
        self.assertEqual(payload['response_format'], {'type': 'json_object'})
        self.assertFalse(payload['enable_thinking'])

    def test_member_cannot_change_text_settings(self):
        member = self.studio.login('member', TEAM)
        with self.assertRaises(self.module.ImageStudioError) as error:
            self.studio.save_text_model(member, {'model': 'qwen3-vl-plus'})
        self.assertEqual(error.exception.status, 403)

    def test_clearing_shared_key_disables_text_model(self):
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        self.studio.clear(self.admin)
        self.assertFalse(self.studio.text_model_client().diagnose()['configured'])

    def test_saved_text_model_survives_restart(self):
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        loaded = self.module.ImageStudio(self.root, env={})
        self.assertEqual(loaded.text_model_client().model, 'qwen3-vl-plus')
        self.assertTrue(loaded.text_model_client().diagnose()['configured'])

    def test_existing_environment_configuration_is_preserved_until_admin_selects_shared_key(self):
        other = self.module.ImageStudio(self.root, env={'LLM_API_KEY': 'fixture-env-key', 'LLM_BASE_URL': 'https://fixture.example/v1', 'LLM_MODEL': 'fixture-old-model'})
        self.assertEqual(other.text_model_client().model, 'fixture-old-model')

    def test_vision_probe_attaches_real_png_and_checks_model_observation(self):
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        class VisionClient:
            def diagnose(self): return {'configured': True}
            def complete(self, system, data, images=None):
                image = base64.b64decode(images[0]['url'].split(',', 1)[1])
                width, height = struct.unpack('>II', image[16:24])
                self_width = width
                if self_width != 64 or height != 64:
                    raise AssertionError('Invalid vision probe image')
                pos, raw = 8, b''
                while pos < len(image):
                    length = struct.unpack('>I', image[pos:pos+4])[0]
                    if image[pos+4:pos+8] == b'IDAT': raw += image[pos+8:pos+8+length]
                    pos += length + 12
                pixel = tuple(zlib.decompress(raw)[1:4])
                return {'ok': True, 'dominant_color': {(255,0,0):'red',(0,255,0):'green',(0,0,255):'blue'}[pixel]}
        self.studio.text_model_client = lambda: VisionClient()
        result = self.studio.probe_text_model(self.admin)
        self.assertTrue(result['image_input_tested'])
        self.assertTrue(self.studio.status()['text_model']['vision_verified'])

    def test_wrong_visual_answer_is_not_reported_as_verified(self):
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        class WrongClient:
            def diagnose(self): return {'configured': True}
            def complete(self, *args, **kwargs): return {'ok': True, 'dominant_color': 'not-a-color'}
        self.studio.text_model_client = lambda: WrongClient()
        with self.assertRaises(self.module.ImageStudioError):
            self.studio.probe_text_model(self.admin)
        self.assertFalse(self.studio.status()['text_model']['vision_verified'])

    def test_form_status_uses_the_shared_factory_for_generation_pipeline(self):
        from app.server import WorkbenchServer
        self.studio.save_text_model(self.admin, {'model': 'qwen3-vl-plus'})
        with WorkbenchServer(0, image_studio=self.studio) as server:
            self.assertTrue(server.service.status()['model_configured'])
            self.assertEqual(server.service.pipeline.model_factory().model, 'qwen3-vl-plus')
            self.assertEqual(server.service.official_pipeline.model_factory().model, 'qwen3-vl-plus')


if __name__ == '__main__': unittest.main()
