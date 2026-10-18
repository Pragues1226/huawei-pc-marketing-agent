"""Invoke the official script without placing credentials in command-line arguments."""

import json
import os
import shutil
import subprocess
from pathlib import Path

READ_ONLY_APIS = frozenset({
    "openapi/wiki/v1/search_knowledge_base",
    "openapi/wiki/v1/get_knowledge_list",
    "openapi/wiki/v1/search_knowledge",
    "openapi/wiki/v1/get_media_info",
    "openapi/note/v1/get_doc_content",
})


class ImaError(RuntimeError):
    def __init__(self, kind, message, code=None):
        super().__init__(message)
        self.kind = kind
        self.code = code


def load_local_env(path=".env"):
    """Load simple NAME=value lines without evaluation, interpolation or overriding env."""
    file = Path(path)
    if not file.is_file():
        return
    for line in file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        name, separator, value = line.partition("=")
        name, value = name.strip(), value.strip()
        if not separator or not name or not name.replace("_", "a").isalnum() or name[0].isdigit():
            raise ImaError("configuration", "本机 .env 格式错误，请使用 NAME=value 格式")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(name, value)


def credentials_from_env(env):
    values = []
    for primary, alias, filename in [("IMA_OPENAPI_CLIENTID", "IMA_CLIENT_ID", "client_id"), ("IMA_OPENAPI_APIKEY", "IMA_API_KEY", "api_key")]:
        value = (env.get(primary) or env.get(alias) or "").strip()
        if not value:
            path = Path.home() / ".config" / "ima" / filename
            try:
                value = path.read_text(encoding="utf-8").strip()
            except OSError:
                pass
        values.append(value)
    return tuple(values)


class ImaClient:
    def __init__(self, script_path=None, timeout=30, env=None, runner=None):
        self.env = dict(os.environ if env is None else env)
        self.script = Path(script_path or self.env.get("IMA_SKILL_SCRIPT") or "ima-skill/ima_api.cjs").resolve()
        self.timeout = timeout
        self.runner = runner or subprocess.run

    def diagnose(self):
        client_id, api_key = credentials_from_env(self.env)
        return {
            "node_available": shutil.which("node", path=self.env.get("PATH")) is not None,
            "official_script_available": self.script.is_file(),
            "client_id_configured": bool(client_id),
            "api_key_configured": bool(api_key),
            "live_connection_tested": False,
            "note": "仅本机配置检查，未发送请求，不显示凭证，也不能证明账号已加入共享库。",
        }

    def call(self, api_path, body):
        if api_path not in READ_ONLY_APIS:
            raise ImaError("unsupported", "此接入层只允许参赛需要的只读检索接口")
        if not self.script.is_file():
            raise ImaError("configuration", "未找到官方 ima_api.cjs，请配置 IMA_SKILL_SCRIPT")
        if not shutil.which("node", path=self.env.get("PATH")):
            raise ImaError("configuration", "未找到 Node.js，无法调用官方脚本")
        client_id, api_key = credentials_from_env(self.env)
        if not client_id or not api_key:
            raise ImaError("configuration", "请先在本机配置 ima Client ID 和 API Key")
        child_env = dict(self.env)
        child_env.update(IMA_OPENAPI_CLIENTID=client_id, IMA_OPENAPI_APIKEY=api_key, IMA_CLIENT_ID=client_id, IMA_API_KEY=api_key, IMA_BASE_URL="https://ima.qq.com")
        # No raw options from callers: the script's base URL must stay official.
        command = ["node", str(self.script), api_path, json.dumps(body, ensure_ascii=False)]
        try:
            result = self.runner(command, capture_output=True, text=True, encoding="utf-8", errors="replace", env=child_env, timeout=self.timeout, shell=False)
        except subprocess.TimeoutExpired:
            raise ImaError("timeout", "ima 调用超时，请检查网络后重试") from None
        except OSError:
            raise ImaError("process", "无法启动官方 ima 脚本，请检查本机安装") from None
        if result.returncode:
            try:
                error = json.loads(result.stderr)
            except (ValueError, TypeError):
                error = {}
            if not isinstance(error, dict):
                error = {}
            if error.get("code") == -200:
                raise ImaError("update_required", "官方 Skill 提示需更新；原请求未发送，请核对官方更新说明后重试", -200)
            # Do not copy arbitrary stderr or remote instructions into logs/UI.
            raise ImaError("process", "官方 ima 脚本执行失败，请检查凭证、网络和安装版本", error.get("code"))
        try:
            response = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise ImaError("response", "ima 返回内容不是合法 JSON") from None
        if not isinstance(response, dict) or "code" not in response:
            raise ImaError("response", "ima 响应缺少业务状态码，不能当作成功")
        if type(response["code"]) is not int or response["code"] != 0:
            raise ImaError("business", "ima 返回业务错误，请检查账号权限及请求参数", response.get("code"))
        if not isinstance(response.get("data"), dict):
            raise ImaError("response", "ima 成功响应缺少可解析的数据对象")
        return response["data"]

    def search_bases(self, query, cursor=""):
        return self.call("openapi/wiki/v1/search_knowledge_base", {"query": query, "cursor": cursor, "limit": 20})

    def list_entries(self, kb_id, cursor="", folder_id=None):
        body = {"knowledge_base_id": kb_id, "cursor": cursor, "limit": 20}
        if folder_id:
            body["folder_id"] = folder_id
        return self.call("openapi/wiki/v1/get_knowledge_list", body)

    def search(self, kb_id, query, cursor=""):
        return self.call("openapi/wiki/v1/search_knowledge", {"knowledge_base_id": kb_id, "query": query, "cursor": cursor})

    def media_info(self, media_id):
        return self.call("openapi/wiki/v1/get_media_info", {"media_id": media_id})

    def note_content(self, note_id):
        return self.call("openapi/note/v1/get_doc_content", {"note_id": note_id, "target_content_format": 0})

    def search_or_browse(self, kb_id, query, folder_id=None, max_pages=5):
        if not isinstance(max_pages, int) or isinstance(max_pages, bool) or max_pages < 1:
            raise ValueError("max_pages 必须是正整数")
        cursor, seen = "", set()
        for _ in range(max_pages):
            data = self.search(kb_id, query, cursor)
            items = data.get("info_list")
            if not isinstance(items, list):
                raise ImaError("response", "搜索返回缺少有效的条目列表")
            if items:
                return {"mode": "search", "data": data}
            if data.get("is_end") is True:
                break
            next_cursor = data.get("next_cursor")
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor or next_cursor in seen:
                break
            seen.add(cursor)
            cursor = next_cursor
        return {"mode": "directory", "data": self.list_entries(kb_id, folder_id=folder_id), "note": "目录回退结果，仍需进入相关文件夹并读取原文，不能直接当作产品事实。"}


def normalize_base(entry):
    """Support both the handbook's observed keys and the official reference examples."""
    if not isinstance(entry, dict):
        raise ImaError("response", "知识库条目不是对象")
    kb_id, name = entry.get("kb_id") or entry.get("id"), entry.get("kb_name") or entry.get("name")
    if not isinstance(kb_id, str) or not kb_id or not isinstance(name, str) or not name:
        raise ImaError("response", "知识库条目缺少有效的 ID 或名称")
    return {"kb_id": kb_id, "kb_name": name}
