"""Check structure and referential integrity; never certify truth or final compliance."""

import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from rfc3339_validator import validate_rfc3339

from .platforms import platform_policy

CONTRACT_PATH = Path(__file__).resolve().parents[1] / "contracts" / "agent.schema.json"
FORMAT_CHECKER = FormatChecker()


@FORMAT_CHECKER.checks("date-time")
def check_timestamp(value):
    # Explicit dependency: jsonschema otherwise silently skips unavailable formats.
    return not isinstance(value, str) or validate_rfc3339(value.upper())


def validate_shape(kind, value):
    schema = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if kind not in schema["$defs"]:
        raise ValueError("未知接口类型")
    validator = Draft202012Validator(
        {"$schema": schema["$schema"], "$ref": f"#/$defs/{kind}", "$defs": schema["$defs"]},
        format_checker=FORMAT_CHECKER,
    )
    # Do not include input values in messages: they may contain private material.
    return [
        {"path": "/".join(str(p) for p in error.absolute_path) or "$", "rule": error.validator}
        for error in sorted(validator.iter_errors(value), key=lambda e: str(list(e.absolute_path)))
    ]


def prepare_task(task):
    errors = validate_shape("task", task)
    if errors:
        return {"status": "invalid", "errors": errors, "questions": []}
    labels = {"product": "具体产品型号与系统 / 销售版本", "audience": "目标人群", "scenario": "使用场景", "goal": "内容目标"}
    questions = [f"请补充{label}。" for key, label in labels.items() if not task[key].strip()]
    if task["product"].strip() and any(word in task["product"] for word in ["待确认", "不确定", "轻薄本", "随便"]):
        questions.append("请确认具体型号、系统与销售版本，避免混用资料。")
    return {
        "status": "needs_input" if questions else "prepared",
        "request_id": task["request_id"],
        "questions": questions,
        "platform_policy": platform_policy(task["platform"]),
        "next_step": "补充信息后再检索" if questions else "调用 ima 检索；此步骤尚未生成软文",
    }


def review_structure(task, evidence, article):
    """Return checks, always leaving semantic and source authenticity review pending."""
    checks = []

    def add(category, status, detail, ids=()):
        checks.append({"category": category, "status": status, "detail": detail, "evidence_ids": list(ids)})

    for kind, value in [("task", task), ("retrieval", evidence), ("article", article)]:
        errors = validate_shape(kind, value)
        if errors:
            add("fact", "fail", f"{kind} 接口格式错误，字段路径与规则：{errors}")
    if any(c["status"] == "fail" for c in checks):
        return {"status": "blocked", "checks": checks}

    prepared = prepare_task(task)
    if prepared["status"] != "prepared":
        add("fact", "fail", "任务信息未确认，需先补充：" + " ".join(prepared["questions"]))
    if task["request_id"] != evidence["request_id"]:
        add("fact", "fail", "检索结果不属于当前请求，不能复用旧任务证据")
    if evidence["status"] != "ok":
        add("fact", "fail", "检索未完整成功，需解决缺失项后再交付")
    if evidence["warnings"]:
        add("fact", "pending", "检索存在警告，需确认后处理")

    for collection, key, category in [(evidence["sources"], "source_id", "fact"), (evidence["facts"], "fact_id", "fact"), (evidence["images"], "image_id", "image")]:
        ids = [entry[key] for entry in collection]
        if len(ids) != len(set(ids)):
            add(category, "fail", f"{key} 重复，无法唯一追溯")

    source_ids = {s["source_id"] for s in evidence["sources"]}
    facts = {f["fact_id"]: f for f in evidence["facts"]}
    images = {i["image_id"]: i for i in evidence["images"]}
    if not source_ids or not facts:
        add("fact", "fail", "缺少来源或产品事实，不得生成无依据软文")
    for fact in evidence["facts"]:
        if fact["product"].strip() != task["product"].strip():
            add("fact", "fail", "事实对应型号与当前任务不一致", [fact["fact_id"]])
        if not set(fact["source_ids"]).issubset(source_ids):
            add("fact", "fail", "事实引用了不存在的来源", [fact["fact_id"]])
    for image in evidence["images"]:
        if image["product"].strip() != task["product"].strip():
            add("image", "fail", "图片对应型号与当前任务不一致", [image["image_id"]])
        if image["source_id"] not in source_ids:
            add("image", "fail", "图片引用了不存在的来源", [image["image_id"]])

    if not article["used_fact_ids"]:
        add("fact", "fail", "软文未声明使用的事实 ID")
    unknown = set(article["used_fact_ids"]) - set(facts)
    if unknown:
        add("fact", "fail", "软文引用了不存在的事实 ID", sorted(unknown))
    selected = [item["image_id"] for item in article["image_plan"]]
    if len(selected) != len(set(selected)):
        add("image", "fail", "同一图片重复计数，不能用重复图片凑数量")
    unknown = set(selected) - set(images)
    if unknown:
        add("image", "fail", "配图方案引用了不存在的图片", sorted(unknown))
    for item in article["image_plan"]:
        if any(not item[field].strip() for field in ["position", "caption", "reason"]):
            add("image", "fail", "配图缺少插入位置、图注或选择原因", [item["image_id"]])
    policy = platform_policy(task["platform"])
    count = len(set(selected))
    if not policy["min_images"] <= count <= policy["max_images"]:
        add("platform", "fail", f"{policy['name']} 配图要求为 {policy['min_images']}–{policy['max_images']} 张不同图片")
    if any(not article[field].strip() for field in ["title", "body", "cta"]):
        add("platform", "fail", "缺少标题、正文或行动引导")
    if task["platform"] == "xiaohongshu" and not any(tag.strip() for tag in article["tags"]):
        add("platform", "fail", "小红书缺少话题标签")
    if task["platform"] == "wechat_article" and not article["lead"].strip():
        add("platform", "fail", "公众号缺少导语")

    # This is a conservative review trigger, not a complete legal/compliance assessment.
    text = "\n".join([article["title"], article["lead"], article["body"], article["cta"], *article["tags"], *(i["caption"] for i in article["image_plan"])])
    hits = [word for word in ["全网第一", "全国第一", "行业第一", "百分之百", "100%保证", "绝对不卡", "永久不卡", "零风险"] if word in text]
    if hits:
        add("compliance", "fail", "发现高风险宣传表达，需改写或人工核实：" + "、".join(hits))
    if re.search(r"补贴|优惠|券后|到手价|赠品|\d+(?:\.\d+)?\s*元", text):
        add("compliance", "pending", "检测到价格或权益表达，需核对具体配置、条件和时效")

    if not any(c["status"] == "fail" for c in checks):
        add("fact", "pass", "接口结构、请求归属、型号及引用关系检查通过；不代表事实语义通过")
        add("image", "pass", "图片引用、型号标签、数量与编排字段检查通过；未检查实际图像内容")
    add("fact", "pending", "尚需独立核对正文每条声明与原文、适用条件，并证明来源确实来自 ima")
    add("image", "pending", "尚需确认图片实际可访问、画面型号一致且来源有效")
    add("compliance", "pending", "关键词检查不能替代完整语义与营销合规复核")
    add("platform", "pending", "结构字段检查不能证明场景切入、语气和平台质量，需要内容复核")
    return {"status": "blocked" if any(c["status"] == "fail" for c in checks) else "needs_review", "checks": checks}
