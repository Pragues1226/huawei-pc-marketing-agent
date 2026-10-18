# 接口约定 v1

唯一结构定义：[contracts/agent.schema.json](../contracts/agent.schema.json)。这是结构契约，不是已经实现的接口服务。

## 模块连接

1. 页面收集 task，传给 Agent 主流程；ima 模块提供独立的检索与原文读取能力。
2. Agent 先判断关键信息是否足够，再检索资料；必要时返回 needs_input 和 questions。
3. Agent 将原始资料提取为 retrieval，包含 sources、带逐字引句的 facts、images、warnings；原文调用包见 knowledge-retrieval.md。
4. Agent 根据事实生成并核验，返回运行结果；页面显示场景策略、知识库依据、图文软文和核验状态。

正式生成流程按该结构实现；检索模块已有 Python 与 HTTP 调用方式。Agent 不直接读取页面表单内部状态，页面通过 JSON 传递任务。

## 必须遵守的语义

- product 要能区分型号、系统与销售版本；不能默默把模糊型号当作确定 SKU。
- task 允许字段为空，以便真实触发追问；product、audience、scenario、goal 为空时先处理缺失信息。
- request_id 在本次任务全流程一致；修改后应分配新 ID，避免串用旧型号证据。
- facts 逐条保存 statement、conditions、source_ids 与原文 quotes；引句必须能在对应原文中逐字找到，来源引用必须确实存在于 sources。
- source_id 使用本次请求内的标识，不需要在公开输出显示私有知识库 ID。
- image.asset_ref 是 B 返回的可用引用；不能凭文件名虚构访问地址。临时签名链接不得写入公开示例。
- images 中的 product 必须匹配本次明确型号。image_plan 只引用当前 images 已有 image_id。
- 检索 empty/error 不进入无依据生成。partial 必须写明缺失项；图片不足时标记待确认，不能用其他型号补齐。
- needs_input、blocked、error 时 article 为 null。ready 必须有 article，且核验没有 fail/pending，图片数量符合平台要求。
- 这些跨字段关系需在实际流程中校验；JSON Schema 不会自动核验来源真实性、引用关系和数量策略。
- verification 按实际完成情况逐项输出；没有执行检查不能显示 pass。

## 页面状态

| 状态 | 页面行为 |
|---|---|
| needs_input | 显示追问并允许补充 |
| blocked | 显示冲突或证据不足原因，禁止当成最终稿导出 |
| ready | 展示最终图文、证据、核验及复制 / 导出 |
| error | 显示可理解的错误与重试入口，不暴露凭证和原始敏感响应 |

页面将 scenario_analysis 显示为「场景判断」，evidence 为「知识库依据」，article 为「图文软文」，verification 为「核验结果」。strategy 可作为展开项展示。
