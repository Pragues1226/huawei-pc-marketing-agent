"""Entirely synthetic development fixture; contains no real product claims or imagery."""

from datetime import datetime, timezone


def development_fixture():
    product = "教学虚构型号-A（非真实产品）"
    task = {"request_id": "development-only", "product": product, "audience": "开发测试人员", "scenario": "验证接口与错误拦截", "platform": "xiaohongshu", "goal": "测试，禁止用于参赛运行证明"}
    evidence = {
        "request_id": task["request_id"], "status": "ok",
        "sources": [{"source_id": "demo-source", "title": "纯虚构开发材料，非 ima 来源", "retrieved_at": datetime.now(timezone.utc).isoformat()}],
        "facts": [{"fact_id": "demo-fact", "product": product, "statement": "这是专供开发检查的虚构句子，不是产品事实。", "conditions": ["禁止发布为真实产品内容"], "source_ids": ["demo-source"]}],
        "images": [{"image_id": f"demo-image-{i}", "product": product, "name": f"虚构图片占位-{i}", "source_id": "demo-source", "asset_ref": f"demo://not-a-real-image/{i}", "caption": "无实际图片，仅用于接口测试"} for i in range(1, 4)],
        "warnings": [],
    }
    article = {
        "title": "开发演示：非真实营销内容", "lead": "用于验证接口。", "body": "这是开发占位内容，未调用 ima，也未调用模型。", "cta": "请接入真实服务后再生成。", "tags": ["开发测试"], "used_fact_ids": ["demo-fact"],
        "image_plan": [{"image_id": f"demo-image-{i}", "position": f"测试段落-{i}", "caption": "开发占位，非真实图片", "reason": "验证引用完整性"} for i in range(1, 4)],
    }
    return task, evidence, article
