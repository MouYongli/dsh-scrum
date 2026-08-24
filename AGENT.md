# Agent Guide

本文件定义仓库内编码 Agent 必须遵守的工程约定。产品行为和技术原理以 `docs/` 中的文档为权威来源，不在此重复展开。

## 产品边界

- 本项目是独立的 DeepSeek Harness Scrum 插件，不属于 Harness monorepo。
- 优先使用 Harness 公开的 Cordis Plugin、Tool、Service 和 Web Client Slot。
- 除非任务明确要求修改上游，否则不得修改 DeepSeek Harness 源码。
- 不得依赖相邻 Harness Checkout、仓库内符号链接或个人绝对路径。
- Harness 仍处于 Developer Preview；插件必须声明、检测并测试兼容版本。
- Community 在 Harness Host 内运行，不得引入独立 Scrum Server。
- 远程模式通过 Harness 插件连接符合公共 Contract 的外部服务。
- Teams/Enterprise 服务端、商业身份、服务端存储、治理和 Admin App 不在本仓库实现。

详细集成方式见 [DeepSeek Harness Scrum 开发指南](docs/development/dsh-dev-guide.md)。

## 模块边界

本仓库的实现模块位于 `packages/`。不得新增 `apps/scrum-server`、`packages/server/`、商业 Edition 实现，或通过相邻 Checkout、源码路径和符号链接耦合外部服务仓库。

- `scrum-domain` 不得依赖 React、Harness、HTTP 或存储 Adapter。
- `scrum-application` 不得依赖具体 Edition。
- `scrum-ui` 不得直接访问文件、数据库或 Harness Context。
- Community 组合只声明 Capability 和 Adapter，不得实现或复制领域规则。
- Harness Client 不得直接读取 Workspace 文件，必须通过 Harness Host API 操作。
- Host、Client、Agent Tools 和远程服务必须通过公开 Contract 协作，不能跨仓库导入内部实现。

完整目录、模块职责和依赖方向见[系统架构](docs/development/architecture.md)。

## 数据与存储约束

- Community 使用 Workspace 内的 JSON/JSONL 作为权威数据，不使用 SQLite。
- 一个可变实体一个 JSON 文件，并包含 `schemaVersion`、`revision`、`createdAt` 和 `updatedAt`。
- Activity、Comment 等追加记录使用拆分的 JSONL。
- 写入必须携带 `expectedRevision`；冲突时拒绝写入，禁止静默覆盖。
- JSON 使用同目录临时文件、刷新和原子重命名完成写入。
- JSONL 通过 Workspace 级协调器或文件锁串行追加。
- 多实体操作必须使用 Operation Journal，支持提交、恢复或回滚。
- 不得重复保存可派生关系；Sprint 成员关系只由 Work Item 的 `sprintId` 表达。
- Session Log 由 Harness 管理，不得把完整 Scrum 实体复制到 Session Log。
- Token、密码、企业密钥和登录凭证不得写入 `.scrum/`。
- UI 与 Agent 必须通过同一 Application Service 和 Storage Adapter 写入数据。

完整 Schema、文件格式、并发和迁移规则见[系统架构](docs/development/architecture.md)。

## Harness 开发约束

- Host 插件负责 Workspace、Session、文件系统、Remote Gateway 和 Agent Tool 的业务接入。
- Client 插件负责 Sidebar 按钮、Scrum 主页面和交互展示。
- Browser 组件使用 `ctx.slots.register(...)` 注册到宿主声明的 Slot。
- 注册到其他插件的 Slot 时，使用 `ctx.slots.inject(...)` 等待声明。
- 跨插件协作使用 Slot 或 Cordis Service，不得导入其他插件的内部 React 组件。
- 每个包的 `exports` 必须包含 `"./package.json"`；缺失时 Harness Loader 会静默跳过插件。
- 对外可安装单元只有 `scrum-harness-bundle`；Profile patch 只写它的包名，Host 和 Client 由 Bundle re-export，patch 写工作区内部包名会让整个 Shell 启动失败。
- Scrum Tool 只在绑定了 Scrum Project 且当前用户拥有相应权限的 Workspace 或 Agent Scope 中可见。
- Agent 必须使用当前用户身份，并同时接受 Capability、角色、Project Policy、Project 状态和操作策略约束；Session 只能作为审计来源，不能参与授权。
- 高风险 Tool 必须请求确认并写入 Activity。
- UI 隐藏操作入口不能替代 Host 或远程服务的权限检查。
- 产品界面文案使用中文；代码、类型和代码注释使用英文；界面字符串一律进 `messages.ts` 词典，同时给出 `zh` 和 `en`，组件里不写字面文案。
- 界面改动前先读 Web UI Skill；不得另起一套调色板、间距或组件词汇。

当前 Sidebar 扩展限制、实测 Slot 契约、页面状态和授权模型见 [DeepSeek Harness Scrum 开发指南](docs/development/dsh-dev-guide.md)。

界面工作的可执行版本是 `.codex/skills/deepseek-harness-web-ui-skill/`（`.claude/skills/deepseek-harness-web-ui` 是指向它的软链接，两个运行时读同一份）。它记录 Slot 挂载点、六个工作台分区、首次进入状态、主题 Token 绑定规则和挂进 Shell 的评审循环。与本文件或开发指南冲突时以本文件和开发指南为准，并同步修改 Skill。

## 推荐开发顺序

1. 定义 `scrum-domain`、Schema 和纯业务规则。
2. 实现 `adapter-storage-workspace-files`，覆盖原子写入、Revision 和恢复。
3. 实现 `scrum-application` 用例与 `scrum-api-contract`。
4. 接入 Harness Host 和 Agent Tools，完成无 UI 端到端验证。
5. 接入 Harness Client 和 Scrum UI。
6. 实现 Remote Gateway Port、远程 Adapter、Contract 兼容和故障处理。
7. 增加迁移、导入导出、本地审计和恢复测试。

版本范围和 Capability 规则见[版本设计](docs/product/editions.md)，产品首版范围见 [Scrum 产品设计](docs/product/scrum.md#7-首个版本范围)。

## 测试要求

本地执行的检查、构建与 Harness 挂载命令见[本地开发循环](docs/development/local-development.md)。

- Domain：业务规则、状态迁移、数据不变量和权限矩阵。
- Workspace Storage：原子写、冲突、损坏 JSONL 尾部、Journal 恢复和 Schema Migration。
- Application：用例、授权、幂等性和并发冲突。
- Harness Host：Workspace/Session Scope、Tool 可见性和确认流程。
- Harness Client：Slot 注册、无 Workspace、无项目、归档项目和已绑定项目状态。
- Remote：Contract、认证失效、超时、断网、Conflict、Capability 降级和敏感信息脱敏。
- Composition：Community Local 与 Remote Connector 分别执行组合测试；服务端测试属于外部项目。

## Git 与 GitHub 协作

- 每个变更先建 GitHub Issue 再动手，Issue 标题使用 `[Type] Imperative English summary`。
- 分支命名为 `<type>/<issue-number>-<slug>`，从最新 `main` 切出，禁止直接向 `main` push。
- Commit 与 PR 标题使用 Conventional Commits；Issue、分支、Commit 和 PR 一律使用英文。
- PR 只允许以 merge commit 合入，禁止 squash 与 rebase merge，以保留 PR 内的提交历史。
- Issue、分支、Commit 和 PR 中不写计划编号，追溯通过 `Refs #<issue>` 完成。
- 一个 Issue 对应一个 Git PR；PR 必须可独立评审、测试和回滚。
- 变更内部的实现步骤默认各对应一个 commit；确需独立集成或评审时可以拆成前置 PR。
- 单个 commit 的手写代码变更不得超过 500 行，按 `git diff --numstat <commit>^ <commit>` 的新增与删除行数之和计算。
- 文档、测试快照、生成文件和 lockfile 不计入上述 500 行，但必须与其对应的代码变更同源且可复现；不得借此隐藏大规模手写代码变更。
- 预计超过限制的步骤必须在编码前继续拆分；禁止完成后再用无语义的切片 commit 规避限制。
- 每个 commit 只表达一个可验证意图，并通过该范围适用的 lint、类型检查和测试。

Issue、分支、Commit 和 PR 的完整命名与流程见 [Git 与 GitHub 协作规范](docs/development/git-workflow.md)；可执行版本为 `.claude/skills/git-workflow/SKILL.md`，两者必须同步修改。
