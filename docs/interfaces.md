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
- `POST /api/revise`：官网稿件传 `source: "official"` 与服务器签发的 `run_ref`；从该次服务端记录恢复原始事实和指导，不能用客户端自带证据替换。附 `recheck_only: true` 时，仅重新核验服务器保留的原稿，忽略客户端 article/revision，不重新执行事实提取与写作。
- `/api/status` 新增 `guidance` 配置状态与 `official_products` 支持的型号名称；不返回指导目录绝对路径、全文或凭证。

正式 result/evidence 契约不变。sources 中的可选 url 保存官网来源，response.data_source.mode 为 official；writing_guidance 进入模型上下文但不冒充 evidence.facts，响应只暴露指导标题。原文仍按片段 ID 提取和回填引文，独立核验仍需实际图片输入。

## 团队共用场景生图

与图文证据契约独立，不改变 article/evidence。详细边界见 [QwenImage 配置](qwen-image.md)。

- `GET /api/images/status`：配置布尔状态、模型与地址、当前登录角色及首次设置是否可用；不返回 Key、密码或会话令牌。
- `POST /api/images/setup`：首次输入 `{admin_password, team_password, setup_token?}`，创建管理员并设置 HttpOnly Cookie。远程初始化需部署设置码。
- `POST /api/images/login`：`{role: "admin" | "member", password}`；`POST /api/images/logout` 清除当前会话。
- `POST /api/images/settings`：仅管理员输入 `{api_key, base_url, model}`；api_key 为空时保留既有 Key。保存不发起生图。`POST /api/images/clear` 清除 Key。
- `POST /api/images/generate`：已登录成员或管理员输入 `{prompt, size}`，生成 1 张，返回 `{status: "generated", kind: "ai_scene", asset_url, notice, model, note}`。未登录 401、权限不足 403、已有任务 409，服务异常给出可理解的错误，不回传原始服务响应。
- `GET /api/images/asset/<ref>`：已登录用户读取当前内存中的 PNG；引用过期返回 404，不接受客户端图片 URL 或本地路径。

新增接口仍受原有本机 Host、JSON 类型与来源校验约束；云端设置固定 WORKBENCH_PUBLIC_ORIGIN。现有反向代理标记外部请求，防止无初始化码的远程首次设置。服务器返回配置与图片时均禁止缓存。

## 团队共用文案与图片核验模型

详细用法与验证边界见 [文案模型配置](shared-text-model.md)。生图与文案模型分别选择，复用已保存的百炼 Key 和 Base URL。

- `GET /api/images/status` 新增 `text_model: {configured, model, key_source, vision_verified, models}`；`key_source` 标识共享百炼或原有环境配置，不返回 Key。
- `POST /api/images/text-model/settings`：仅管理员输入 `{model}`，保存支持的视觉模型；即刻生效，不调用模型。响应为 `{status: "saved", note}`；页面随后刷新配置状态。
- `POST /api/images/text-model/probe`：仅管理员输入 `{}`。发送服务端随机生成的 64×64 纯色 PNG，验证 JSON 输出和颜色答案；成功返回 `{status: "connected", model, image_input_tested: true, note}`，并更新 `vision_verified`。不读取知识库，会产生一次模型用量；不等于完成产品语义核验。
- 共享 Key 模式下，`POST /api/generate`、`POST /api/revise` 与 `POST /api/model/probe` 要求既有管理员或成员会话，未登录返回 401。管理员专用配置接口向成员返回 403。
- ima 和官网生成流程、`GET /api/status` 通过相同服务端模型工厂读取当前配置；保存无需重启。共享模型请求启用 JSON 输出并关闭思考模式。
- 配置只追加模型选择，不复制 Key；清除团队 Key 同时停用共享文案模型。更换 Key/地址后重置看图验证状态。未选择网站共享模式时保留原有 `LLM_*` 环境配置路径。

## 生成进度

- `POST /api/progress`：空对象，返回 `{progress_ref}`，只创建随机的临时进度引用，不调用资料库或模型。
- `POST /api/generate` 可附 `progress_ref`；一个引用仅能绑定一次生成。原有无进度引用的请求仍可使用。
- `GET /api/progress/<ref>`：返回 `{phase, completed, total: 4, status}`。phase 为 `sources/extract/write/review`，分别在实际读取、提取、创作与核验前更新；completed 为已跨过的阶段数。只有 ready 时为 4；其他终态不填满进度。
- status 为 `running/ready/needs_input/blocked/error`。生成异常同时标记进度失败；错误响应会区分核验声明文本定位、事实编号引用与格式错误，继续拒收无效核验结果。
- 已有有效草稿时，独立核验响应中的声明定位、编号或格式异常转换为 pending 检查，返回 blocked 草稿及 run_ref；正式 result.article 仍为 null，界面禁止最终稿复制/导出。核验服务调用失败也保留草稿，并且不自动重试。前置事实提取、资料读取或文案结构错误仍按原有错误流程处理。
- 核验模型只接收稿件已用事实及引文、已选图片和显式的 allowed_claim_fact_ids；保留原始 documents 核对条件与冲突。本地写作指导不进入核验上下文。核验声明引用仍必须属于允许集合，不能自动猜测或替换无效编号。
- 创作与重写调用同时附真实候选图片，标签绑定 image_id；不再仅凭图片名称写图注。原有 10MB 图片总量限制也适用于创作输入。重写从服务器原稿记录增加 previous_review_issues，保留事实边界。
- 创作与重写不再接收全量 documents，保留已提取事实、条件和对应引文，并增加 allowed_product_fact_ids；原文继续提供给独立复核，防止写作阶段从未提取的原文参数补写额外声明。
- 核验输入增加 required_image_ids 与 image_review_targets（image_id、caption）；模型可返回 image_checks: [{image_id, status, detail}]，服务端校验编号属于本次选图，转换为原有 image check。旧版 checks 中的 image 项继续支持，缺失或无效结果保持 pending，图注与画面不符仍 fail。
- 浏览器核验页将 fail、pending 置顶，pass 项折叠，并提供显式的修稿与只重核验两种操作。操作复用 /api/revise，没有自动改稿或自动付费重试。
- 进度仅含上述固定状态，不含任务文本、资料原文、模型响应或凭证。引用作为不可猜测的访问凭据；共享 Key 模式下创建和查询还要求团队登录。未知或过期引用查询返回 404，无效/重复绑定返回 400。
- 记录只保存在当前进程内，30 分钟过期，最多 64 项，优先回收终态；活跃记录满时拒绝新建。重启后不保留，不支持刷新后自动恢复任务。界面每 1.5 秒查询，网络异常明确显示无法获取进度；不据此自动重试生成。

操作与边界见 [创作进度说明](generation-progress.md)。
