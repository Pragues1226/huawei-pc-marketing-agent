"""Explicitly configured OpenAI-compatible transport; no implicit destinations."""

import json
import os
import socket
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class ModelError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ModelError("模型接口发生重定向，已停止发送凭证；请检查配置地址。")


class ModelClient:
    def __init__(self, env=None, opener=None, timeout=120):
        env = os.environ if env is None else env
        self.key = env.get("LLM_API_KEY", "").strip()
        self.base = env.get("LLM_BASE_URL", "").strip().rstrip("/")
        self.model = env.get("LLM_MODEL", "").strip()
        self.reasoning_effort = env.get("LLM_REASONING_EFFORT", "").strip()
        self.timeout = timeout
        self.opener = opener or urllib.request.build_opener(NoRedirect())

    def diagnose(self):
        return {"key_configured": bool(self.key), "base_configured": bool(self.base), "model_configured": bool(self.model), "configured": bool(self.key and self.base and self.model)}

    def complete(self, system, data, images=None):
        if not self.diagnose()["configured"]:
            raise ModelError("模型配置不完整，请填写本机 .env 的密钥、接口地址和模型名。")
        parsed = urlsplit(self.base)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ModelError("模型接口必须是无凭证、无查询参数的 HTTPS 地址。")
        endpoint = self.base if parsed.path.endswith("/chat/completions") else self.base + "/chat/completions"
        content = json.dumps(data, ensure_ascii=False)
        if images:
            content = [{"type": "text", "text": content}]
            for item in images:
                content.extend([{"type": "text", "text": item["label"]}, {"type": "image_url", "image_url": {"url": item["url"]}}])
        payload = {"model": self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        request = urllib.request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Authorization": "Bearer " + self.key, "Content-Type": "application/json", "User-Agent": "PCWorkbench/0.3"})
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ModelError("模型响应过大，请缩小任务范围。")
            result = json.loads(raw)
            choice = result["choices"][0]
            if choice.get("finish_reason") not in (None, "stop"):
                raise ModelError("模型输出未完整结束，请重试或缩小任务范围。")
            content = choice["message"]["content"].strip()
            if content.startswith("```") and content.endswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            value = json.loads(content)
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except urllib.error.HTTPError as error:
            error.close()
            message = {401: "模型密钥未通过认证", 403: "当前密钥没有模型访问权限", 404: "模型或接口地址不存在", 429: "模型额度不足或请求过于频繁"}.get(error.code, "模型服务暂时不可用")
            raise ModelError(f"{message}（HTTP {error.code}），请检查服务配置。") from None
        except (urllib.error.URLError, TimeoutError, socket.timeout):
            raise ModelError("模型连接失败或超时，请检查网络后重试。") from None
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise ModelError("模型未返回有效的完整 JSON，未采用该响应，请重试。") from None

    def probe(self):
        result = self.complete('仅返回 JSON：{"ok": true}。', {"operation": "connection_test"})
        if result.get("ok") is not True:
            raise ModelError("模型已响应，但结构化输出测试未通过。")
        return {"status": "connected", "model": self.model, "note": "模型真实调用及 JSON 响应测试通过。"}
