# B：ima 模块

在此接官方 Skill / OpenAPI，负责账号与共享库确认、检索、目录回退、原文读取、图片获取与来源记录。

提供 retrieve(task)，返回 retrieval；结构见 ../contracts/agent.schema.json。先查看官方返回再编写字段映射；凭证通过环境变量读取，不能写进代码或日志。

已提供 client.py 官方脚本桥接、错误分层、空搜索目录回退与配置自检。运行 python -m ima diagnose 不发请求；安装配置后 python -m ima probe 才会真实查找共享库并浏览目录。

retrieval.py 已补充真实目录、原文、图片、本机资源预览与资料调用包，并已用参赛账号实际验证具体型号资料与图片。返回的是原始上下文，尚未自动提取或核验产品声明。不包含官方 Skill 或知识库附件。详见 ../docs/knowledge-retrieval.md。
