"""Read user-authorized ZIP materials in place; never extract or execute their content."""
from datetime import datetime, timezone
import hashlib
import csv
import io
from pathlib import Path, PurePosixPath
import re
from zipfile import ZipFile, BadZipFile

from .client import ImaError
from .retrieval import ImaKnowledge, MAX_RESOURCE_BYTES, MAX_TEXT_CHARACTERS, image_mime


class LocalKnowledge(ImaKnowledge):
    mode = "local_archive"

    def __init__(self, archive):
        super().__init__()
        self.archive = Path(archive).resolve()
        self.files = {}
        try:
            with ZipFile(self.archive) as package:
                entries = package.infolist()
                if len(entries) > 15000 or sum(e.file_size for e in entries) > 512 * 1024 * 1024:
                    raise ImaError("local", "本地知识库超过支持的大小限制。")
                for entry in entries:
                    path = PurePosixPath(entry.filename.replace("\\", "/"))
                    if path.is_absolute() or ".." in path.parts or entry.flag_bits & 1:
                        raise ImaError("local", "本地压缩包包含不支持的路径或加密文件。")
                    if not entry.is_dir():
                        self.files[str(path)] = entry.filename
        except (OSError, BadZipFile):
            raise ImaError("local", "无法打开本地知识库ZIP，请检查配置路径。") from None
        roots = {p.split("/")[0] for p in self.files}
        self.root = next(iter(roots)) + "/" if len(roots) == 1 and all("/" in p for p in self.files) else ""
        self.folders = {self.root}
        for filename in self.files:
            pieces = filename.split("/")
            self.folders.update("/".join(pieces[:i]) + "/" for i in range(1, len(pieces)))
        self.identity = hashlib.sha256(str(self.archive).encode()).hexdigest()
        self.image_provenance = {}
        # A filename alone is not model evidence: require an explicit model in a CSV row.
        with ZipFile(self.archive) as package:
            self.archive_sha256 = hashlib.file_digest(self.archive.open('rb'), 'sha256').hexdigest()
            for path in self.files:
                if not path.endswith('.csv') or package.getinfo(self.files[path]).file_size > MAX_RESOURCE_BYTES:
                    continue
                try:
                    rows = csv.DictReader(io.StringIO(package.read(self.files[path]).decode('utf-8-sig')))
                    for number, row in enumerate(rows, 2):
                        filename, product = row.get('文件名'), row.get('产品型号')
                        if filename and product and row.get('原始图片URL') and row.get('来源页面'):
                            self.image_provenance.setdefault(filename, []).append({'manifest': path, 'row': number, 'product': product, 'page_url': row['来源页面'], 'original_url': row['原始图片URL'], 'description': row.get('官方图片说明', ''), 'usage': row.get('建议用途', ''), 'archive_sha256': self.archive_sha256})
                except (UnicodeError, csv.Error):
                    continue

    def describe(self):
        return {"mode": self.mode, "label": "本地知识库压缩包", "archive_name": self.archive.name, "file_count": len(self.files), "note": "由用户提供的本地知识库资料；本次未从 ima 实时读取。"}

    def _entry(self, path):
        return {"media_id": path, "title": path.rstrip("/").rsplit("/", 1)[-1], "media_type": 99 if path in self.folders else 9 if Path(path).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif") else 7}

    def _result(self, paths, name, mode, prefix="", query=""):
        base = {"kb_id": self.identity, "kb_name": name}
        items = [self.register(self._entry(path), base) for path in paths[:200]]
        breadcrumbs = [{"title": "本地资料", "ref": None}]
        if prefix.startswith(self.root):
            relative = prefix[len(self.root):].strip("/")
            pieces = relative.split("/") if relative else []
            for index, piece in enumerate(pieces):
                path = self.root + "/".join(pieces[:index+1]) + "/"
                breadcrumbs.append({"title": piece, "ref": self.register(self._entry(path), base)["ref"]})
        return {"mode": mode, "data_source": self.describe(), "knowledge_base": name, "items": items, "count": len(items), "breadcrumbs": breadcrumbs, "next_page_ref": None, "truncated": len(paths)>200, "query": query, "note": "本地知识库资料，可预览、选择并生成。不是 ima 实时检索。" + (" 本次仅显示前200条，请缩小关键词。" if len(paths)>200 else "")}

    def browse(self, name, folder_ref=None, page_ref=None):
        if page_ref: raise ImaError("selection", "本地资料请按目录或关键词缩小范围。")
        prefix = self.root
        if folder_ref:
            record = self.get(folder_ref, name)
            prefix = record["media_id"]
            if prefix not in self.folders: raise ImaError("selection", "该条目不是本地目录。")
        paths = []
        for path in self.folders | set(self.files):
            if path != prefix and path.startswith(prefix) and "/" not in path[len(prefix):].rstrip("/"):
                paths.append(path)
        paths.sort(key=lambda p: (p not in self.folders, p.casefold()))
        return self._result(paths, name, "directory", prefix)

    def search(self, query, name, page_ref=None):
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 200:
            raise ImaError("selection", "请输入有效的本地检索关键词。")
        normalize = lambda s: re.sub(r"[\s_\-（）()]", "", s.casefold())
        key = normalize(query)
        paths = [p for p in set(self.files) | self.folders if key in normalize(p)]
        paths.sort(key=lambda p: (not p.endswith("产品事实.md"), p not in self.folders, p.casefold()))
        return self._result(paths, name, "search", query=query)

    def read(self, reference, name):
        record = self.get(reference, name)
        path = record["media_id"]
        if path not in self.files: raise ImaError("selection", "请进入目录并选择具体资料。")
        try:
            with ZipFile(self.archive) as package:
                info = package.getinfo(self.files[path])
                if info.file_size > MAX_RESOURCE_BYTES: raise ImaError("local", "所选资料超过8MB，请选择较小文件。")
                with package.open(info) as stream: data = stream.read(MAX_RESOURCE_BYTES + 1)
        except (OSError, BadZipFile, KeyError):
            raise ImaError("local", "本地资料读取失败，请检查压缩包是否仍然可用。") from None
        relative = path[len(self.root):] if path.startswith(self.root) else path
        source = {"knowledge_base": name, "title": record["title"], "path": ["本地资料包：" + self.archive.name, *relative.split("/")[:-1]], "retrieved_at": datetime.now(timezone.utc).isoformat(), "mode": self.mode}
        if record["media_type"] == 9:
            mime = image_mime(data)
            if not mime: raise ImaError("local", "本地图片文件内容无效。")
            with self.lock:
                old = self.assets.pop(reference, None)
                if old: self.asset_bytes -= len(old[0])
                self.assets[reference] = (data, mime)
                self.asset_bytes += len(data)
                while self.asset_bytes > 32 * 1024 * 1024:
                    _, dropped = self.assets.popitem(last=False); self.asset_bytes -= len(dropped[0])
            candidates = self.image_provenance.get(Path(path).name, [])
            # Do not resolve ambiguous ownership by guessing from a directory name.
            provenance = [{**p, 'image_sha256': hashlib.sha256(data).hexdigest()} for p in candidates]
            return {"ref":reference,"kind":"image","source":source,"asset_url":"/api/asset/"+reference,"size_bytes":len(data),"mime_type":mime,"provenance":provenance,"note":"本地知识库原图；归属清单来自用户ZIP，非本次在线官网核验，仍需检查画面与图注。"}
        if Path(path).suffix.lower() not in (".md", ".txt", ".csv", ".json", ".markdown"):
            raise ImaError("unsupported", "该本地文件格式暂不支持预览。")
        try: text=data.decode("utf-8-sig")
        except UnicodeError: raise ImaError("local", "本地文本不是支持的UTF-8编码。") from None
        return {"ref":reference,"kind":"document","source":source,"text":text[:MAX_TEXT_CHARACTERS],"truncated":len(text)>MAX_TEXT_CHARACTERS,"size_bytes":len(data)}

    def asset(self, reference):
        record = self.get(reference)
        with self.lock: present = reference in self.assets
        if not present: self.read(reference, record["knowledge_base"])
        return super().asset(reference)

    def retrieve(self, references, name, request_id):
        result = super().retrieve(references, name, request_id)
        result["data_source"] = self.describe()
        result["note"] = "本地知识库原文与图片，来源为用户提供的ZIP；未调用 ima 实时读取。"
        return result
