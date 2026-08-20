# Agent Guide

本文件定义仓库内编码 Agent 必须遵守的工程约定。产品行为和技术原理以 `docs/` 中的文档为权威来源，不在此重复展开。

## 产品边界

- 本项目是独立的 DeepSeek Harness Scrum 插件，不属于 Harness monorepo。
- 优先使用 Harness 公开的 Cordis Plugin、Tool、Service 和 Web Client Slot。
- 除非任务明确要求修改上游，否则不得修改 DeepSeek Harness 源码。
- 不得依赖相邻 Harness Checkout、仓库内符号链接或个人绝对路径。
- Harness 仍处于 Developer Preview；插件必须声明、检测并测试兼容版本。
- Community 在 Harness Host 内运行，不得引入独立 Scrum Server。
- Teams 和 Enterprise 通过 Harness 插件连接同一个 `scrum-server` Runtime。
- 普通 Scrum UI 位于 Harness 内；独立 Admin App 只用于企业治理。

详细集成方式见 [DeepSeek Harness Scrum 开发指南](docs/dsh-dev-guide.md)。

## 模块边界

```text
apps/       可独立启动和部署的进程
packages/   被 App 或 Harness Bundle 组合的模块
```

- `scrum-domain` 不得依赖 React、Harness、HTTP 或存储 Adapter。
- `scrum-application` 不得依赖具体 Edition。
- `scrum-ui` 不得直接访问文件、数据库或 Harness Context。
- Edition 只组合 Capability 和 Adapter，不得实现或复制领域规则。
- Harness Client 不得直接读取 Workspace 文件，必须通过 Harness Host API 操作。
- Host、Client、Agent Tools 和 Server 必须通过公开 Contract 协作，不能导入其他插件的内部实现。

完整目录、模块职责和依赖方向见[系统架构](docs/architecture.md)。

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

完整 Schema、文件格式、并发和迁移规则见[系统架构](docs/architecture.md)。

## Harness 开发约束

- Host 插件负责 Workspace、Session、文件系统、远端 API 和 Agent Tool 的业务接入。
- Client 插件负责 Sidebar 按钮、Scrum 主页面和交互展示。
- Browser 组件使用 `ctx.slots.register(...)` 注册到宿主声明的 Slot。
- 注册到其他插件的 Slot 时，使用 `ctx.slots.inject(...)` 等待声明。
- 跨插件协作使用 Slot 或 Cordis Service，不得导入其他插件的内部 React 组件。
- Scrum Tool 只在允许访问 Scrum 的 Session 或 Agent Scope 中可见。
- Agent 必须使用当前用户身份，并同时接受 Edition、角色、Session Access 和操作策略约束。
- 高风险 Tool 必须请求确认并写入 Activity。
- UI 隐藏操作入口不能替代 Host 或 Server 权限检查。
- 产品界面文案使用中文；代码、类型和代码注释使用英文。

当前 Sidebar 扩展限制、建议 Slot、页面状态和授权模型见 [DeepSeek Harness Scrum 开发指南](docs/dsh-dev-guide.md)。

## 推荐开发顺序

1. 定义 `scrum-domain`、Schema 和纯业务规则。
2. 实现 `adapter-storage-workspace-files`，覆盖原子写入、Revision 和恢复。
3. 实现 `scrum-application` 用例与 `scrum-api-contract`。
4. 接入 Harness Host 和 Agent Tools，完成无 UI 端到端验证。
5. 接入 Harness Client 和 Scrum UI。
6. 实现 Teams/Enterprise Server、远端 Adapter、身份与同步。
7. 增加迁移、导入导出、审计和恢复测试。

版本范围和 Capability 规则见[版本设计](docs/editions.md)，产品首版范围见 [Scrum 产品设计](docs/scrum.md#6-首个版本范围)。

## 测试要求

- Domain：业务规则、状态迁移、数据不变量和权限矩阵。
- Workspace Storage：原子写、冲突、损坏 JSONL 尾部、Journal 恢复和 Schema Migration。
- Application：用例、授权、幂等性和并发冲突。
- Harness Host：Workspace/Session Scope、Tool 可见性和确认流程。
- Harness Client：Slot 注册、无 Workspace、无项目、归档项目和已绑定项目状态。
- Server：租户隔离、身份、RBAC、实时事件和审计。
- Edition：Community、Teams 和 Enterprise 分别执行组合测试。
