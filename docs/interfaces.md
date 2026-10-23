# 接口约定 v1

唯一结构定义：[contracts/agent.schema.json](../contracts/agent.schema.json)。这是结构契约，不是已经实现的接口服务。

## 模块连接

1. 页面收集 task，传给 Agent 主流程；ima 模块提供独立的检索与原文读取能力。
2. Agent 先判断关键信息是否足够，再检索资料；必要时返回 needs_input 和 questions。
3. 计划将原始资料提取为 retrieval，包含 sources、facts、images、warnings；当前原文调用包见 knowledge-retrieval.md。
4. Agent 根据事实生成并核验，返回 result；页面显示四部分结果和状态。

正式生成流程按该结构实现；检索模块已有 Python 与 HTTP 调用方式。Agent 不直接读取页面表单内部状态，页面通过 JSON 传递任务。

## 必须遵守的语义

- product 要能区分型号、系统与销售版本；不能默默把模糊型号当作确定 SKU。
- task 允许字段为空，以便真实触发追问；product、audience、scenario、goal 为空时先处理缺失信息。
- request_id 在本次任务全流程一致；修改后应分配新 ID，避免串用旧型号证据。
- facts 逐条保存 statement、conditions、source_ids；来源引用必须确实存在于 sources。
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


## 官网与本地指导扩展

见 [官网与本地创作指导](official-guidance.md)。本次用户明确授权官网产品来源及本地 v7 写作指导；与原 ima 路径分别标注，不互相冒充。

- `POST /api/official/prepare`：输入 `{task}`，返回 `product_ref`、确认的完整型号、官网 URL、`intro`、`original_text`、`retrieved_at`、图片候选与本次指导文档标题。缺少需求时返回 400。型号必须来自服务端支持的明确型号，不能提交任意网页地址。
- `GET /api/official/asset/<ref>`：仅返回本次官网读取成功、检查过图片签名的内存图片；不接受远程 URL 或本地路径。
- `POST /api/generate`：官网模式添加 `source: "official"` 和 `product_ref`；服务端重新核对 task.product 与该引用绑定的型号。ima/原本地压缩包模式继续使用 references。
- `POST /api/revise`：官网稿件传 `source: "official"` 与服务器签发的 `run_ref`；从该次服务端记录恢复原始事实和指导，不能用客户端自带证据替换。
- `/api/status` 新增 `guidance` 配置状态与 `official_products` 支持的型号名称；不返回指导目录绝对路径、全文或凭证。

正式 result/evidence 契约不变。sources 中的可选 url 保存官网来源，response.data_source.mode 为 official；writing_guidance 进入模型上下文但不冒充 evidence.facts，响应只暴露指导标题。原文仍按片段 ID 提取和回填引文，独立核验仍需实际图片输入。
