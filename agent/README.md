# Agent 模块

在此实现需求解析、场景和平台策略、生成、核验与修改流程；提示词放 prompts/。

计划输入 task，调用 ima 模块取得原始资料，提取事实后生成并核验 result。结构见 ../contracts/agent.schema.json；语义见 ../docs/interfaces.md。完整生成流程仍待实现。

已有可复用前置工具：platforms.py 为三平台策略，preflight.py 为输入和引用完整性检查。运行 python -m agent demo 可查看纯虚构开发演示。review_structure 不输出 ready，也未实现原文语义核验。

首个里程碑仍是：接真实检索与模型，完成一次有依据的生成。详见 ../docs/preflight.md。
