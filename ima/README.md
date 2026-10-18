# B：ima 模块

在此接官方 Skill / OpenAPI，负责账号与共享库确认、检索、目录回退、原文读取、图片获取与来源记录。

提供 retrieve(task)，返回 retrieval；结构见 ../contracts/agent.schema.json。先查看官方返回再编写字段映射；凭证通过环境变量读取，不能写进代码或日志。

已提供 client.py 官方脚本桥接、错误分层、空搜索目录回退与配置自检。运行 python -m ima diagnose 不发请求；安装配置后 python -m ima probe 才会真实查找共享库并浏览目录。

首个里程碑仍是：取得一个精确型号的真实事实和图片并交给 A、C。当前未使用参赛账号实测，不包含官方 Skill 或知识库附件。详见 ../docs/ima-setup.md。
