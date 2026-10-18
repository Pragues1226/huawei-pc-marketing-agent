# ima 安装完成后的最短接入路径

接入层已在本机参赛账号上完成指定共享库访问、型号检索、目录浏览、产品资料原文和真实图片读取。生成与核验管线已经接通；自动测试使用模拟外部响应，仍需用当前参赛账号和正式模型保存真实完整结果。

## 本机准备

1. 安装并登录 ima；用同一账号加入举办方指定共享库，确认能查看原文。
2. 在 ima 官方接口页面获取 Client ID 和 API Key，只在自己本机配置，不发到聊天或仓库。
3. 下载官方 Skill 并完整解压。仓库不重新分发官方包。
4. 安装 Node.js 18 或更高版本；Python 侧只负责调用脚本和处理结果。
5. 将根目录 .env.example 复制为 .env，填写凭证，并将 IMA_SKILL_SCRIPT 设置为已解压的 ima_api.cjs 绝对路径。环境中已有值优先于 .env。

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

已完成：从原文提取带逐字引句的事实、模型生成、结构与语义核验、证据不足和资料警告阻断。待完成：真实账号全流程验收、资料冲突样例验证与三组参赛结果留存。接入层只读取本机配置的凭证，不会自行上传或修改共享库。
