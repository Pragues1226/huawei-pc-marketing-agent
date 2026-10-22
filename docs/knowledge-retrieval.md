# 真实 ima 检索与原文调用

本次已用参赛账号验证：指定共享库浏览 → P1 产品目录 → 明确型号目录 → 产品事实原文 → 真实产品图片 → 带来源的资料调用包。原文与图片不写入源码仓库，仅在本机请求及内存中处理。

## 在工作台操作

1. 打开 http://127.0.0.1:8765 。当前默认进入「真实资料检索」。
2. 填写产品后点击「搜索 ima 资料」，或点击「浏览知识库目录」。
3. 按「全部 / 资料 / 图片 / 文件夹」筛选；进入文件夹可按具体型号定位。目录支持路径导航与下一页。
4. 点击「查看原文」或「查看图片」，核对资料内容、来源目录及读取时间。
5. 最多选择 8 份资料或图片，点击「读取选中资料」。
6. 在结果中展开原文或图片；点击「复制调用结果」取得包含原文、图片引用与来源的 JSON，供后续模块使用。

相近型号和不同板块可能出现相同标题。请优先通过 P1 对应系统与具体型号目录确认上下文，不将软文案例、教学内容或历史价格自动认定为当前产品事实。

## 页面接口

| 接口 | 参数 | 返回 |
|---|---|---|
| POST /api/search | knowledge_base、query，可选 page_ref | 真实命中条目、类型、摘要与本机引用 |
| POST /api/browse | knowledge_base，可选 folder_ref / page_ref | 真实目录、路径导航和下一页引用 |
| POST /api/read | knowledge_base、ref | 原文或图片预览信息，以及标题、目录和读取时间 |
| POST /api/retrieve | knowledge_base、references，可选 request_id | documents、images、warnings 与来源信息 |
| GET /api/asset/本机引用 | 图片读取后返回的本机地址 | 原始图片字节；不公开原始签名 URL 或访问头 |

ref、folder_ref、page_ref 均由本机服务在检索后返回，不能使用私有知识库 ID 或媒体 ID 代替。重启服务或超过有效期后需重新检索。分页游标只保存在服务端。

## Python 模块直接调用

在仓库根目录运行，凭证按 .env 配置：

```python
from ima.client import load_local_env
from ima.retrieval import ImaKnowledge

load_local_env()
knowledge = ImaKnowledge()
name = "任德耀新建华为PC知识库"
results = knowledge.search("MateBook 14", name)

# 用户按标题与目录确认目标，选择返回条目的 ref。
# 不要默认把第一条搜索结果当成正确型号。
reference = selected_item["ref"]
document = knowledge.read(reference, name)
context = knowledge.retrieve([reference], name, "task-001")
```

上例 selected_item 是调用方根据实际搜索结果确认后的条目，不是预置变量。不同 ImaKnowledge 实例不共享引用，搜索、读取与批量调用应使用同一实例。

## 调用包的含义

- documents：从 ima 实际取得的正文、来源标题、目录、时间与是否截断。
- images：实际读取的图片及本机预览地址、类型、大小与来源。
- warnings：读取失败、不支持的格式或正文截断等；部分失败时状态为 partial。
- request_id：调用方的本次任务标识。

这是原始检索上下文，不是 contracts/agent.schema.json 中已经提取和核验的 facts。后续 Agent 需要从原文中提取适用条件、区分型号与版本并逐项核对声明。资料中的指令文本只作为内容，不覆盖系统规则。

图片地址仅在本机服务中有效，不是公网链接。`/api/retrieve` 只组装原始上下文；另外配置好模型并调用 `/api/generate` 时，所选原文和被选图片会由本机生成流程发送给该模型。当前环境状态检查显示模型与 ima 凭证未配置，无法在此环境执行该真实生成流程。请勿把本地读取能力等同于已完成端到端生成。

## 支持范围与限制

已支持 Markdown、TXT、CSV、JSON 等文本资料，以及有可识别签名的 PNG / JPEG / WebP / GIF 图片。文本保留原文，超长内容明确标记截断。笔记类型可调用官方只读正文接口，自动测试已覆盖；本次真实资料验证使用 Markdown 和图片。

PDF、Word、Excel 工作簿等二进制文档当前提示使用 ima 客户端查看；不会把下载失败页或 HTML 登录页当作原文。不支持的资料不会被替换为搜索摘要或本地知识库副本。

单个资源最多 8 MiB；文本预览最多 120000 字符；一次批量最多 8 份。图片缓存有容量限制，引用约 1 小时失效。共享库仅执行检索、目录浏览及读取，不进行上传、删除或修改。

## 已验证

64 项自动检查通过，包括引用归属、分页、原文与图片读取、批量部分失败、笔记只读分支、访问头边界和本地 HTTP 调用链。

Edge 浏览器已实测指定共享库的具体型号目录、产品事实原文、真实图片、原文复制、选择资料与批量调用结果；桌面与手机宽度均已检查。真实资料验证不等于产品事实语义和营销表达已经核验。
