# Git 与 GitHub 协作规范

本文定义仓库在 GitHub 上的协作流程：Issue、分支、Commit 和 Pull Request 的命名、内容与生命周期。规模约束（单 commit 500 行口径）以仓库根目录 `AGENT.md` 为权威来源。

本文是通用规范，不依赖任何具体的实施计划或编号体系。项目管理层面的拆分（路线、里程碑、工作项编号）由计划文档自行定义，并负责说明它如何落到本文的 Issue 与 PR 上；本文不引用这些编号。

人和编码 Agent 遵守同一套规则。

## 1. 协作模型

一次变更在 GitHub 上的对象关系：

| 对象 | 粒度 | 说明 |
|---|---|---|
| Issue | 一个可独立评审、测试和回滚的变更 | 描述目标、范围和验收条件，是讨论与追踪的入口 |
| 分支 | 一个 Issue 一个分支 | 短期存在，合入后立即删除 |
| Commit | 一个可验证意图 | 通过该范围适用的 lint、类型检查和测试 |
| Pull Request | 一个 Issue 一个 PR | 合入 `main` 的唯一途径，携带完整的评审与验证信息 |
| Milestone | 一个发布 | 用于聚合面向同一次发布的 Issue 与 PR |

分支模型：

- `main` 是唯一长期分支，始终可构建、可安装、可回滚。
- 所有变更通过 PR 合入 `main`，禁止直接向 `main` push。
- 工作分支是短期分支，合入后立即删除。
- 不使用 `develop`、`release/*` 或长期维护分支；发布通过 tag 和 Milestone 表达。

语言：Issue、分支名、Commit 消息和 PR 一律使用英文；规范与设计文档正文使用中文。这与 `AGENT.md` 中「产品界面文案使用中文；代码、类型和代码注释使用英文」的分工一致——Git 元数据属于面向开发者的工程产物。

## 2. 类型词表

Issue 前缀、分支前缀和 commit type 使用同一套类型，三者必须一致：

| Issue 前缀 | 分支 / Commit type | 用途 |
|---|---|---|
| `[Feature]` | `feat` | 新增用户可见能力、公共 Contract 或 Agent Tool |
| `[Fix]` | `fix` | 修复缺陷 |
| `[Docs]` | `docs` | 只改文档 |
| `[Refactor]` | `refactor` | 不改变外部行为的结构调整 |
| `[Test]` | `test` | 只增改测试 |
| `[CI]` | `ci` | CI 配置与流水线 |
| `[Chore]` | `chore` | 依赖、脚本、构建配置和其他杂项 |
| `[Spike]` | `spike` | 限时调研；产出结论文档或一次性原型 |

补充说明：

- `perf`、`build`、`revert` 只作为 commit type 使用，没有对应的 Issue 前缀。
- `[Spike]` 的分支用 `spike/`，但其 commit 按实际产物取 type，通常是 `docs`。
- 一个 Issue 只有一个类型前缀；需要跨类型才能说清楚的工作说明拆分不合理，应继续拆分。

## 3. Issue 规范

### 3.1 建立粒度

- 一个 Issue 对应一次可独立评审、测试和回滚的变更，也就是一个 PR。
- 变更内部的步骤不单独建 Issue，写成 Issue 正文的 Tasks 勾选清单。
- 步骤需要独立评审或被其他工作阻塞时，才拆成独立的前置 Issue。
- 缺陷、文档问题和杂项随时建 Issue，不需要事先进入任何计划。

### 3.2 标题

格式：

```text
[<Type>] <Imperative English summary>
```

- 方括号前缀取自第 2 节类型词表，大小写固定。
- 摘要用英文祈使句、首字母大写、不加句号，控制在 72 字符以内。
- 标题描述结果，不描述过程，也不放编号或代号。

| 合法 | 非法 | 原因 |
|---|---|---|
| `[Feature] Add work item state machine` | `[feature] add work item state machine` | 前缀大小写错误 |
| `[Docs] Add Git and GitHub collaboration guideline` | `添加 Git 协作规范` | 缺前缀且未使用英文 |
| `[Chore] Initialize pnpm workspace` | `[Chore] Init` | 标题应说明具体结果 |
| `[Fix] Reject workspace write on revision conflict` | `[Fix] Bug in storage` | 描述不具体 |

### 3.3 正文

使用 `.github/ISSUE_TEMPLATE/` 中的模板，必填字段：

| 字段 | 内容 |
|---|---|
| Goal | 这次变更要达成的结果 |
| Non-goals | 明确不做的事，防止范围蔓延 |
| Acceptance criteria | 可验证的验收条件，逐条可勾选 |
| Tasks | 实现步骤的勾选清单，每项对应一个 commit |
| Dependencies | 阻塞它的 Issue 编号，或 `None` |

Tasks 清单示例：

```markdown
- [ ] Set up root package.json, pnpm workspace and shared tsconfig
- [ ] Create minimal package layout and unified build/typecheck/test/lint scripts
- [ ] Add CI for clean install, typecheck, test and build
```

需要把 Issue 关联到某个计划条目时，写在正文的 Notes 字段里或用 Milestone 表达，不写进标题，也不作为必填项。

### 3.4 标签与里程碑

- 必须有且只有一个 `type:*` 标签，与标题前缀一致。
- 必须至少有一个 `area:*` 标签。
- 已排入某次发布的 Issue 绑定对应 Milestone；尚未排期的可以不绑定。
- 被其他 Issue 阻塞时加 `status:blocked`，并在 Dependencies 中写明阻塞来源；解除后立刻移除。
- 需要产品或架构决策才能继续时加 `status:needs-decision`。

标签清单见第 7 节。

### 3.5 生命周期

1. 在动手前建立 Issue，不批量预建大量暂时不做的 Issue。
2. 开始实现时自我指派：`gh issue edit <number> --add-assignee @me`。
3. 实现过程中勾选 Tasks；范围变化写进评论并同步修改 Non-goals。
4. Issue 由 PR 正文的 `Closes #N` 自动关闭，不手动关闭。
5. 决定不做时，写明原因后关闭为 `not planned`，不留空关。

## 4. 分支规范

### 4.1 命名

格式：

```text
<type>/<issue-number>-<slug>
```

- `type` 取第 2 节类型词表。
- `issue-number` 是 GitHub Issue 编号，不带 `#`。
- `slug` 是小写英文 kebab-case，最多 5 个词，概括工作内容，不重复编号和类型。

| 合法 | 非法 | 原因 |
|---|---|---|
| `feat/12-work-item-state-machine` | `feature/12-work-item-state-machine` | type 应与 commit type 一致 |
| `docs/7-git-workflow-guideline` | `docs/git-workflow-guideline` | 缺 Issue 编号 |
| `chore/3-init-pnpm-workspace` | `chore/3-step-1` | slug 应为可读英文描述 |
| `fix/21-revision-conflict-write` | `yongli/fix-bug` | 不使用个人前缀 |

### 4.2 使用规则

- 一个分支只服务一个 Issue，也只产生一个 PR。
- 从最新的 `main` 切出：`git switch main && git pull --ff-only && git switch -c <branch>`。
- 与 `main` 同步使用 `git rebase origin/main`，不把 `main` merge 回工作分支，保持 PR diff 干净。
- 分支已推送并进入评审后，rebase 需要 `git push --force-with-lease`，禁止 `--force`。
- PR 合入后删除本地与远端分支。
- 不复用已合入的分支名。

## 5. Commit 规范

### 5.1 格式

遵循 Conventional Commits：

```text
<type>(<scope>): <subject>

<body>

<footer>
```

示例：

```text
feat(scrum-domain): add work item state machine

Model the allowed transitions between Todo, In Progress, Blocked and
Done, and reject transitions that skip required states. Keep the rules
free of storage and Harness dependencies.

Refs #12
```

### 5.2 字段规则

| 字段 | 规则 |
|---|---|
| type | 第 2 节词表，另加 commit 专用的 `perf`、`build`、`revert` |
| scope | 受影响的包名；跨包或仓库级用 `repo`、`docs`、`ci`。可省略，但同一 PR 内风格保持一致 |
| subject | 英文祈使句、全小写开头、不超过 72 字符、结尾无句号 |
| body | 说明「做了什么、为什么」，按 72 列换行；仅当变更显而易见时可省略 |
| footer | `Refs #12` 关联 Issue；破坏性变更用 `BREAKING CHANGE:`；真人共同作者用 `Co-Authored-By:` |

常用 scope 取包目录名，见[系统架构](architecture.md)的推荐目录，例如 `scrum-domain`、`scrum-application`、`scrum-api-contract`、`scrum-ui`、`scrum-harness-host`、`scrum-harness-client`、`scrum-agent-tools`、`scrum-harness-bundle`、`adapter-storage-workspace-files`、`edition-community`、`scrum-server`。

### 5.3 约束

- **关闭关键字 `Closes` / `Fixes` 只写在 PR 正文，不写在 commit 消息里**。commit 会被 rebase、cherry-pick 或 revert，写在 commit 里会导致 Issue 在预期之外被关闭。
- 每个 commit 只表达一个可验证意图，并通过该范围适用的 lint、类型检查和测试。
- 单个 commit 的手写代码变更不得超过 500 行，口径与豁免项见 `AGENT.md` 的「Git 与 GitHub 协作」一节。
- 预计超限的步骤在编码前继续拆分；禁止事后用无语义的切片 commit 规避限制。
- 修复本 PR 内评审意见时，优先 `git commit --fixup` 加 `git rebase --autosquash`，不留 `fix review comment` 这类无意义 commit。
- Issue、Commit、PR 和代码注释中不得出现任何 AI 工具署名、生成声明或推广链接，`Co-Authored-By` 只用于真人共同作者，详见 `CLAUDE.md` 的 Identity Rules。
- commit 消息不写计划编号；追溯靠 `Refs #<issue>`，由 Issue 承载计划信息。

### 5.4 历史迁移

`3091819` 及更早的 9 条 commit 使用「英文 type + 中文描述」，历史不做改写。本规范自合入之日起对新 commit 生效。

## 6. Pull Request 规范

### 6.1 标题

PR 标题使用与 commit 相同的 Conventional Commits 形式，不使用 Issue 的方括号形式：

```text
feat(scrum-domain): add work item state machine
```

三者的对照关系：

| 对象 | 形式 | 示例 |
|---|---|---|
| Issue | `[<Type>] <Imperative summary>` | `[Feature] Add work item state machine` |
| 分支 | `<type>/<issue>-<slug>` | `feat/12-work-item-state-machine` |
| Commit / PR | `<type>(<scope>): <subject>` | `feat(scrum-domain): add work item state machine` |

只有一个 commit 的 PR，标题与该 commit 的 subject 保持一致。

### 6.2 正文

使用 `.github/pull_request_template.md`，必填字段：

| 字段 | 内容 |
|---|---|
| Closes | `Closes #12`；关联但不关闭的写 `Refs #13` |
| Goal / Non-goals | 与 Issue 一致，若实现中收窄了范围要写明 |
| Changes | 按包或模块列出实际改动 |
| Test evidence | 实际执行的命令与结果，粘贴关键输出，不写「本地已测试」 |
| Compatibility impact | 对 Harness 版本、公共 Contract、Edition 组合的影响，或 `None` |
| Data migration impact | 对 `.scrum/` 文件格式、`schemaVersion` 的影响与迁移方式，或 `None` |
| Rollback plan | 如何回滚，是否需要额外数据处理 |
| Contract / Schema versioning | 新增公共 Contract、Schema 或持久化格式时必填版本策略，否则填 `N/A` |
| Checklist | 见模板 |

PR 正文不要求填写计划编号。需要关联计划时，通过 `Closes #<issue>` 指向的 Issue 承载，或用 Milestone 表达。

### 6.3 评审与合并

- 尚未完成的工作开 Draft PR，不请求评审。
- 请求评审前先自我评审整个 diff，并确认 CI 全绿。
- 合入前必须：CI 通过、Issue 中的 Tasks 全部勾选、Test evidence 已填写。
- **合并策略只允许 merge commit（`gh pr merge --merge`）**，仓库设置中禁用 squash merge 和 rebase merge。原因：
  - PR 内逐步提交的历史是可追溯性的基础，squash 会把它抹平。
  - squash 会把一个 PR 的多个 commit 压成一条可能远超 500 行的 commit，直接违反 `AGENT.md` 的规模约束。
  - merge commit 使整个变更可以用 `git revert -m 1 <merge-commit>` 一次性回滚，满足「PR 必须可独立回滚」。
- 合入后：删除远端分支、确认 Issue 已自动关闭、检查是否有被它阻塞的 Issue 可以摘掉 `status:blocked`。

### 6.4 回滚

回滚已合入的变更时新建一个 PR，commit 使用 `revert` type，正文写明回滚原因与后续计划，并重开对应 Issue，不直接改写 `main` 历史。

## 7. 标签与里程碑

本节是标签集的唯一来源。需要调整标签时先改本节，再执行 7.3 的命令，不在网页上凭记忆手工增删。

### 7.1 标签

| 标签 | 用途 |
|---|---|
| `type:feature` `type:fix` `type:docs` `type:refactor` `type:test` `type:ci` `type:chore` `type:spike` | 与 Issue 标题前缀一一对应 |
| `area:core` | `packages/core/`：Domain 与 Application |
| `area:api` | `packages/api/`：API Contract |
| `area:ui` | `packages/ui/`：Scrum UI |
| `area:harness` | `packages/harness/`：Host、Client、Agent Tools、Bundle |
| `area:server` | `packages/server/` 与 `apps/scrum-server` |
| `area:adapters` | `packages/adapters/`：Storage、Identity、Sync、Audit、Notification |
| `area:editions` | `packages/editions/`：Community、Teams、Enterprise 组合 |
| `area:docs` | `docs/` 与仓库根文档 |
| `area:repo` | 工作区配置、脚本、CI 和发布流程 |
| `status:blocked` | 被其他 Issue 阻塞 |
| `status:needs-decision` | 等待产品或架构决策 |

`area:*` 跟随[系统架构](architecture.md)的目录划分，目录调整时同步更新。保留 GitHub 默认标签中的 `good first issue` 和 `accessibility`，其余默认标签不使用。

### 7.2 里程碑

- 一个 Milestone 对应一次发布，用来聚合面向该次发布的 Issue 与 PR。
- Milestone 的名称、范围和退出条件由发布计划决定，本规范不规定具体名称。
- 只为当前承诺范围内的发布建立 Milestone，方向性的远期计划不提前建立。
- 发布完成后关闭 Milestone，未完成的 Issue 显式移到下一个 Milestone 或摘掉 Milestone。

### 7.3 初始化命令

以下命令与 7.1 的表格一一对应，可整段复制执行。`gh label create --force` 是幂等的，重复执行只会更新颜色和描述。

```bash
# 标签
gh label create type:feature  --color 1d76db --description "New user-visible capability, Contract or Agent Tool" --force
gh label create type:fix      --color d73a4a --description "Defect fix" --force
gh label create type:docs     --color 0075ca --description "Documentation only" --force
gh label create type:refactor --color 5319e7 --description "Restructuring without behaviour change" --force
gh label create type:test     --color 0e8a16 --description "Test coverage only" --force
gh label create type:ci       --color fbca04 --description "CI configuration and pipelines" --force
gh label create type:chore    --color cfd3d7 --description "Dependencies, scripts, build configuration" --force
gh label create type:spike    --color d4c5f9 --description "Time-boxed investigation" --force

gh label create area:core     --color bfd4f2 --description "packages/core: domain and application" --force
gh label create area:api      --color bfd4f2 --description "packages/api: API contract" --force
gh label create area:ui       --color bfd4f2 --description "packages/ui: Scrum UI" --force
gh label create area:harness  --color bfd4f2 --description "packages/harness: host, client, agent tools, bundle" --force
gh label create area:server   --color bfd4f2 --description "packages/server and apps/scrum-server" --force
gh label create area:adapters --color bfd4f2 --description "packages/adapters: storage, identity, sync, audit, notification" --force
gh label create area:editions --color bfd4f2 --description "packages/editions: Community, Teams, Enterprise composition" --force
gh label create area:docs     --color bfd4f2 --description "docs/ and root documentation" --force
gh label create area:repo     --color bfd4f2 --description "Workspace configuration, scripts, CI and release process" --force

gh label create status:blocked        --color b60205 --description "Blocked by another issue" --force
gh label create status:needs-decision --color e99695 --description "Waiting for a product or architecture decision" --force

# 未使用的 GitHub 默认标签（保留 good first issue 和 accessibility）
for name in bug documentation duplicate enhancement "help wanted" invalid question wontfix; do
  gh label delete "$name" --yes 2>/dev/null || true
done

# 里程碑：名称取自当前发布计划
gh api repos/:owner/:repo/milestones --method POST \
  -f title="<milestone title>" \
  -f description="<what this release delivers and when it is done>"
```

## 8. gh CLI 手册

一次变更的完整链路：

```bash
# 1. 建立 Issue：用模板交互式填写，标题前缀和标签会自动预填
gh issue create --template feature.yml

# 或非交互创建，正文自己按模板字段准备好
gh issue create \
  --title "[Feature] Add work item state machine" \
  --label type:feature,area:core \
  --body-file /tmp/issue-body.md

gh issue edit 12 --add-assignee @me

# 2. 从最新 main 切出分支
git switch main && git pull --ff-only
git switch -c feat/12-work-item-state-machine

# 3. 逐步提交，每个 commit 自查规模
git commit -m "feat(scrum-domain): add work item state machine"
git diff --numstat HEAD^ HEAD | awk '{a+=$1+$2} END {print a}'

# 4. 推送并开 PR
git push -u origin feat/12-work-item-state-machine
gh pr create --base main --fill    # 单 commit 时可用 --fill，否则手写标题与模板正文
gh pr create --base main --draft   # 工作未完成时

# 5. 检查与合并
gh pr checks
gh pr merge --merge --delete-branch

# 6. 收尾
git switch main && git pull --ff-only
```

常用查询：

```bash
gh issue list --label type:feature --label area:core
gh issue list --label status:blocked
gh pr status
gh pr view 12 --json title,mergeable,statusCheckRollup
```

## 9. 编码 Agent 执行顺序

本节的可执行版本封装在 `.claude/skills/git-workflow/SKILL.md` 中，Claude Code 会在涉及 Issue、分支、Commit 或 PR 的任务里自动加载，也可以用 `/git-workflow` 手动调用。修改本文规则时必须同步更新该 Skill。

编码 Agent 实现任何变更时按顺序执行：

1. 确认变更范围可以独立评审、测试和回滚；不能则先拆分。
2. 检查是否已有对应 Issue；没有则按第 3 节建立，有则自我指派。
3. 按第 4 节从最新 `main` 切出分支。
4. 按 Issue 的 Tasks 清单逐步实现，每步一个 commit，提交前跑该范围的 lint、类型检查和测试，并核对 500 行口径。
5. 每完成一步，勾选 Issue 中对应条目。
6. 按第 6 节开 PR，Test evidence 填写真实执行过的命令与输出。
7. CI 全绿后用 `gh pr merge --merge --delete-branch` 合入。
8. 确认 Issue 已关闭，回到第 1 步。

任何一步出现范围超出、依赖未就绪或需要产品决策的情况，停下并在 Issue 中说明，不擅自扩大 PR 范围。
