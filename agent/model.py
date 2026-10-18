"""Small OpenAI-compatible JSON client used by the live Agent pipeline."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


SYSTEM_PROMPT = Path(__file__).resolve().parents[1] / "prompts" / "system.md"


class ModelError(RuntimeError):
    """Safe model error whose message never includes credentials or provider output."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def _endpoint(base_url: str) -> str:
    value = base_url.strip().rstrip("/")
    parsed = urlsplit(value)
    local_http = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    if (parsed.scheme != "https" and not local_http) or not parsed.hostname or parsed.username or parsed.password:
        raise ModelError("configuration", "LLM_BASE_URL 必须是 HTTPS 地址；本机服务可使用 localhost HTTP")
    if value.endswith("/chat/completions"):
        return value
    return value + ("/chat/completions" if value.endswith("/v1") else "/v1/chat/completions")


def _json_content(value):
    if isinstance(value, list):
        value = "".join(str(item.get("text", "")) for item in value if isinstance(item, dict))
    if not isinstance(value, str):
        raise ModelError("response", "模型响应缺少文本内容")
    text = value.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1)
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError):
        raise ModelError("response", "模型没有返回合法 JSON，请重试") from None
    if not isinstance(parsed, dict):
        raise ModelError("response", "模型返回的 JSON 不是对象")
    return parsed


class LLMClient:
    def __init__(self, api_key=None, base_url=None, model=None, timeout=90, opener=urlopen, reasoning_effort=None):
        self.api_key = (api_key if api_key is not None else os.environ.get("LLM_API_KEY", "")).strip()
        self.base_url = (base_url if base_url is not None else os.environ.get("LLM_BASE_URL", "")).strip()
        self.model = (model if model is not None else os.environ.get("LLM_MODEL", "")).strip()
        self.reasoning_effort = (reasoning_effort if reasoning_effort is not None else os.environ.get("LLM_REASONING_EFFORT", "")).strip()
        self.timeout = timeout
        self.opener = opener

    def diagnose(self):
        configured = bool(self.api_key and self.base_url and self.model)
        return {
            "api_key_configured": bool(self.api_key),
            "base_url_configured": bool(self.base_url),
            "model_configured": bool(self.model),
            "ready": configured,
            "note": "仅检查本机配置，不发送请求，也不显示模型密钥。",
        }

    def json_task(self, instruction, payload):
        if not self.api_key or not self.base_url or not self.model:
            raise ModelError("configuration", "请先配置 LLM_API_KEY、LLM_BASE_URL 和 LLM_MODEL")
        url = _endpoint(self.base_url)
        system = SYSTEM_PROMPT.read_text(encoding="utf-8")
        body = {
            "model": self.model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": instruction + "\n\n输入 JSON：\n" + json.dumps(payload, ensure_ascii=False)},
            ],
        }
        if self.reasoning_effort:
            body.pop("temperature", None)
            body["reasoning_effort"] = self.reasoning_effort
        request = Request(
            url,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self.opener(request, timeout=self.timeout) as response:
                raw = response.read(4 * 1024 * 1024 + 1)
        except HTTPError as error:
            raise ModelError("provider", f"模型服务返回 HTTP {error.code}，请检查模型名称、额度和接口地址") from None
        except (URLError, TimeoutError, OSError):
            raise ModelError("network", "模型服务连接失败或超时，请检查网络和接口地址") from None
        if len(raw) > 4 * 1024 * 1024:
            raise ModelError("response", "模型响应过大，已停止处理")
        try:
            response = json.loads(raw.decode("utf-8"))
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError, UnicodeError):
            raise ModelError("response", "模型服务返回了无法解析的响应") from None
        return _json_content(content)
