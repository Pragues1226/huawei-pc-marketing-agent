# 不依赖账号的前置工具

这部分使用 Python，按既有 JSON 契约交换数据，不规定最终应用框架。没有调用大模型，不提供最终营销软文生成，也不能证明来源真实性。

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

review_structure 只返回 blocked 或 needs_review，永远不会把内容认证成 ready。引用 ID 存在，不代表原文确实支持正文；型号标签一致，不代表图片画面正确；未命中关键词，也不代表完整合规。

本节的前置工具只做确定性结构检查，不生成文案，也不执行模型语义核验。更完整的分层流程在 `agent.pipeline`：它包含基于已选资料的事实提取、稿件生成和独立模型复核；但模型判断不能证明事实绝对正确，真实来源、产品适配与合规仍需人工复核。当前本机凭证未配置，端到端实跑仍待完成。

当前没有修改共享 JSON 契约；前置工具报告与最终 Agent result 分开，避免队友误接成可交付结果。
