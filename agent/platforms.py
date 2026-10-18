"""Platform requirements from the competition handbook, not generated product claims."""

PLATFORMS = {
    "xiaohongshu": {
        "name": "小红书",
        "min_images": 3,
        "max_images": 6,
        "structure": ["口语化标题", "具体使用场景", "短段落", "话题标签"],
        "tone": "自然、具体，不伪造亲身体验",
        "cta": "根据内容目标选择咨询、收藏或到店体验",
    },
    "wechat_article": {
        "name": "公众号",
        "min_images": 2,
        "max_images": 4,
        "structure": ["标题", "导语", "分节正文", "结尾行动引导"],
        "tone": "清晰、有证据，围绕用户问题展开",
        "cta": "了解详情或预约体验，不能编造门店地址和活动",
    },
    "wechat_moments": {
        "name": "门店朋友圈",
        "min_images": 1,
        "max_images": 3,
        "structure": ["短文案", "一个核心卖点", "咨询或到店引导"],
        "tone": "简短直接，围绕一个明确体验理由",
        "cta": "咨询或到店体验，不能承诺无依据优惠",
    },
}


def platform_policy(platform):
    """Return an independent JSON-compatible copy."""
    from copy import deepcopy

    if platform not in PLATFORMS:
        raise ValueError("不支持的平台，请选择小红书、公众号或门店朋友圈")
    return deepcopy(PLATFORMS[platform])
