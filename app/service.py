"""UI-facing operations. Only explicit connection/search actions call ima."""

from copy import deepcopy
import os
import re
import threading

from agent.demo import development_fixture
from agent.platforms import platform_policy
from agent.preflight import prepare_task, review_structure
from agent.model import ModelClient
from agent.pipeline import MarketingPipeline
from ima.client import ImaClient, ImaError, normalize_base
from ima.retrieval import ImaKnowledge
from ima.local import LocalKnowledge

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


def content_angle_options(task):
    audience, scenario = task["audience"], task["scenario"]
    return [
        {
            "id": "task_list", "name": "需求清单先行", "headline": "先列清单，再看适配",
            "angle": f"围绕「{scenario}」，先把要完成的核心任务、常用应用和适用条件列清，再用具体型号资料逐项核对。",
            "lead": "先把要完成的事写下来，再逐项核对应用、系统与适用条件。",
            "priorities": [f"{audience}要完成的核心任务", "常用应用、系统版本与外设要求", "购买前必须从官方资料确认的条件"],
            "questions": ["哪些任务必须由这台电脑完成？", "常用应用、系统版本和外设有哪些？"],
            "action": "把任务清单带到咨询现场，逐项核对具体型号和适用条件。",
        },
        {
            "id": "daily_flow", "name": "一日流程拆解", "headline": "按一天流程拆解",
            "angle": f"按「开始前—进行中—收尾后」梳理{audience}在「{scenario}」中的使用流程，让内容跟着真实任务顺序展开，不预设产品能力。",
            "lead": "按「开始前—进行中—收尾后」梳理每一步需要什么。",
            "priorities": ["开始前：资料、应用与设备准备", "进行中：任务切换与协作方式", "收尾后：文件交付与适用条件"],
            "questions": ["任务开始前通常要准备什么资料和设备？", "流程中会切换哪些应用或协作方式？"],
            "action": "按真实流程准备文件、应用和外设，逐步确认是否适合。",
        },
        {
            "id": "experience_task", "name": "真实任务挑战", "headline": "带真实任务去体验",
            "angle": f"从「{scenario}」中挑一项可现场完成的真实任务，引导读者亲自体验，并把系统、应用和外设等条件列入核对清单。",
            "lead": "带上自己的资料和常用应用，完成一项能当场核对的任务。",
            "priorities": ["准备一份自己的资料和常用应用", "现场完成一项实际操作", "记录需要确认的配置、接口或环境"],
            "questions": ["哪项任务可以带到门店现场演示？", "体验前还需确认哪些配置、接口或环境？"],
            "action": "带上自己的文件和常用应用，现场完成一项任务；未确认的信息先记下来。",
        },
    ]


def recommended_angle_id(task):
    text = task["audience"] + task["scenario"]
    if any(word in text for word in ["出差", "差旅", "移动办公", "会议", "流程"]):
        return "daily_flow"
    if any(word in text for word in ["门店", "到店", "附近", "体验"]):
        return "experience_task"
    return "task_list"


def demo_result(task, angle_id=None):
    preparation = prepare_task(task)
    if preparation["status"] != "prepared":
        return {"mode": "development_only", "status": preparation["status"], "task": task, "preparation": preparation}
    _, evidence, article = development_fixture()
    strategy = scene_strategy(task)
    angle_options = content_angle_options(task)
    angle_id = angle_id or recommended_angle_id(task)
    selected_angle = next((option for option in angle_options if option["id"] == angle_id), None)
    if selected_angle is None:
        raise ValueError("内容切入方向无效")
    strategy.update({
        "angle": selected_angle["angle"],
        "priorities": selected_angle["priorities"],
        "questions": selected_angle["questions"],
        "angle_id": selected_angle["id"],
        "angle_name": selected_angle["name"],
    })
    policy = strategy["platform"]
    evidence["request_id"] = task["request_id"]
    for entry in [*evidence["facts"], *evidence["images"]]:
        entry["product"] = task["product"]
    count = policy["min_images"]
    evidence["images"] = evidence["images"][:count]
    priorities = strategy["priorities"]
    if task["platform"] == "xiaohongshu":
        article.update(
            title=f"{task['audience']}选电脑：{selected_angle['headline']}",
            lead=f"围绕「{task['scenario']}」，{selected_angle['lead']}",
            body=f"选购 {task['product']} 前，先把真实任务放在参数前面。\n\n① {priorities[0]}\n写下具体任务和必须完成的操作，不从未核实的产品能力开始。\n\n② {priorities[1]}\n列出常用应用、版本、地点与外设，再逐项确认适用条件。\n\n③ {priorities[2]}\n[待补：从指定 ima 资料核对的产品事实、适用条件和图片。]\n\n这份规则演示只展示表达方向，尚未确认产品能力。",
            cta=selected_angle["action"],
            tags=["选购思路", "场景清单", "开发演示"],
        )
    elif task["platform"] == "wechat_article":
        article.update(
            title=f"{selected_angle['headline']}：为{task['audience']}梳理电脑选择",
            lead=selected_angle["lead"],
            body=f"## 01 从真实任务开始\n{strategy['angle']}\n\n## 02 按方向整理核对重点\n- {priorities[0]}\n- {priorities[1]}\n- {priorities[2]}\n\n## 03 再看具体产品是否适合\n本次目标型号为 {task['product']}。\n[待补：指定 ima 资料中的事实、适用范围与限制。]\n\n## 04 用真实体验完成判断\n规则演示只提供内容结构，产品能力仍需通过指定资料和实际体验核实。",
            cta=selected_angle["action"],
            tags=[],
        )
    else:
        article.update(
            title=f"{selected_angle['headline']}｜{task['audience']}",
            lead="",
            body=f"如果你也有「{task['scenario']}」的需求，可以先这样开始：{selected_angle['lead']}\n\n[待补：从指定 ima 资料核对、适合本场景的产品事实。]\n\n开发示例，产品能力与体验安排均待确认。",
            cta=selected_angle["action"],
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
        "content_angles": angle_options,
    }


class WorkbenchService:
    def __init__(self, client_factory=ImaClient, model_factory=ModelClient):
        self.client_factory = client_factory
        self.lock = threading.Lock()
        self.connection = {"status": "not_checked", "knowledge_base": DEFAULT_KB, "note": "尚未验证共享知识库连接"}
        self.knowledge = LocalKnowledge(os.environ["LOCAL_KNOWLEDGE_ZIP"]) if os.environ.get("KNOWLEDGE_SOURCE") == "local" else ImaKnowledge(client_factory, self.find_base)
        self.model_factory = model_factory
        self.pipeline = MarketingPipeline(self.knowledge, scene_strategy, model_factory)

    def status(self):
        with self.lock:
            connection = deepcopy(self.connection)
        model = self.model_factory().diagnose()
        source = self.knowledge.describe() if isinstance(self.knowledge, LocalKnowledge) else {"mode": "ima", "label": "ima 共享知识库"}
        return {"ima": self.client_factory().diagnose(), "connection": connection, "model": model, "data_source": source, "model_configured": model["configured"], "live_generation_available": model["configured"]}

    def record_access(self, name):
        with self.lock:
            self.connection = {"status": "connected", "knowledge_base": name, "note": "本地知识库已就绪，本次不消耗 ima 资料读取次数。" if isinstance(self.knowledge, LocalKnowledge) else "已成功访问该共享知识库。"}

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
        if isinstance(self.knowledge, LocalKnowledge):
            self.record_access(name)
            return {"status": "connected", "knowledge_base": name, **self.knowledge.describe()}
        client = self.client_factory()
        try:
            base = self.find_base(client, name)
            data = client.list_entries(base["kb_id"])
            entries = data.get("knowledge_list")
            if not isinstance(entries, list):
                raise ImaError("response", "目录返回缺少有效条目列表")
            result = {"status": "connected", "knowledge_base": base["kb_name"], "first_page_entry_count": len(entries), "note": "共享库可访问，可继续检索、浏览和读取资料。"}
        except ImaError as error:
            result = {"status": "not_connected", "knowledge_base": name, "note": str(error)}
            with self.lock:
                self.connection = result
            raise
        with self.lock:
            self.connection = result
        return result

    def search(self, query, name=DEFAULT_KB, page_ref=None):
        return self.knowledge.search(query, name, page_ref)
