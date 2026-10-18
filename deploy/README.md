# 魔搭 Docker 部署

本地运行仍默认监听 `127.0.0.1:8765`。仓库根目录的 `Dockerfile` 供魔搭 Docker 创空间直接构建；容器使用 `WORKBENCH_HOST=0.0.0.0` 和 `WORKBENCH_PORT=7860`，空间端口也设为 `7860`。本机可从仓库根目录运行 `docker build -t huawei-pc-agent .`。魔搭 Docker 创空间需要账号事先完成阿里云绑定和实名认证；若创建时无法选择 Docker，先检查这项平台前置条件。

必须在魔搭空间的**私密环境变量**中配置：

| 变量 | 用途 |
|---|---|
| `WORKBENCH_PUBLIC_ORIGIN` | 应用独立访问域名的精确 HTTPS 来源，例如空间名为 `huawei-pc-agent`、账号为 `Jewesdrew` 时可先核对 `https://jewesdrew-huawei-pc-agent.ms.show`；以魔搭实际显示的 host 地址为准。只写协议和域名，不要带路径或末尾 `/`。不要填 `https://modelscope.cn/studios/...` 页面链接。 |
| `IMA_OPENAPI_CLIENTID`、`IMA_OPENAPI_APIKEY` | 已加入指定共享知识库的同一 ima 账号凭证。 |
| `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` | 兼容 OpenAI Chat Completions 的模型服务。 |

可选变量为 `IMA_KNOWLEDGE_BASE_ID` 和 `LLM_REASONING_EFFORT`。不要上传 `.env`、赛题资料、知识库原文或带密钥的截图。Docker 构建时下载手册指定版本的公开官方 ima Skill，并安装 Node.js；镜像中不含账号凭证。

`WORKBENCH_PUBLIC_ORIGIN` 未设置时，公开域名请求会被拒绝。本机模式仍校验 Host；公开模式兼容魔搭代理转发的内部 Host，写请求必须带匹配的浏览器 Origin 和 JSON 内容类型。部署后先在无登录浏览器中打开魔搭空间及应用独立地址，确认页面和 `/health` 可访问，再用真实账号完成一组任务并核对来源。公开空间的访问者会使用该空间配置的 ima 与模型额度，应按比赛需要设置平台访问范围和额度。
