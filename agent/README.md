# Agent 模块

在此实现需求解析、场景和平台策略、生成、核验与修改流程；提示词放 prompts/。

输入 task 与 ima 原始调用包后，pipeline.py 依次完成带原文引句的事实提取、场景与平台策略、图文生成、结构检查和独立语义核验。model.py 使用兼容 OpenAI Chat Completions 的 JSON 响应接口。

platforms.py 提供三平台规则，preflight.py 负责输入、引用和高风险词的确定性检查。pipeline.py 只有在原文引句、当前型号图片数量、模型语义核验全部通过后才返回 ready；任何检索警告、证据不足或核验缺项都会阻止交付。

下一步是在参赛账号上完成 T01 的一次真实运行，检查模型返回、事实引句、图片型号和导出稿，再扩展到其余平台。详见 ../docs/acceptance.md。
