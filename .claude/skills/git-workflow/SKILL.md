---
name: git-workflow
description: Drive a change through this repository's GitHub process — create the issue, branch, commits and pull request with the required naming. Use whenever asked to open an issue, name a branch, write a commit message, open a pull request, or merge in this repo, and before starting any code change that will be committed here.
---

# Git 与 GitHub 协作流程

完整规范见 [docs/development/git-workflow.md](../../../docs/development/git-workflow.md)，本文件是可直接执行的操作步骤。规模约束以 `AGENT.md` 为准。

本流程与任何计划编号无关：Issue、分支、Commit 和 PR 里都不写 Release / Epic / Feature / Task 编号。需要关联计划时写在 Issue 正文的 Notes 里，或用 Milestone 表达。

## 命名速查

| 对象 | 格式 | 示例 |
|---|---|---|
| Issue | `[<Type>] <Imperative English summary>` | `[Feature] Add work item state machine` |
| 分支 | `<type>/<issue-number>-<slug>` | `feat/12-work-item-state-machine` |
| Commit | `<type>(<scope>): <subject>` | `feat(scrum-domain): add work item state machine` |
| PR 标题 | 同 commit 格式 | `feat(scrum-domain): add work item state machine` |

类型词表（Issue 前缀 ↔ 分支/commit type）：`[Feature]`/`feat`、`[Fix]`/`fix`、`[Docs]`/`docs`、`[Refactor]`/`refactor`、`[Test]`/`test`、`[CI]`/`ci`、`[Chore]`/`chore`、`[Spike]`/`spike`。`perf`、`build`、`revert` 只用作 commit type。

Commit scope 取包名，例如 `scrum-domain`、`scrum-application`、`scrum-api-contract`、`scrum-ui`、`scrum-harness-host`、`scrum-harness-client`、`scrum-agent-tools`、`adapter-storage-workspace-files`、`adapter-remote-api`、`edition-community`；跨包或仓库级用 `repo`、`docs`、`ci`。

Issue、分支、Commit、PR 一律英文；文档正文中文。

## 执行步骤

### 1. 确认范围

确认这次变更可以独立评审、测试和回滚。做不到就先拆分，一个 Issue 只对应一个 PR。需要产品或架构决策才能继续时，停下来向用户说明，不擅自扩大范围。

### 2. 建立或认领 Issue

```bash
gh issue list --label type:feature --label area:core   # 先查是否已存在
gh issue create --template feature.yml                 # 交互式，前缀与标签自动预填
gh issue edit <number> --add-assignee @me
```

非交互创建时，正文必须包含模板的全部必填字段：Goal、Non-goals、Acceptance criteria、Tasks 勾选清单（每项一个 commit）、Dependencies。标签规则：一个 `type:*` + 至少一个 `area:*`；已排入某次发布的绑定对应 Milestone。

### 3. 建立分支

```bash
git switch main && git pull --ff-only
git switch -c <type>/<issue-number>-<slug>
```

slug 为小写英文 kebab-case，最多 5 个词，不重复类型和编号。

### 4. 按 Tasks 逐步提交

Issue 的 Tasks 清单每一项一个 commit。提交前跑该范围的 lint、类型检查和测试，并核对规模：

```bash
git diff --numstat HEAD^ HEAD | awk '{a+=$1+$2} END {print a}'   # 手写代码需 ≤ 500
```

Commit 消息：英文祈使句 subject（全小写、≤72 字符、无句号），body 说明 what/why，footer 只用 `Refs #12` 和必要的 `BREAKING CHANGE:`。commit 消息里不写 `Closes` / `Fixes`。

提交后勾选 Issue 中对应条目。

### 5. 开 PR

```bash
git push -u origin <branch>
gh pr create --base main --fill    # 仅当只有一个 commit
gh pr create --base main           # 多 commit：手写标题，正文按 .github/pull_request_template.md 填写
gh pr create --base main --draft   # 工作未完成
```

PR 正文必填：`Closes #N`、Goal/Non-goals、Changes、Test evidence（真实执行过的命令与输出）、Compatibility impact、Data migration impact、Rollback plan、Contract/Schema versioning。

### 6. 合并与收尾

```bash
gh pr checks
gh pr merge --merge --delete-branch
git switch main && git pull --ff-only
```

确认 Issue 已被 `Closes` 自动关闭，检查被它阻塞的 Issue 能否摘掉 `status:blocked`，然后回到第 1 步。

## 硬性禁止

- 不直接向 `main` push，不在 `main` 上直接提交。
- 不用 squash merge 或 rebase merge——会抹平 PR 内的提交历史，并可能产生超过 500 行的 commit。
- commit 消息里不写 `Closes` / `Fixes`，关闭关键字只写在 PR 正文。
- Issue、分支、commit 和 PR 里不写计划编号（`R-`、`E-`、`F-`、`T-` 之类），追溯靠 `Refs #<issue>`。
- 不把 `main` merge 回工作分支，同步用 `git rebase origin/main`。
- 已推送的分支只用 `--force-with-lease`，不用 `--force`。
- 不用 `fix review comment` 这类无意义 commit，改用 `git commit --fixup` + `git rebase --autosquash`。
- 不用无语义的切片 commit 规避 500 行限制；预计超限的步骤在编码前继续拆分。
- Test evidence 不写「本地已测试」，必须粘贴真实命令与输出。
- Issue、Commit、PR 和代码注释中不写任何 AI 工具署名、生成声明或推广链接（含 `Co-Authored-By: Claude ...` 与 `Generated with ...` 之类的 footer），见 `CLAUDE.md` 的 Identity Rules。
