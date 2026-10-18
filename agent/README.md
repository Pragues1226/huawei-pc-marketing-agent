# A：Agent 模块

在此实现需求解析、场景和平台策略、生成、核验与修改流程；提示词放 prompts/。

输入 task，调用 B 提供的 retrieve(task)，输出 result。结构见 ../contracts/agent.schema.json；语义见 ../docs/interfaces.md。

首个里程碑：接真实检索完成一次有依据的生成。当前没有实现代码。
