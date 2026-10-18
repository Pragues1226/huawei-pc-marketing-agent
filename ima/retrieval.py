"""Live knowledge reading with server-local references and bounded in-memory storage."""

from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timezone
import re
import secrets
import threading
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .client import ImaClient, ImaError, normalize_base

MAX_RESOURCE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARACTERS = 120000
TEXT_EXTENSIONS = (".md", ".txt", ".csv", ".json", ".markdown", ".log")


def find_knowledge_base(client, name):
    cursor, seen, matches = "", set(), {}
    for _ in range(5):
        data = client.search_bases(name, cursor)
        entries = data.get("info_list")
        if not isinstance(entries, list):
            raise ImaError("response", "知识库搜索缺少有效列表")
        for entry in entries:
            base = normalize_base(entry)
            if base["kb_name"] == name:
                matches[base["kb_id"]] = base
        if data.get("is_end") is True:
            break
        following = data.get("next_cursor")
        if not isinstance(following, str) or not following or following == cursor or following in seen:
            break
        seen.add(cursor)
        cursor = following
    if len(matches) != 1:
        raise ImaError("selection", "当前账号未唯一找到该共享知识库。请用申请凭证的同一账号扫码加入，并确认名称。")
    return next(iter(matches.values()))


def official_resource_url(url):
    if not isinstance(url, str):
        return False
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        return parts.scheme == "https" and not parts.username and not parts.password and parts.port in (None, 443) and (host == "ima.qq.com" or host.endswith(".myqcloud.com"))
    except ValueError:
        return False


class ResourceRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Signed resource headers cannot be forwarded to another host.
        if not official_resource_url(newurl) or urlsplit(newurl).hostname != urlsplit(request.full_url).hostname:
            raise ImaError("resource", "资料链接发生跨站跳转，请使用 ima 客户端查看原文")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch_resource(url_info):
    if not isinstance(url_info, dict) or not official_resource_url(url_info.get("url")):
        raise ImaError("resource", "未返回可验证的官方资料链接，请使用 ima 客户端查看原文")
    headers = url_info.get("headers") or {}
    if not isinstance(headers, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in headers.items()):
        raise ImaError("resource", "资料访问头格式不正确，请使用 ima 客户端查看原文")
    forbidden = {"ima-openapi-clientid", "ima-openapi-apikey", "host", "cookie", "proxy-authorization"}
    if any(k.lower() in forbidden for k in headers):
        raise ImaError("resource", "资料访问头包含不应转发的账号信息，已停止读取")
    try:
        request = Request(url_info["url"], headers=headers)
        with build_opener(ResourceRedirects()).open(request, timeout=25) as response:
            size = response.headers.get("Content-Length")
            if size and int(size) > MAX_RESOURCE_BYTES:
                raise ImaError("resource", "该资料超过本机预览大小限制，请使用 ima 客户端查看原文")
            data = response.read(MAX_RESOURCE_BYTES + 1)
            mime = response.headers.get_content_type()
            charset = response.headers.get_content_charset()
    except ImaError:
        raise
    except Exception:
        raise ImaError("resource", "资料原文读取失败，请使用 ima 客户端查看原文或稍后重试") from None
    if len(data) > MAX_RESOURCE_BYTES:
        raise ImaError("resource", "该资料超过本机预览大小限制，请使用 ima 客户端查看原文")
    return data, mime, charset


def image_mime(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class ImaKnowledge:
    """Opaque refs identify only items returned by authenticated ima calls."""

    def __init__(self, client_factory=ImaClient, find_base=None, fetcher=fetch_resource):
        self.client_factory = client_factory
        self.find_base = find_base or find_knowledge_base
        self.fetcher = fetcher
        self.lock = threading.RLock()
        self.references = OrderedDict()
        self.assets = OrderedDict()
        self.asset_bytes = 0

    def put(self, record):
        reference = secrets.token_urlsafe(24)
        with self.lock:
            self.references[reference] = {**deepcopy(record), "expires": time.monotonic() + 3600}
            while len(self.references) > 2000:
                self.references.popitem(last=False)
        return reference

    def get(self, reference, name=None):
        if not isinstance(reference, str) or len(reference) > 100:
            raise ImaError("selection", "资料引用无效，请重新搜索")
        with self.lock:
            record = self.references.get(reference)
            if not record or record["expires"] < time.monotonic():
                raise ImaError("selection", "资料引用已失效，请重新搜索或浏览")
            if name is not None and record["knowledge_base"] != name:
                raise ImaError("selection", "资料不属于当前知识库，请重新选择")
            return deepcopy(record)

    def register(self, entry, base):
        media_id = entry.get("media_id")
        if not isinstance(media_id, str) or not media_id:
            return None
        record = {"kb_id": base["kb_id"], "knowledge_base": base["kb_name"], "media_id": media_id, "title": str(entry.get("title") or entry.get("name") or "未命名条目")[:300], "media_type": entry.get("media_type"), "parent_folder_id": entry.get("parent_folder_id")}
        kind = "folder" if record["media_type"] == 99 else "image" if record["media_type"] == 9 else "document"
        reference = self.put(record)
        return {"ref": reference, "title": record["title"], "kind": kind, "excerpt": re.sub(r"<[^>]+>", "", str(entry.get("highlight_content") or ""))[:700]}

    def listing(self, data, base, key, mode, continuation=None):
        entries = data.get(key)
        if not isinstance(entries, list):
            raise ImaError("response", "知识库返回缺少有效条目列表")
        items = []
        for entry in entries[:200]:
            if isinstance(entry, dict):
                item = self.register(entry, base)
                if item:
                    items.append(item)
        next_cursor = data.get("next_cursor")
        next_ref = None
        if data.get("is_end") is not True and isinstance(next_cursor, str) and next_cursor and continuation and next_cursor != continuation.get("cursor"):
            next_ref = self.put({**continuation, "cursor": next_cursor, "kb_id": base["kb_id"], "knowledge_base": base["kb_name"], "operation": mode})
        path = []
        for node in data.get("current_path") or []:
            title = node.get("name") or node.get("title")
            folder_id = node.get("folder_id") or node.get("media_id")
            if title and isinstance(folder_id, str) and (not path or title != path[-1]["title"]):
                reference = self.put({"kb_id": base["kb_id"], "knowledge_base": base["kb_name"], "media_id": folder_id, "title": str(title), "media_type": 99})
                path.append({"title": str(title), "ref": reference})
        return {"mode": mode, "knowledge_base": base["kb_name"], "items": items, "count": len(items), "breadcrumbs": path, "next_page_ref": next_ref, "truncated": len(entries) > 200}

    def search(self, query, name, page_ref=None):
        client = self.client_factory()
        base = self.find_base(client, name)
        if page_ref:
            continuation = self.get(page_ref, name)
            if continuation.get("operation") != "search" or continuation.get("query") != query:
                raise ImaError("selection", "翻页引用不属于当前搜索，请重新检索")
            data = client.search(base["kb_id"], query, continuation["cursor"])
            mode = "search"
        else:
            result = client.search_or_browse(base["kb_id"], query)
            data, mode = result["data"], result["mode"]
        if mode == "directory":
            return self.browse(name)
        output = self.listing(data, base, "info_list", "search", {"query": query, "cursor": "" if not page_ref else continuation["cursor"]})
        output["query"] = query
        output["note"] = "从指定 ima 共享库实时检索。可进入文件夹、查看原文或图片，并选择资料供后续调用。"
        if output["truncated"]:
            output["note"] += "本次最多展示 200 个条目，请缩小关键词以定位其他结果。"
        return output

    def browse(self, name, folder_ref=None, page_ref=None):
        client = self.client_factory()
        base = self.find_base(client, name)
        folder_id, cursor = None, ""
        if page_ref:
            record = self.get(page_ref, name)
            if record.get("operation") != "directory":
                raise ImaError("selection", "翻页引用不属于当前目录")
            folder_id, cursor = record.get("folder_id"), record["cursor"]
        elif folder_ref:
            record = self.get(folder_ref, name)
            if record.get("media_type") != 99:
                raise ImaError("selection", "选中的资料不是文件夹")
            folder_id = record["media_id"]
        data = client.list_entries(base["kb_id"], cursor=cursor, folder_id=folder_id)
        entries = data.get("knowledge_list")
        if not folder_ref and not page_ref and isinstance(entries, list) and len(entries) == 1 and entries[0].get("media_type") == 99 and entries[0].get("title") == name and data.get("is_end") is True:
            folder_id = entries[0]["media_id"]
            data = client.list_entries(base["kb_id"], folder_id=folder_id)
        output = self.listing(data, base, "knowledge_list", "directory", {"folder_id": folder_id, "cursor": cursor})
        output["note"] = "正在浏览真实知识库目录。进入具体型号目录后，可打开产品资料与图片。"
        return output

    def source(self, client, record):
        path = []
        if record.get("parent_folder_id"):
            try:
                data = client.list_entries(record["kb_id"], folder_id=record["parent_folder_id"])
                for node in data.get("current_path") or []:
                    title = node.get("name") or node.get("title")
                    if title and (not path or title != path[-1]):
                        path.append(str(title))
            except ImaError:
                pass
        return {"knowledge_base": record["knowledge_base"], "title": record["title"], "path": path, "retrieved_at": datetime.now(timezone.utc).isoformat()}

    def read(self, reference, name):
        record = self.get(reference, name)
        if record.get("media_type") == 99:
            raise ImaError("selection", "请进入文件夹后选择具体资料")
        client = self.client_factory()
        info = client.media_info(record["media_id"])
        source = self.source(client, record)
        media_type = info.get("media_type", record.get("media_type"))
        if media_type == 11:
            note_id = (info.get("notebook_ext_info") or {}).get("notebook_id")
            if not isinstance(note_id, str) or not note_id:
                raise ImaError("resource", "未取得笔记正文入口，请使用 ima 客户端查看原文")
            text = client.note_content(note_id).get("content")
            if not isinstance(text, str):
                raise ImaError("response", "笔记响应没有有效正文，请使用 ima 客户端查看原文")
            return {"ref": reference, "kind": "document", "source": source, "text": text[:MAX_TEXT_CHARACTERS], "truncated": len(text) > MAX_TEXT_CHARACTERS}
        is_text = record["title"].lower().endswith(TEXT_EXTENSIONS) or media_type == 7
        if media_type != 9 and not is_text:
            raise ImaError("unsupported", "当前格式暂不支持本机预览，请使用 ima 客户端查看原文")
        data, mime, charset = self.fetcher(info.get("url_info"))
        if media_type == 9:
            actual_mime = image_mime(data)
            if not actual_mime:
                raise ImaError("resource", "返回内容不是可预览的真实图片，请使用 ima 客户端核实")
            with self.lock:
                old = self.assets.pop(reference, None)
                if old:
                    self.asset_bytes -= len(old[0])
                self.assets[reference] = (data, actual_mime)
                self.asset_bytes += len(data)
                while self.asset_bytes > 32 * 1024 * 1024:
                    _, evicted = self.assets.popitem(last=False)
                    self.asset_bytes -= len(evicted[0])
            return {"ref": reference, "kind": "image", "source": source, "asset_url": "/api/asset/" + reference, "size_bytes": len(data), "mime_type": actual_mime, "note": "已读取 ima 原始图片；仍需确认适用型号、版本与使用场景。"}
        if mime == "text/html" or data.lstrip().lower().startswith((b"<!doctype html", b"<html")):
            raise ImaError("resource", "返回内容是网页而非资料正文，请使用 ima 客户端查看原文")
        for encoding in ["utf-8-sig", charset or "utf-8", "gb18030"]:
            try:
                text = data.decode(encoding)
                break
            except (UnicodeError, LookupError):
                continue
        else:
            raise ImaError("resource", "无法识别资料正文编码，请使用 ima 客户端查看原文")
        return {"ref": reference, "kind": "document", "source": source, "text": text[:MAX_TEXT_CHARACTERS], "truncated": len(text) > MAX_TEXT_CHARACTERS, "size_bytes": len(data)}

    def asset(self, reference):
        self.get(reference)
        with self.lock:
            data = self.assets.get(reference)
            if not data:
                raise ImaError("resource", "图片预览已失效，请重新打开该图片")
            self.assets.move_to_end(reference)
            return data

    def retrieve(self, references, name, request_id):
        if not isinstance(references, list) or not 1 <= len(references) <= 8 or any(not isinstance(ref, str) for ref in references):
            raise ImaError("selection", "请先选择 1–8 份资料或图片")
        documents, images, warnings = [], [], []
        for reference in dict.fromkeys(references):
            try:
                content = self.read(reference, name)
                (images if content["kind"] == "image" else documents).append(content)
                if content.get("truncated"):
                    warnings.append(content["source"]["title"] + "：正文过长，已截断，请确认缺失部分后使用")
            except ImaError as error:
                warnings.append(str(error))
        return {"request_id": request_id, "status": "partial" if warnings and (documents or images) else "empty" if not documents and not images else "retrieved", "knowledge_base": name, "documents": documents, "images": images, "warnings": warnings, "note": "原文和图片直接取自 ima，未交给大模型，未将原文自动判定为已核验产品事实。"}
