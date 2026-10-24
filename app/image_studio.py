"""Shared QwenImage service. Secrets stay in private server state, never in responses."""

from copy import deepcopy
import base64
import hashlib
import hmac
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import secrets
import socket
import struct
import threading
import time
import urllib.error
import urllib.request
import zlib
from urllib.parse import urlsplit
from agent.model import ModelClient, ModelError


MODELS = ('qwen-image-3.0-pro', 'qwen-image-3.0', 'qwen-image-2.1-pro', 'qwen-image-2.1-turbo')
TEXT_MODELS = ('qwen3-vl-plus', 'qwen3-vl-flash', 'qwen-vl-max', 'qwen-vl-plus')
SIZES = ('1024x1024', '1536x2048', '2048x1536')
DEFAULT_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
COOKIE = 'pc_image_session'
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


class ImageStudioError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class NoImageRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ImageStudioError('生图服务发生重定向，请核对百炼接口地址。')


def validate_base(value):
    if not isinstance(value, str):
        raise ImageStudioError('请填写百炼 HTTPS 接口地址。')
    value = value.strip().rstrip('/')
    try:
        parsed = urlsplit(value)
    except ValueError:
        raise ImageStudioError('百炼接口地址格式不正确，请重新填写。') from None
    host = parsed.hostname or ''
    allowed = host in {'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com'} or re.fullmatch(r'[a-zA-Z0-9-]+\.(cn-beijing|ap-southeast-1|us-east-1|eu-central-1|ap-northeast-1)\.maas\.aliyuncs\.com', host)
    if not allowed or parsed.scheme != 'https' or parsed.netloc != host or parsed.path != '/compatible-mode/v1' or parsed.query or parsed.fragment:
        raise ImageStudioError('请使用百炼官方的 HTTPS Images 接口 Base URL，结尾为 /compatible-mode/v1。')
    return value


def validate_png(data):
    if not isinstance(data, bytes) or not 33 <= len(data) <= 12 * 1024 * 1024 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b'IHDR':
        raise ImageStudioError('生图服务未返回有效 PNG 图片，请重试。')
    width, height = struct.unpack('>II', data[16:24])
    if not 0 < width <= 8192 or not 0 < height <= 8192:
        raise ImageStudioError('生图结果尺寸不受支持。')
    return data


class QwenImageClient:
    def __init__(self, settings, opener=None, timeout=180):
        self.settings = settings
        self.opener = opener or urllib.request.build_opener(NoImageRedirect())
        self.timeout = timeout

    def generate(self, prompt, size):
        base = validate_base(self.settings['base_url'])
        parsed_base = urlsplit(base)
        # Shared DashScope domains expose the native multimodal route; their
        # /compatible-mode/v1/images/generations route returns 404 in live checks.
        native = parsed_base.hostname in {'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com'}
        if native:
            endpoint = parsed_base.scheme + '://' + parsed_base.netloc + '/api/v1/services/aigc/multimodal-generation/generation'
            payload = {'model': self.settings['model'], 'input': {'messages': [{'role': 'user', 'content': [{'text': prompt}]}]}, 'parameters': {'size': size.replace('x', '*'), 'n': 1, 'prompt_extend': False}}
        else:
            endpoint = base + '/images/generations'
            payload = {'model': self.settings['model'], 'prompt': prompt, 'size': size, 'n': 1, 'prompt_extend': False}
        request = urllib.request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode('utf-8'), headers={'Authorization': 'Bearer ' + self.settings['api_key'], 'Content-Type': 'application/json'})
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ImageStudioError('生图响应过大，未采用该结果。')
            result = json.loads(raw)
            if native:
                content = result['output']['choices'][0]['message']['content']
                image_url = [item['image'] for item in content if isinstance(item, dict) and isinstance(item.get('image'), str)][0]
            else:
                image_url = result['data'][0]['url']
            parsed = urlsplit(image_url)
            if parsed.scheme != 'https' or not re.fullmatch(r'(?:dashscope-result[a-z0-9-]*\.oss[a-z0-9-]*|dashscope-[a-z0-9-]+\.oss-accelerate)\.aliyuncs\.com', parsed.hostname or '') or parsed.username or parsed.password or parsed.port not in (None, 443):
                raise ImageStudioError('生图服务返回了不受支持的图片地址，未下载该图片。')
            # This separate request deliberately carries no API credentials.
            with self.opener.open(urllib.request.Request(image_url), timeout=60) as response:
                data = response.read(12 * 1024 * 1024 + 1)
            return validate_png(data)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            message = {400: '模型或尺寸不支持，请核对控制台中的模型权限与地域', 401: 'Key 未通过认证，请管理员重新配置', 403: '该 Key 没有模型访问权限', 404: '模型或接口地址不存在', 429: '额度不足或请求过于频繁，请稍后再试'}.get(status, '生图服务暂时不可用，请稍后再试')
            raise ImageStudioError(f'{message}（HTTP {status}）。', 502) from None
        except (urllib.error.URLError, TimeoutError, socket.timeout):
            raise ImageStudioError('生图连接超时或中断。任务可能仍在服务端执行，请先检查百炼记录，避免重复扣费。', 504) from None
        except (KeyError, IndexError, TypeError, ValueError):
            raise ImageStudioError('生图服务没有返回有效图片，请核对模型与接口配置。', 502) from None


class ImageStudio:
    def __init__(self, state_dir=None, env=None, client_factory=QwenImageClient):
        self.env = dict(os.environ if env is None else env)
        self.state_dir = Path(state_dir or self.env.get('WORKBENCH_STATE_DIR') or Path(__file__).resolve().parents[1] / 'private')
        self.path = self.state_dir / 'image-studio.json'
        self.client_factory = client_factory
        self.lock = threading.RLock()
        self.generation_lock = threading.Lock()
        self.sessions, self.assets = {}, {}
        self.failures, self.retry_at = 0, 0
        self.load_error = False
        self.state = None
        if self.path.exists():
            try:
                state = json.loads(self.path.read_text(encoding='utf-8'))
                if state.get('version') != 1 or not all(isinstance(state.get(k), dict) for k in ['admin', 'member', 'settings']):
                    raise ValueError()
                for role in ('admin', 'member'):
                    if not re.fullmatch(r'[0-9a-f]{32}', state[role].get('salt', '')) or not re.fullmatch(r'[0-9a-f]{64}', state[role].get('hash', '')):
                        raise ValueError()
                self.state = state
            except (OSError, ValueError, TypeError, AttributeError):
                self.load_error = True

    def _healthy(self):
        if self.load_error:
            raise ImageStudioError('服务器配置无法读取，请管理员检查持久化目录；未覆盖原有配置。', 503)

    def _write(self, state):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        if os.name != 'nt':
            self.state_dir.chmod(0o700)
        temporary = self.state_dir / ('.settings-' + secrets.token_hex(8))
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                json.dump(state, output, ensure_ascii=False)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        except OSError:
            raise ImageStudioError('配置未保存，请检查服务器持久化目录的写入权限。', 503) from None
        finally:
            temporary.unlink(missing_ok=True)
        self.state = state

    @staticmethod
    def _password(value, minimum):
        if not isinstance(value, str) or not minimum <= len(value) <= 200:
            raise ImageStudioError(f'请填写 {minimum}–200 位密码或访问码。')
        salt = secrets.token_hex(16)
        return {'salt': salt, 'hash': hashlib.pbkdf2_hmac('sha256', value.encode('utf-8'), bytes.fromhex(salt), 310000).hex()}

    def _session(self, role):
        now = time.time()
        self.sessions = {k: v for k, v in self.sessions.items() if v[1] > now}
        if len(self.sessions) >= 256:
            self.sessions.pop(next(iter(self.sessions)))
        token = secrets.token_urlsafe(32)
        self.sessions[token] = (role, now + 12 * 3600)
        return token

    def role(self, token):
        with self.lock:
            role, expires = self.sessions.get(token, ('guest', 0))
            return role if expires > time.time() else 'guest'

    def require(self, token, admin=False):
        self._healthy()
        role = self.role(token)
        if role == 'guest':
            raise ImageStudioError('请先使用团队访问码或管理员密码登录。', 401)
        if admin and role != 'admin':
            raise ImageStudioError('只有管理员可以修改生图配置。', 403)

    def setup(self, admin_password, team_password, allow_local=False, setup_token=''):
        with self.lock:
            self._healthy()
            if self.state or self.path.exists():
                raise ImageStudioError('管理员已创建，请直接登录。', 409)
            expected = self.env.get('WORKBENCH_SETUP_TOKEN', '')
            if not allow_local and (not expected or not isinstance(setup_token, str) or not hmac.compare_digest(expected, setup_token)):
                raise ImageStudioError('请提供部署平台设置的初始化码，或在服务器本机完成首次设置。', 403)
            if admin_password == team_password:
                raise ImageStudioError('管理员密码和团队访问码需要分别设置。')
            state = {'version': 1, 'admin': self._password(admin_password, 10), 'member': self._password(team_password, 8), 'settings': {'api_key': '', 'base_url': DEFAULT_BASE, 'model': MODELS[0]}}
            self._write(state)
            return self._session('admin')

    def login(self, role, password):
        with self.lock:
            self._healthy()
            if time.time() < self.retry_at:
                raise ImageStudioError('登录尝试过于频繁，请 30 秒后重试。', 429)
            if not self.state or role not in ('admin', 'member') or not isinstance(password, str) or len(password) > 200:
                raise ImageStudioError('登录身份或密码不正确。', 401)
            item = self.state[role]
            digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(item['salt']), 310000).hex()
            if not hmac.compare_digest(digest, item['hash']):
                self.failures += 1
                if self.failures >= 10:
                    self.retry_at, self.failures = time.time() + 30, 0
                raise ImageStudioError('登录身份或密码不正确。', 401)
            self.failures = 0
            return self._session(role)

    def logout(self, token):
        with self.lock:
            self.sessions.pop(token, None)

    def status(self, token='', allow_local_setup=False):
        with self.lock:
            self._healthy()
            settings = self.state['settings'] if self.state else {}
            return {'initialized': bool(self.state), 'role': self.role(token), 'configured': bool(settings.get('api_key')), 'key_configured': bool(settings.get('api_key')), 'model': settings.get('model', MODELS[0]), 'base_url': settings.get('base_url', DEFAULT_BASE), 'models': list(MODELS), 'sizes': list(SIZES), 'setup_available': allow_local_setup or bool(self.env.get('WORKBENCH_SETUP_TOKEN')), 'setup_token_required': not allow_local_setup, 'text_model': self.text_model_status(), 'note': 'AI 场景示意单独展示，不作为产品事实或真实产品配图。'}

    def text_model_client(self):
        """Resolve the shared key per request; no duplicate key is stored for text generation."""
        with self.lock:
            self._healthy()
            configured = (self.state or {}).get('text_model')
            if not configured:
                return ModelClient(env=self.env)
            settings = self.state['settings']
            return ModelClient(env={'LLM_API_KEY': settings.get('api_key', ''), 'LLM_BASE_URL': settings.get('base_url', ''), 'LLM_MODEL': configured.get('model', ''), 'LLM_JSON_MODE': 'true', 'LLM_ENABLE_THINKING': 'false'})

    def text_model_status(self):
        with self.lock:
            configured = (self.state or {}).get('text_model') or {}
            ready = self.text_model_client().diagnose()['configured']
            return {'configured': ready, 'model': configured.get('model') or self.env.get('LLM_MODEL', ''), 'key_source': 'shared_bailian' if configured else 'server_environment', 'vision_verified': bool(ready and configured.get('vision_verified')), 'models': list(TEXT_MODELS)}

    def save_text_model(self, token, body):
        with self.lock:
            self.require(token, admin=True)
            if not self.state['settings'].get('api_key'):
                raise ImageStudioError('请先保存团队百炼 Key，再配置文案与核验模型。')
            model = body.get('model')
            if model not in TEXT_MODELS:
                raise ImageStudioError('请选择支持看图的 Qwen-VL 模型，并确认账号已开通该型号。')
            validate_base(self.state['settings']['base_url'])
            state = deepcopy(self.state)
            state['text_model'] = {'model': model, 'key_source': 'shared_bailian', 'vision_verified': False}
            self._write(state)
            return {'status': 'saved', 'note': '文案与图片核验模型已保存，复用团队百炼 Key，立即生效。'}

    def probe_text_model(self, token):
        with self.lock:
            self.require(token, admin=True)
            descriptor = self.state.get('text_model')
            if not descriptor or not self.text_model_client().diagnose()['configured']:
                raise ImageStudioError('请先保存文案与图片核验模型。')
            expected = (descriptor['model'], self.state['settings'].get('api_key'), self.state['settings'].get('base_url'))
            state = deepcopy(self.state)
            state['text_model']['vision_verified'] = False
            self._write(state)
        color, rgb = secrets.choice([('red', (255,0,0)), ('green', (0,255,0)), ('blue', (0,0,255))])
        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
        pixels = b''.join(b'\0' + bytes(rgb) * 64 for _ in range(64))
        png = PNG_SIGNATURE + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
        try:
            result = self.text_model_client().complete('观察附图的主色。仅返回 JSON 对象，包含 ok:true 和 dominant_color 字段，颜色值只能是 red、green 或 blue。', {'operation': 'vision_connection_test'}, images=[{'label': '测试色块，不含产品资料', 'url': 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')}])
        except ModelError as error:
            raise ImageStudioError(str(error), 502) from None
        if result.get('ok') is not True or str(result.get('dominant_color', '')).strip().lower() != color:
            raise ImageStudioError('模型已响应，但图片识别或 JSON 验证未通过，请核对模型是否支持看图。', 502)
        with self.lock:
            current = (self.state.get('text_model', {}).get('model'), self.state['settings'].get('api_key'), self.state['settings'].get('base_url'))
            if current != expected:
                raise ImageStudioError('验证期间配置发生变化，请用新配置重新验证。', 409)
            state = deepcopy(self.state)
            state['text_model']['vision_verified'] = True
            self._write(state)
        return {'status': 'connected', 'model': expected[0], 'image_input_tested': True, 'note': '模型真实调用、图片识别与 JSON 响应验证通过。'}

    def save(self, token, body):
        with self.lock:
            self.require(token, admin=True)
            base = validate_base(body.get('base_url'))
            model = body.get('model')
            if model not in MODELS:
                raise ImageStudioError('请选择当前支持的 QwenImage 模型；仍需在百炼确认账号权限。')
            key = body.get('api_key', '')
            if not isinstance(key, str) or (key and (not 16 <= len(key) <= 4096 or any(c.isspace() or ord(c) < 33 or ord(c) > 126 for c in key))):
                raise ImageStudioError('API Key 格式不正确，请重新粘贴完整 Key。')
            state = deepcopy(self.state)
            key = key or state['settings'].get('api_key', '')
            if not key:
                raise ImageStudioError('请先填写 API Key。')
            state['settings'] = {'api_key': key, 'base_url': base, 'model': model}
            if state.get('text_model') and state['settings'] != self.state['settings']:
                state['text_model']['vision_verified'] = False
            self._write(state)
            return {'status': 'saved', 'note': '配置已保存，团队共用。保存不调用模型；实际效果以生图结果为准。'}

    def clear(self, token):
        with self.lock:
            self.require(token, admin=True)
            state = deepcopy(self.state)
            state['settings']['api_key'] = ''
            if state.get('text_model'):
                state['text_model']['vision_verified'] = False
            self._write(state)
            return {'status': 'cleared', 'note': '已清除服务器保存的 Key，新的生图请求已停用。'}

    def generate(self, token, body):
        self.require(token)
        prompt, size = body.get('prompt'), body.get('size')
        if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 6000 or size not in SIZES:
            raise ImageStudioError('请填写 1–6000 字的场景描述，并选择支持的图片尺寸。')
        with self.lock:
            settings = deepcopy(self.state['settings'])
        if not settings.get('api_key'):
            raise ImageStudioError('管理员尚未配置生图 Key，请先在连接设置中保存。')
        if not self.generation_lock.acquire(blocking=False):
            raise ImageStudioError('已有一张图片正在生成，请等本次完成后再提交。', 409)
        try:
            data = validate_png(self.client_factory(settings).generate(prompt.strip(), size))
            ref, now = secrets.token_urlsafe(24), time.time()
            with self.lock:
                self.assets = {k: v for k, v in self.assets.items() if v[1] > now}
                while len(self.assets) >= 12:
                    self.assets.pop(next(iter(self.assets)))
                self.assets[ref] = (data, now + 3600)
            return {'status': 'generated', 'asset_url': '/api/images/asset/' + ref, 'kind': 'ai_scene', 'notice': 'AI 场景示意 · 非真实产品图片，请检查后下载。', 'model': settings['model'], 'note': '预览保留约 1 小时，服务器重启后清除；请及时下载。'}
        finally:
            self.generation_lock.release()

    def asset(self, token, ref):
        self.require(token)
        with self.lock:
            data, expires = self.assets.get(ref, (None, 0))
            if not data or time.time() >= expires:
                raise ImageStudioError('图片预览已过期，请使用之前下载的图片。', 404)
            return data


def handle_image_request(handler, body=None):
    path = urlsplit(handler.path).path
    shared_text_request = (handler.command == 'POST' and path in {'/api/generate', '/api/revise', '/api/model/probe', '/api/progress'}) or (handler.command == 'GET' and path.startswith('/api/progress/'))
    if not path.startswith('/api/images/') and not shared_text_request:
        return False
    studio = handler.server.image_studio
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get('Cookie', ''))
        token = cookie[COOKIE].value if COOKIE in cookie else ''
    except Exception:
        token = ''
    allow_local = handler.headers.get('X-Workbench-Proxy') != '1' and not studio.env.get('WORKBENCH_PUBLIC_ORIGIN')
    try:
        if shared_text_request:
            if studio.text_model_status()['key_source'] == 'shared_bailian':
                studio.require(token)
            return False
        if handler.command == 'GET' and path == '/api/images/status':
            handler.send_payload(200, studio.status(token, allow_local_setup=allow_local))
        elif handler.command == 'GET' and path.startswith('/api/images/asset/'):
            handler.send_payload(200, studio.asset(token, path.rsplit('/', 1)[-1]), 'image/png')
        elif handler.command == 'POST' and body is not None:
            headers = None
            if path in ('/api/images/setup', '/api/images/login'):
                if path.endswith('setup'):
                    token = studio.setup(body.get('admin_password'), body.get('team_password'), allow_local, body.get('setup_token', ''))
                else:
                    token = studio.login(body.get('role'), body.get('password'))
                secure = '; Secure' if studio.env.get('WORKBENCH_PUBLIC_ORIGIN', '').startswith('https://') else ''
                headers = {'Set-Cookie': f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200{secure}'}
                result = {'status': 'authenticated', 'role': studio.role(token)}
            elif path == '/api/images/logout':
                studio.logout(token)
                headers = {'Set-Cookie': f'{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'}
                result = {'status': 'logged_out'}
            elif path == '/api/images/settings':
                result = studio.save(token, body)
            elif path == '/api/images/clear':
                result = studio.clear(token)
            elif path == '/api/images/text-model/settings':
                result = studio.save_text_model(token, body)
            elif path == '/api/images/text-model/probe':
                result = studio.probe_text_model(token)
            elif path == '/api/images/generate':
                result = studio.generate(token, body)
            else:
                raise ImageStudioError('生图入口不存在。', 404)
            handler.send_payload(200, result, extra_headers=headers)
        else:
            raise ImageStudioError('生图入口不存在。', 404)
    except ImageStudioError as error:
        handler.send_payload(error.status, {'error': str(error), 'kind': 'image_studio'})
    return True
