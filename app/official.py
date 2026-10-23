"""Read product pages from the Huawei consumer site; never accept client URLs."""
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from html.parser import HTMLParser
import re
import secrets
import threading
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

from ima.client import ImaError
from ima.retrieval import image_mime

ORIGIN = 'https://consumer.huawei.com'
PRODUCTS = [
    ('HUAWEI MateBook 14（鸿蒙版）', 'harmonyos-computer/matebook-14-harmonyos-version'),
    ('HUAWEI MateBook Pro（鸿蒙版）', 'harmonyos-computer/matebook-pro'),
    ('HUAWEI MateBook Pro S', 'harmonyos-computer/matebook-pro-s'),
    ('HUAWEI MateBook Fold 非凡大师', 'harmonyos-computer/matebook-fold-ultimate-design'),
    ('HUAWEI MateBook 14 酷睿 Ultra', 'laptops/matebook-14-2024'),
    ('HUAWEI MateBook D 14 2024', 'laptops/matebook-d-14-2024-13th-gen-core'),
    ('HUAWEI MateBook D 16 2024', 'laptops/matebook-d-16-2024'),
    ('HUAWEI MateBook D 16 SE 版 2024', 'laptops/matebook-d-16-se-2024'),
    ('HUAWEI MateBook GT 14', 'laptops/matebook-gt-14'),
    ('HUAWEI MateBook X Pro 酷睿 Ultra 微绒典藏版', 'laptops/matebook-x-pro-ultra-premium-edition'),
]

def normalized(value):
    return re.sub(r'[\s（）()\-_/]', '', value.casefold()).replace('huawei', '').replace('华为', '')

def match_product(value):
    key = normalized(value)
    for name, path in PRODUCTS:
        if key == normalized(name):
            return name, path
    # Do not silently choose between Windows and HarmonyOS or different model years.
    aliases = {'matebook14鸿蒙版': 0, 'matebookpro鸿蒙版': 1, 'matebook14windows2024': 4}
    if key in aliases:
        return PRODUCTS[aliases[key]]
    raise ImaError('product', '请从官网型号列表选择完整型号，需区分鸿蒙版、Windows 版与年份。')

def allowed(url):
    try:
        parsed = urlsplit(url)
        return parsed.scheme == 'https' and parsed.hostname == 'consumer.huawei.com' and parsed.port in (None, 443) and not parsed.username and not parsed.password
    except ValueError:
        return False

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl):
            raise ImaError('official', '官网跳转到不支持的域名，已停止读取。')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def fetch(url, limit=5*1024*1024):
    if not allowed(url):
        raise ImaError('official', '只允许读取华为消费者官网。')
    try:
        with build_opener(SafeRedirect()).open(Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'}), timeout=18) as response:
            if not allowed(response.url):
                raise ImaError('official', '官网来源校验失败。')
            data = response.read(limit+1)
            if len(data) > limit:
                raise ImaError('official', '官网资源过大，请换一张图片。')
            return data
    except ImaError:
        raise
    except Exception:
        raise ImaError('official', '华为官网暂时无法读取，请检查网络后重试。') from None

class ProductPage(HTMLParser):
    def __init__(self, page_url, asset_key):
        super().__init__(convert_charrefs=True)
        self.page_url, self.asset_key = page_url, asset_key
        self.stack, self.text, self.images = [], [], []
        self.description, self.title = '', ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta' and a.get('name', '').lower() == 'description':
            self.description = a.get('content', '')
        if tag == 'meta' and a.get('property', '').lower() == 'og:image':
            self.add_image(a.get('content', ''), '官网产品外观')
        if tag == 'img':
            self.add_image(a.get('data-src') or a.get('src', ''), a.get('alt', '') or '官网产品展示')
        if tag in {'br', 'p', 'div', 'h1', 'h2', 'h3', 'li', 'section'}:
            self.text.append('\n')
        if tag not in {'img', 'meta', 'link', 'input', 'br', 'hr', 'source', 'wbr', 'area', 'embed'}:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            self.stack = self.stack[:len(self.stack)-1-self.stack[::-1].index(tag)]
        if tag in {'p', 'div', 'h1', 'h2', 'h3', 'li', 'section'}:
            self.text.append('\n')

    def handle_data(self, value):
        if 'title' in self.stack:
            self.title += value
        if not any(t in self.stack for t in ('script', 'style', 'svg', 'noscript', 'header', 'footer', 'nav', 'title')):
            self.text.append(value)

    def add_image(self, value, title):
        url = urljoin(self.page_url, value)
        path = urlsplit(url).path.lower()
        if allowed(url) and self.asset_key in path and path.endswith(('.png', '.jpg', '.jpeg', '.webp')) and not any(s in path for s in ('thumb', 'wxshare', 'logo', '/video/', '-xs.', '-2x.', '-harmonyos.png')):
            if url not in [i['url'] for i in self.images]:
                self.images.append({'url': url, 'title': title[:160]})

    def original(self):
        # Keep source wording and footnote numbers; only normalize HTML whitespace.
        lines = [re.sub(r'\s+', ' ', line).strip() for line in ''.join(self.text).splitlines()]
        body = '\n\n'.join(line for line in lines if line)
        return self.description + '\n\n' + body

class OfficialKnowledge:
    def __init__(self, fetcher=fetch):
        self.fetcher, self.lock = fetcher, threading.RLock()
        self.products, self.assets = OrderedDict(), OrderedDict()

    def describe(self):
        return {'mode': 'official', 'label': '华为官网实时资料', 'note': '官网原文与图片；不属于 ima 实时读取。'}

    def prepare(self, product):
        name, path = match_product(product)
        url = ORIGIN + '/cn/' + path + '/'
        data = self.fetcher(url)
        page = ProductPage(url, path.rsplit('/', 1)[-1])
        page.feed(data.decode('utf-8-sig'))
        core = re.search(r'matebook(?:\s+(?:fold|x|gt|d|pro|s|\d+))+', name, re.I).group()
        if '404' in page.title or not page.description or normalized(core) not in normalized(page.title):
            raise ImaError('official', '官网页面未返回有效产品介绍，请稍后重试或选择其他型号。')
        text = page.original()
        if len(text) > 60000:
            raise ImaError('official', '官网原文过长，需先调整该型号读取规则，未截断事实条件。')
        stamp = datetime.now(timezone.utc).isoformat()
        source = {'title': name + ' · 官网产品介绍', 'path': ['华为消费者官网'], 'url': url, 'retrieved_at': stamp}
        # Distinct official images only; actual bytes are checked and cached now.
        selected = sorted(page.images, key=lambda item: 0 if re.search(r'/kv/[^/]+-kv\.(?:jpg|png|webp)$', item['url']) else 1)[:8]
        def load(item):
            try:
                raw = self.fetcher(item['url'])
                mime = image_mime(raw)
                return (item, raw, mime) if mime else None
            except ImaError:
                return None
        with ThreadPoolExecutor(max_workers=4) as pool:
            loaded = [i for i in pool.map(load, selected) if i]
        import hashlib
        unique = {}
        for item, raw, mime in loaded:
            unique.setdefault(hashlib.sha256(raw).hexdigest(), (item, raw, mime))
        if not unique:
            raise ImaError('official', '已读到官网介绍，但未获得可用的对应产品图片，请重试。')
        token = secrets.token_urlsafe(24)
        images, bundle_images = [], []
        with self.lock:
            self._prune()
            for index, (item, raw, mime) in enumerate(list(unique.values())[:6], 1):
                ref = secrets.token_urlsafe(24)
                self.assets[ref] = (time.monotonic(), raw, mime)
                asset_url = '/api/official/asset/' + ref
                image_source = {**source, 'title': name + ' · ' + item['title'], 'url': item['url']}
                bundle_images.append({'kind': 'image', 'source': image_source, 'asset_url': asset_url})
                images.append({'src': asset_url, 'name': image_source['title'], 'original_url': item['url']})
            bundle = {'documents': [{'kind': 'document', 'source': source, 'text': text}], 'images': bundle_images, 'warnings': []}
            self.products[token] = (time.monotonic(), name, bundle)
            while len(self.products) > 8:
                self.products.popitem(last=False)
        return {'product_ref': token, 'product': name, 'url': url, 'intro': page.description, 'original_text': text, 'retrieved_at': stamp, 'images': images, 'source': self.describe()}

    def _prune(self):
        now = time.monotonic()
        for cache in (self.products, self.assets):
            for key, record in list(cache.items()):
                if now-record[0] > 3600:
                    del cache[key]
        while len(self.assets) > 48:
            self.assets.popitem(last=False)

    def retrieve(self, references, name, request_id):
        token = references[0] if isinstance(references, list) and len(references) == 1 else None
        with self.lock:
            self._prune()
            record = self.products.get(token) if isinstance(token, str) else None
            if not record:
                raise ImaError('official', '官网资料已过期，请重新读取该型号。')
            if match_product(name)[0] != record[1]:
                raise ImaError('product', '官网资料与当前型号不一致，请重新读取。')
            return deepcopy(record[2])

    def asset(self, ref):
        with self.lock:
            self._prune()
            record = self.assets.get(ref)
            if not record:
                raise ImaError('official', '官网图片已过期，请重新读取该型号。')
            return record[1], record[2]
