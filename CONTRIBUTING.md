# 三人协作

## 成员和角色

仓库拥有者：`Pragues1226`。协作者：`YGBDCF`、`liicang87-lgtm`。A/B/C 由三人自行认领，GitHub 用户名不预先绑定角色。

| 角色 | 分支 | 主要修改目录 |
|---|---|---|
| A：Agent | feat/agent | agent/、prompts/ |
| B：ima | feat/ima | ima/ |
| C：界面与集成 | feat/app | app/、deploy/、README.md |

`main` 保存已整合版本；C 负责合并。初始化的三条分支内容一致，后续每人只在自己的分支提交。

## 日常提交

```bash
git status
git add agent prompts
git diff --cached
git commit -m "feat: add scenario strategy"
git push -u origin feat/agent
```

以上是 A 的示例。B 和 C 换成各自目录及分支。提交前检查暂存内容，不执行无差别添加附件的操作。首次提交如提示缺少身份，请设置自己的姓名和 GitHub 邮箱。

## 合并与同步

1. 有一段可运行功能就发 Pull Request 到 main，写清变更、验证和仍缺内容。
2. C 检查接口与凭证后合并；不要等到截止前同时交三大包代码。
3. main 更新后，先提交自己的改动，再同步：

```bash
git fetch origin
git merge origin/main
```

4. 不强制推送，不改他人分支；发现冲突先沟通文件负责人。

## 前 15 分钟必须确定

- A/B/C 各由谁负责。
- 共用运行环境、模型服务和应用框架。
- contracts/agent.schema.json 是否满足实际接入。
- C 用什么方式集成各模块并部署。
- 每 30 分钟报一次：已完成、卡点、下一步；卡点持续 10 分钟就说明。

邀请加入私有仓库后，队友需先接受 GitHub 邀请才能克隆。提交前检查评审访问权限，切换公开前再次检查整个 Git 历史有无凭证或受限资料。
