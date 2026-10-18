# 华为 PC 营销软文智能体

面向华为 PC 营销任务，完成「理解需求 → 制定平台策略 → 检索 ima 事实与图片 → 生成图文 → 核验 → 导出」的自研 Agent。

**当前状态：已有浏览器工作台、三平台演示、编辑与导出、结构检查，以及真实 ima 共享库连接和条目检索。尚未实现原文与真实图片获取、大模型生成和完整语义核验，不能作为已完成参赛作品提交。**

## 三人快速开始

```bash
git clone https://github.com/Pragues1226/huawei-pc-marketing-agent.git
cd huawei-pc-marketing-agent
```

按分工切换对应分支：

```bash
# A：场景、生成、提示词、核验
git switch feat/agent
# B：ima 接入、检索、事实与图片来源
git switch feat/ima
# C：页面、部署、合并与提交
git switch feat/app
```

每人只执行自己角色对应的一条切换命令。先读 [协作说明](CONTRIBUTING.md)、[接口约定](docs/interfaces.md) 和 [210 分钟任务表](docs/team-plan.md)。

## 最小交付范围

- 公众号、小红书、门店朋友圈三个平台。
- 学生开学购机、职场移动办公两个业务场景。
- 支持按型号检索；先验证至少两个具体型号，避免型号与系统版本混用。
- ima 提供产品事实、图片及来源；自研 Agent 负责策略、编排、生成和核验。
- 输出场景判断、知识库依据、图文软文、核验结果；支持修改及复制或导出。
- 信息不足时追问；未确认价格、补贴和产品参数不生成。

## 仓库结构

```text
agent/                  A：需求解析、策略、生成与核验
prompts/                A：系统提示词
ima/                    B：ima 调用与来源处理
app/                    C：交互页面
deploy/                 C：部署配置
contracts/              三方共同遵守的数据格式；修改由集成人确认
docs/                   分工、架构、验收和提交材料
.github/                PR 与任务模板
```

## 功能进度

- [x] ima 当前账号、指定共享库及目录可访问（本机账号已实测）
- [ ] 产品事实与图片真实检索，保留来源
- [x] 规则版任务准备与信息不足追问
- [ ] 三平台差异化策略与真实生成（规则演示已完成，模型生成待接入）
- [ ] 事实、型号、图片与合规核验
- [x] 演示草稿修改、重新检查与复制 / 导出
- [x] 浏览器工作台、最近任务、真实共享库连接与条目搜索
- [ ] 三组真实运行结果
- [ ] GitHub、魔搭、作品说明书可访问
- [ ] 复赛时补真实运行录屏

## 安装与运行

前置工具建议使用 Python 3.10 或更高版本；当前验证环境为 Windows / Python 3.13。在仓库根目录运行：

```bash
python -m pip install -r requirements.txt
python -m app
```

浏览器打开 http://127.0.0.1:8765 。Windows 可双击 start-workbench.cmd。使用步骤与能力边界见 [工作台说明](docs/workbench.md)。

前置工具与测试：

```bash
python -m agent demo
python -m agent prepare --task contracts/task.example.json
python -m ima diagnose
python -m unittest discover -s tests -v
```

demo 仅使用虚构开发数据，未调用 ima 或模型，也不包含真实产品图片。详见 [前置工具及检查边界](docs/preflight.md)。

ima 安装并配置好凭证后，按 [ima 接入步骤](docs/ima-setup.md) 运行 python -m ima probe，真实验证共享库连接。

当前工作台使用 Python 本地服务与静态页面，不需要前端构建依赖。C 后续按参赛部署环境补充公网部署方式；本机服务不能代替评审可访问的部署链接。

配置字段见 [.env.example](.env.example)。凭证仅在各自本机或部署平台配置，不能提交到仓库。

## 作品材料

- [架构与数据流](docs/architecture.md)
- [统一接口](docs/interfaces.md)
- [团队分工与时间表](docs/team-plan.md)
- [验收场景](docs/acceptance.md)
- [提交检查清单](docs/submission.md)
- [作品说明书底稿](docs/project-description.md)
- [前置工具](docs/preflight.md)
- [ima 安装与接入](docs/ima-setup.md)
- [本地内容工作台](docs/workbench.md)

本仓库只存放团队自研代码与说明。赛题 PDF、知识库 ZIP、共享库原文、真实凭证和未经授权的素材不随源码公开。
