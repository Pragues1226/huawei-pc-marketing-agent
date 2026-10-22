# ima 安装完成后的最短接入路径

接入层已有指定共享库访问、型号检索、目录浏览、产品资料原文和真实图片读取的代码；`agent.pipeline` 也实现了原文事实提取、模型生成、独立声明/图片核验与重写流程。本机当前 `/api/status` 显示 ima 和模型凭证未配置，因此尚未完成当前环境的真实端到端复核。模型核验不能证明完整无误，发布前仍需人工检查。

## 本机准备

1. 安装并登录 ima；用同一账号加入举办方指定共享库，确认能查看原文。
2. 在 [ima 官方接口页](https://ima.qq.com/agent-interface) 创建或查看 Client ID 和 API Key。项目需要这两项才能访问共享库。
3. 安装 Node.js 18 或更高版本；Python 侧只负责调用脚本和处理结果。
4. 将根目录 `.env.example` 复制为 `.env`，填入下面的配置。Windows 可在仓库根目录运行 `notepad .env` 编辑；已有的用户级环境变量会优先于 `.env`。

```dotenv
IMA_OPENAPI_CLIENTID=你的 ima Client ID
IMA_OPENAPI_APIKEY=你的 ima API Key
IMA_SKILL_SCRIPT=C:/绝对路径/ima-skill/ima_api.cjs
LLM_API_KEY=你的模型服务 API Key
LLM_BASE_URL=https://服务商提供的兼容接口基础地址
LLM_MODEL=服务商控制台中的模型 ID
LLM_JSON_MODE=false
```

本机 `.env` 已写入已安装官方技能包的路径；技能包版本为 1.1.10。若换电脑或官方脚本目录改变，只需更新 `IMA_SKILL_SCRIPT`。ima 密钥和模型密钥都只填在本机 `.env`，不要贴到聊天、截图或提交到 Git。

`LLM_BASE_URL` 应是服务商的 HTTPS OpenAI Chat Completions 兼容地址；程序会在基础地址后拼接 `/chat/completions`。图片核验时会发送图片，因此模型服务还必须支持图像输入。模型 ID 必须与服务商控制台一致。

DeepSeek 官方 API 当前将 V4.1 Flash（1017）映射为模型 ID `deepseek-flash`，OpenAI 兼容基础地址为 `https://api.deepseek.com`；该模型支持视觉输入。DeepSeek 支持 JSON 输出模式，本机配置启用 `LLM_JSON_MODE=true`，以匹配 Agent 的结构化生成和核验响应。参考 [DeepSeek 首次 API 调用](https://api-docs.deepseek.com/guides/search_fetch)、[视觉输入说明](https://api-docs.deepseek.com/guides/vision/) 和 [JSON 输出说明](https://api-docs.deepseek.com/guides/json_mode/)。连接页的“测试图文模型连接”会发送不含任务资料的最小 JSON 探针；只有状态页显示配置齐全后才可运行。

5. 修改 `.env` 后重启工作台，在“知识库连接”页刷新配置状态。先运行 `python -m ima diagnose` 检查凭证是否就绪，再运行 `python -m ima probe` 实际确认共享库权限。

参考入口来自赛题指定渠道：

- 接口凭证页面：https://ima.qq.com/agent-interface
- 指定版本 Skill 包：https://app-dl.ima.qq.com/skills/ima-skills-1.1.10.zip

这不是最新版声明。接入层按本次下载的 1.1.10 脚本与接口参考准备；若官方脚本提示更新，先核对官方更新说明。

## 两步验证

在仓库根目录运行：

```bash
python -m ima diagnose
python -m ima probe
```

diagnose 不发送请求，仅报告 Node、脚本和凭证是否就绪，不输出真实值。probe 真实查找指定名称共享库并浏览首屏目录；它不等于产品事实和图片已检索成功。知识库名称不同可传 --kb-name。

probe 只显示库名、首屏数量与是否有后续页，不展示私有知识库 ID 或内容。若结果有同名库而无法唯一选择，会停止并提示确认，不默认取第一项。

## 供 B 使用的接入层

- ImaClient.search_bases(query)：搜索知识库，可传 cursor。
- normalize_base(entry)：兼容 kb_id/kb_name 与 id/name 两种字段。
- ImaClient.search_or_browse(kb_id, query, folder_id=None)：搜索结果为空时，浏览目录回退；最多检查 5 页，支持调整上限。
- ImaClient.list_entries(kb_id, cursor="", folder_id=None)：进入目录、翻页。
- ImaClient.media_info(media_id)：获取媒体信息；仍需解析实际原文与图片。

基础 client 的目录回退只提供定位入口；新增 ImaKnowledge 可按结果引用继续浏览、读取原文与图片、批量取回资料。见 [真实检索与原文调用](knowledge-retrieval.md)。get_media_info 返回的请求头和临时签名链接只在服务端用于读取，不返回页面或上传仓库。

## 已处理与待完成

已处理：无 shell 的参数传递、中文请求、凭证仅通过环境传入、官方主机限制、超时、脚本错误、更新提示、业务错误、字段归一化、有限分页和空搜索目录回退。

已实测：指定共享库查找、首屏目录访问和 MateBook 14 关键词条目搜索。当前账号可访问不代表其他队友账号自动获得权限。

已补充并实测：产品资料 Markdown 原文、真实图片、本机预览与选中资料调用包。

待完成：在已配置凭证的环境中完成真实端到端联调，记录资料冲突与模型核验结果，并保留三组复赛运行材料。接入层只读取本机配置的 ima 凭证，不会自行上传或修改共享库；生成流程会将用户选择的原文和图片传给其配置的模型服务。
