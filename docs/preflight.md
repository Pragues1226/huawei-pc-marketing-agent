# 不依赖账号的前置工具

这部分保留不依赖账号的确定性检查，按既有 JSON 契约交换数据。真实模式在此基础上接入模型与 ima 原始调用包；单独运行这些前置工具仍不能证明来源真实性或形成可交付稿。

## 安装与运行

在仓库根目录：

```bash
python -m pip install -r requirements.txt
python -m agent demo
python -m agent prepare --task contracts/task.example.json
python -m ima diagnose
python -m unittest discover -s tests -v
```

建议 Python 3.10 或更高版本；当前在 Windows / Python 3.13 验证。demo 使用纯虚构型号与图片占位，明确显示 development_only；没有真实图片，不是参赛运行结果。

## 可直接复用

- agent.platforms.platform_policy(platform)：三平台结构、图数、语气和行动引导规则。
- agent.preflight.prepare_task(task)：JSON 格式检查、缺失字段和模糊版本追问。
- agent.preflight.review_structure(task, evidence, article)：请求归属、来源引用、事实与图片型号、图片计数、编排字段及保守关键词检查。
- ima.client.ImaClient：独立的官方脚本只读桥接，详见 ima-setup.md。

## 检查边界

review_structure 只返回 blocked 或 needs_review，永远不会单独把内容认证成 ready。真实 pipeline 还要求原文逐字引句、当前型号图片和独立模型核验全部通过。引用 ID 存在，不代表原文支持正文；型号路径一致，也不能替代发布前人工查看图片；未命中关键词不代表完整合规。

真实 pipeline 已补充基于原文引句的事实检查、场景与平台内容质量判断，并且只在全部自动检查完成后返回 ready。真实 ima 来源、图片画面与最终营销表达仍需队员在每组参赛结果中人工确认。

共享 JSON 契约已为 fact 增加可选 quotes 字段，用于保留逐字原文引句；前置工具报告与最终 Agent result 仍分开，避免把结构检查误接成可交付结果。
