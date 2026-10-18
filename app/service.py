"""UI-facing operations. Only explicit connection/search actions call ima."""

from copy import deepcopy
import os
import re
import threading

from agent.demo import development_fixture
from agent.platforms import platform_policy
from agent.preflight import prepare_task, review_structure
from ima.client import ImaClient, ImaError, normalize_base

DEFAULT_KB = "任德耀新建华为PC知识库"


def scene_strategy(task):
    text = task["scenario"] + task["audience"]
    if any(word in text for word in ["学生", "开学", "新生", "大学"]):
        angle = "从一天的学习安排切入，先确认课程和专业软件，再讨论携带与设备协同。"
        priorities = ["课程与专业软件需求", "往返教室和宿舍的携带场景", "学习资料与设备之间的流转"]
        questions = ["专业课程需要哪些具体软件？", "常去的学习场所和外设有哪些？"]
    elif any(word in text for word in ["出差", "办公", "职场", "会议", "商务"]):
        angle = "从会议、差旅和文档流转切入，围绕一段完整工作流程组织内容。"
        priorities = ["会议和文档处理任务", "移动办公环境与外设", "跨设备工作流及适用条件"]
        questions = ["需要接入哪些企业应用或会议系统？", "出差时通常连接什么屏幕与外设？"]
    elif any(word in text for word in ["门店", "到店", "附近"]):
        angle = "选择一个有依据、能现场演示的卖点，让读者有明确的到店体验理由。"
        priorities = ["一个可演示的核心任务", "体验前需要确认的设备与应用", "清楚的到店或咨询引导"]
        questions = ["门店可以演示哪些真实功能？", "是否有已确认的门店地址和体验安排？"]
    else:
        angle = "从用户要完成的任务切入，先确认实际要求，再匹配有来源的产品事实。"
        priorities = ["用户的核心任务", "系统和应用适用条件", "可验证的体验与下一步行动"]
        questions = ["最常见的使用任务是什么？", "必须满足的应用和外设条件有哪些？"]
    return {"angle": angle, "priorities": priorities, "questions": questions, "platform": platform_policy(task["platform"])}


def demo_result(task):
    preparation = prepare_task(task)
    if preparation["status"] != "prepared":
        return {"mode": "development_only", "status": preparation["status"], "task": task, "preparation": preparation}
    _, evidence, article = development_fixture()
    strategy = scene_strategy(task)
    policy = strategy["platform"]
    evidence["request_id"] = task["request_id"]
    for entry in [*evidence["facts"], *evidence["images"]]:
        entry["product"] = task["product"]
    count = policy["min_images"]
    evidence["images"] = evidence["images"][:count]
    priorities = strategy["priorities"]
    if task["platform"] == "xiaohongshu":
        article.update(
            title=f"{task['audience']}选电脑，先把这三件事想清楚",
            lead=f"围绕「{task['scenario']}」，把需求放在参数前面。",
            body=f"选购 {task['product']} 前，先写下你希望用电脑完成的任务。\n\n① {priorities[0]}\n把真实应用、版本和使用习惯列出来，避免只看型号名称就做判断。\n\n② {priorities[1]}\n把常用地点、外设和已有设备纳入选择清单。\n\n③ {priorities[2]}\n[待补：从 ima 检索并核实的产品事实、适用条件和图片。]\n\n这份内容只是排版与需求表达示例，尚未确认产品能力。",
            cta="带着自己的应用和设备清单咨询，确认适用性后再做选择。",
            tags=["选购思路", "场景清单", "开发演示"],
        )
    elif task["platform"] == "wechat_article":
        article.update(
            title=f"从{task['scenario']}出发，重新梳理电脑选择",
            lead=f"面对{task['audience']}，先理解任务，再整理有依据的选择理由。",
            body=f"## 01 从实际任务开始\n{strategy['angle']}\n\n## 02 把需求变成核对清单\n- {priorities[0]}\n- {priorities[1]}\n- {priorities[2]}\n\n## 03 再看具体产品是否适合\n本次目标型号为 {task['product']}。\n[待补：指定 ima 资料中的事实、适用范围与限制。]\n\n## 04 用真实体验完成判断\n带着应用、外设与工作流清单进行验证。本文为结构演示，尚未确认任何产品能力。",
            cta="预约体验前，先说明使用场景和需要验证的应用。",
            tags=[],
        )
    else:
        article.update(
            title=f"选电脑，先从{priorities[0]}聊起",
            lead="",
            body=f"最近在关注 {task['product']}？\n如果你也有「{task['scenario']}」的需求，可以先把常用应用和设备列出来。\n\n[待补：一个来自 ima、适合本场景且可演示的产品事实。]\n\n开发示例，产品能力与体验安排均待确认。",
            cta="欢迎先聊聊使用需求，再一起确定需要体验和验证的内容。",
            tags=[],
        )
    article["image_plan"] = article["image_plan"][:count]
    for i, item in enumerate(article["image_plan"], 1):
        item.update(position="标题之后" if i == 1 else f"第 {i} 个内容段落后", caption=f"构图示意 {i} · 待替换为 ima 真实图片", reason="封面建立场景" if i == 1 else f"配合「{priorities[min(i-1, 2)]}」说明；仅为占位")
    report = review_structure(task, evidence, article)
    return {
        "mode": "development_only", "status": "draft", "notice": "规则演示：未调用大模型；事实与图片均为开发占位，不能作为正式营销稿或参赛运行证明。",
        "task": deepcopy(task), "preparation": preparation, "strategy": strategy,
        "evidence": evidence, "article": article, "review": report,
    }


class WorkbenchService:
    def __init__(self, client_factory=ImaClient):
        self.client_factory = client_factory
        self.lock = threading.Lock()
        self.connection = {"status": "not_checked", "knowledge_base": DEFAULT_KB, "note": "尚未验证共享知识库连接"}

    def status(self):
        with self.lock:
            connection = deepcopy(self.connection)
        return {"ima": self.client_factory().diagnose(), "connection": connection, "model_configured": bool(os.environ.get("LLM_API_KEY") and os.environ.get("LLM_MODEL")), "live_generation_available": False}

    def find_base(self, client, name):
        cursor, seen, matches = "", set(), {}
        for _ in range(5):
            data = client.search_bases(name, cursor)
            entries = data.get("info_list")
            if not isinstance(entries, list):
                raise ImaError("response", "知识库搜索缺少有效列表")
            for item in entries:
                base = normalize_base(item)
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

    def probe(self, name=DEFAULT_KB):
        client = self.client_factory()
        try:
            base = self.find_base(client, name)
            data = client.list_entries(base["kb_id"])
            entries = data.get("knowledge_list")
            if not isinstance(entries, list):
                raise ImaError("response", "目录返回缺少有效条目列表")
            result = {"status": "connected", "knowledge_base": base["kb_name"], "first_page_entry_count": len(entries), "note": "共享库可访问；尚未验证产品原文与图片。"}
        except ImaError as error:
            result = {"status": "not_connected", "knowledge_base": name, "note": str(error)}
            with self.lock:
                self.connection = result
            raise
        with self.lock:
            self.connection = result
        return result

    def search(self, query, name=DEFAULT_KB):
        client = self.client_factory()
        base = self.find_base(client, name)
        result = client.search_or_browse(base["kb_id"], query)
        key = "info_list" if result["mode"] == "search" else "knowledge_list"
        entries = result["data"].get(key)
        if not isinstance(entries, list):
            raise ImaError("response", "知识库检索缺少有效条目列表")
        # Private IDs, media URLs and required headers stay outside browser output.
        items = [{"title": str(item.get("title") or item.get("name") or "未命名条目")[:200], "excerpt": re.sub(r"<[^>]+>", "", str(item.get("highlight_content") or ""))[:500]} for item in entries[:20] if isinstance(item, dict)]
        return {"mode": result["mode"], "knowledge_base": base["kb_name"], "items": items, "count": len(items), "note": "找到资料条目；原文、事实与图片仍需核实。" if result["mode"] == "search" else "搜索无命中，已回退到目录；目录条目不等于产品事实。"}
