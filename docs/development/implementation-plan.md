# 分级实施计划

本文把本仓库路线拆成四级：`Release → Epic → Feature → Task`。计划覆盖共享 Core、Community、Harness 插件与 Remote Connector；Teams 和 Enterprise 服务端由独立项目规划。

## 1. 执行模型

- **Release**：可安装、可验证并具备明确退出条件的发布里程碑。
- **Epic**：一个连续的业务或架构能力域，不直接对应 Git 对象。
- **Feature**：一个可独立评审、测试和回滚的 Git PR；下文每个 `F-*` 均对应一个 PR。
- **Task**：Feature 内的最小可验证工作，默认对应一个 commit；需要先合入或独立评审时可升级成前置 PR。
- 按编号和依赖顺序实施。同一 Epic 内无依赖的 Feature 才能并行。
- 单个 commit 的手写代码变更不超过 500 行，具体口径见仓库根目录 `AGENT.md`。

每个 Feature PR 至少包含：目标和非目标、测试证据、兼容性影响、数据迁移影响和回滚方式。新增公共 Contract、Schema 或持久化格式时还必须提供版本策略。

本计划的编号落到 GitHub 上的方式：

- 每个 `F-*` 建一个 Issue，Issue 的 Tasks 清单对应它下面的 `T-*`。
- 每个 Release 建一个 Milestone，该 Release 的 Issue 与 PR 绑定到它。
- Epic 不建 GitHub 对象；需要标注时写在 Issue 正文的 Notes 里。
- 编号不写进 Issue 标题、分支名、commit 消息和 PR 标题。[Git 与 GitHub 协作规范](git-workflow.md)是与本计划无关的通用规范，命名一律以它为准。

## 2. 总体路线与范围

| Release | 结果 | 明确不包含 | 退出条件 |
|---|---|---|---|
| R0 工程与集成基线 | 可持续开发的 monorepo、契约骨架、Harness 兼容性结论 | Scrum 业务功能 | CI 通过；目标 Harness 版本和 Slot 接入方案有自动化验证 |
| R1 Community MVP | 单用户在一个 Workspace 内完成首版 Scrum 闭环，UI 与 Agent 共用权威数据 | 多人、评论通知、会议模式、高级报表 | 安装 Bundle 后完成创建项目到关闭 Sprint 的端到端验收 |
| R1.1 Community 稳定版 | 可恢复、可迁移、可发布的本地版本 | 远端协作 | 故障恢复、导入导出、兼容矩阵和发布检查全部通过 |
| R1.2 Remote Connector | 插件连接符合公共 Contract 的远程服务 | 服务端、商业身份、存储、治理和部署 | Contract 兼容、远程绑定、故障降级和 Community 迁移验收通过 |

当前承诺范围是 R0、R1 和 R1.1。R1.2 在公共用例和导出格式稳定后重新估算；服务端路线不在本文件维护。

## 3. R0 工程与集成基线

### E-0.1 工程工作区

#### F-0.1.1 初始化 TypeScript monorepo（PR）

- T-0.1.1a：建立根 `package.json`、pnpm workspace、共享 TypeScript 配置和 Node 版本约束（commit）。
- T-0.1.1b：建立最小包目录、统一 build/typecheck/test/lint 命令（commit）。
- T-0.1.1c：加入 CI，验证干净安装、类型检查、测试和构建（commit）。

#### F-0.1.2 建立测试与质量基线（PR）

- T-0.1.2a：选定测试、lint、格式化工具并记录 ADR（commit）。
- T-0.1.2b：增加单元、集成、契约测试的共享配置与示例（commit）。
- T-0.1.2c：增加包依赖边界检查，阻止 Domain 反向依赖（commit）。

### E-0.2 Contract 与领域骨架

#### F-0.2.1 定义标识、时间、Revision 和错误模型（PR）

- T-0.2.1a：定义品牌类型、时钟/ID Port 和实体元数据（commit）。
- T-0.2.1b：定义 Validation、Conflict、Forbidden、NotFound 等稳定错误码（commit）。
- T-0.2.1c：为序列化和错误映射补齐契约测试（commit）。

#### F-0.2.2 建立 API Contract 版本骨架（PR）

- T-0.2.2a：确定运行时 Schema 方案并记录 ADR（commit）。
- T-0.2.2b：实现版本化请求、响应、错误 Envelope（commit）。
- T-0.2.2c：加入向后兼容性和未知版本拒绝测试（commit）。

### E-0.3 Harness 可行性

#### F-0.3.1 固化 Harness 兼容矩阵（PR）

- T-0.3.1a：确定最低、目标、最高验证版本及插件依赖方式（commit）。
- T-0.3.1b：实现最小 Host/Client/Bundle 探针并验证安装卸载（commit）。
- T-0.3.1c：增加版本检测、拒绝提示与兼容性测试（commit）。

#### F-0.3.2 验证 Scrum 页面扩展点（PR）

- T-0.3.2a：针对目标 Harness 实测 Slot 契约并记录（commit）。
- T-0.3.2b：以实测落点实现最小接入 spike（commit）。
- T-0.3.2c：加入无 Session、切换 Workspace、折叠 Sidebar 的自动化兼容测试（commit）。

结论：实测确认 `sidebar.primaryActions` 与 `application.view` 不存在，入口使用 `sidebar.footer.action`，整页工作台使用 `shell.overlay`，无需上游 Slot 提案；契约记录在[开发指南](dsh-dev-guide.md)第 4 节。R1 UI 不再因扩展点阻塞；不使用 DOM Hack 或替换宿主内部布局的约束继续有效。

## 4. R1 Community MVP

### E-1.1 Scrum Domain

#### F-1.1.1 Project、Workflow 与权限核心（PR）

- T-1.1.1a：实现个人 Tenant、Project、Project Config 和默认工作流（commit）。
- T-1.1.1b：实现 Community Identity、角色权限与 Capability Gate（commit）。
- T-1.1.1c：覆盖项目归档、Revision 和权限矩阵测试（commit）。

#### F-1.1.2 Work Item 聚合与规则（PR）

- T-1.1.2a：实现 Epic、Story、Task、Bug 及验收标准、估算、负责人（commit）。
- T-1.1.2b：实现状态迁移、父子关系、依赖关系、阻塞信息和排序 rank（commit）。
- T-1.1.2c：覆盖循环引用、无效引用、非法状态和删除保护测试（commit）。

#### F-1.1.3 Sprint 聚合与生命周期（PR）

- T-1.1.3a：实现 planned、active、closed 及 Sprint Goal/日期（commit）。
- T-1.1.3b：实现规划、启动、关闭和未完成事项处置规则（commit）。
- T-1.1.3c：覆盖单一 active Sprint 和状态组合不变量测试（commit）。

### E-1.2 Workspace 权威存储

#### F-1.2.1 `.scrum` 项目初始化与读取（PR）

- T-1.2.1a：实现安全路径解析、目录布局和项目初始化（commit）。
- T-1.2.1b：实现 Project、Config、Work Item、Sprint 的 Schema 编解码（commit）。
- T-1.2.1c：实现扫描式内存索引、损坏文件诊断和未知 Schema 拒绝（commit）。

#### F-1.2.2 原子写入与乐观并发（PR）

- T-1.2.2a：实现同目录临时文件、flush、原子 rename 和清理（commit）。
- T-1.2.2b：实现 `expectedRevision`、实体 Revision 和 Project 级约束保护（commit）。
- T-1.2.2c：覆盖崩溃点、过期写入和两个 Host 竞争测试（commit）。

#### F-1.2.3 Journal 与 Activity（PR）

- T-1.2.3a：实现 Workspace Write Coordinator 和文件锁 Port（commit）。
- T-1.2.3b：实现 Operation Journal 的 prepare/commit/recover/rollback（commit）。
- T-1.2.3c：实现按月 Activity JSONL 追加及损坏末行隔离（commit）。
- T-1.2.3d：覆盖多实体原子性、幂等恢复和 Activity 关联测试（commit）。

### E-1.3 Application 用例

#### F-1.3.1 Project 与 Workspace 用例（PR）

- T-1.3.1a：实现 Create/Get/Archive Project（commit）。
- T-1.3.1b：实现 Workspace 创建绑定、验证、解除和失效检测（commit）。
- T-1.3.1c：实现统一授权、幂等键和 Activity 装饰器（commit）。

#### F-1.3.2 Backlog 与 Work Item 用例（PR）

- T-1.3.2a：实现 Create/Get/List/Update Work Item（commit）。
- T-1.3.2b：实现排序、移动状态、设置阻塞和依赖（commit）。
- T-1.3.2c：实现删除保护与批量规划接口（commit）。
- T-1.3.2d：覆盖 UI/Agent 共用服务及并发冲突测试（commit）。

#### F-1.3.3 Sprint 用例与基础进度（PR）

- T-1.3.3a：实现 Create/Update/Plan/Start Sprint（commit）。
- T-1.3.3b：实现 Close Sprint 和未完成事项移回 Backlog/下一 Sprint（commit）。
- T-1.3.3c：实现按状态、数量和估算聚合的基础进度查询（commit）。
- T-1.3.3d：覆盖完整 Sprint 生命周期验收测试（commit）。

### E-1.4 Harness Host 与 Agent

#### F-1.4.1 Host API 与 Workspace Context（PR）

- T-1.4.1a：实现 Workspace/Session 解析、路径指纹和绑定校验（commit）。
- T-1.4.1b：通过版本化 Host API 暴露 Application 用例，禁止 Client 读文件（commit）。
- T-1.4.1c：覆盖未选择、未绑定、已绑定、归档和失效绑定状态（commit）。

#### F-1.4.2 Workspace 继承授权（PR）

- T-1.4.2a：按 Workspace Binding 和当前用户解析 Project 权限（commit）。
- T-1.4.2b：实现 Capability ∩ Role ∩ Project Policy ∩ Project 状态的最终权限计算（commit）。
- T-1.4.2c：覆盖无 Session、绑定变化和项目归档时的降级测试（commit）。

#### F-1.4.3 只读 Agent Tools（PR）

- T-1.4.3a：实现 project、backlog、sprint、work-item 查询工具（commit）。
- T-1.4.3b：按 Agent Scope 注册/移除工具并限制返回载荷（commit）。
- T-1.4.3c：覆盖 Permission 控制可见性和身份传播测试（commit）。

#### F-1.4.4 写入 Agent Tools 与确认（PR）

- T-1.4.4a：实现 create/update/move/block 工作项工具（commit）。
- T-1.4.4b：实现 start/close Sprint 等高影响操作的确认流程（commit）。
- T-1.4.4c：实现 Conflict 的结构化返回与安全重读策略（commit）。
- T-1.4.4d：覆盖 Activity 来源、Session ID 和不可绕过授权测试（commit）。

### E-1.5 Harness Client 与 Scrum UI

依赖 F-0.3.2 实测得出的 Slot 契约（见[开发指南](dsh-dev-guide.md)第 4 节）。

#### F-1.5.1 应用壳与首次进入状态（PR）

- T-1.5.1a：注册 Sidebar 入口和 `shell.overlay` 整页浮层（commit）。
- T-1.5.1b：实现未选 Workspace、未绑定、归档、失效绑定页面（commit）。
- T-1.5.1c：实现 Community 项目创建向导和中文文案（commit）。
- T-1.5.1d：覆盖导航、主题、可访问性和无 Session 场景（commit）。

#### F-1.5.2 Product Backlog UI（PR）

- T-1.5.2a：实现 Backlog 查询、分组、过滤和空/错/加载状态（commit）。
- T-1.5.2b：实现工作项创建、编辑、详情和验收标准（commit）。
- T-1.5.2c：实现排序、父子/依赖、估算和阻塞交互（commit）。
- T-1.5.2d：覆盖 Revision Conflict 的刷新与用户提示（commit）。

#### F-1.5.3 Sprint 规划与看板 UI（PR）

- T-1.5.3a：实现 Sprint 创建、目标、日期和规划界面（commit）。
- T-1.5.3b：实现看板列、拖动推进和工作项详情抽屉（commit）。
- T-1.5.3c：实现启动/关闭确认和未完成事项处置界面（commit）。
- T-1.5.3d：实现基础进度展示并覆盖键盘操作与冲突场景（commit）。

#### F-1.5.4 有效权限展示（PR）

- T-1.5.4a：展示当前用户的角色和有效权限（commit）。
- T-1.5.4b：实现角色、归档和绑定变化导致的权限提示（commit）。
- T-1.5.4c：覆盖刷新恢复和同 Workspace 多 Session 权限一致性测试（commit）。

### E-1.6 Community 组合与验收

#### F-1.6.1 Community Edition 与 Bundle（PR）

- T-1.6.1a：组合 Local Identity、Workspace Storage、Local Audit 和 No-op Realtime（commit）。
- T-1.6.1b：构建可安装 Bundle，声明 Harness 兼容范围（commit）。
- T-1.6.1c：验证安装、升级、卸载和重新安装不损坏 `.scrum` 数据（commit）。

#### F-1.6.2 Community MVP 端到端验收（PR）

- T-1.6.2a：自动化“建项目→建工作项→规划→启动→推进→关闭”主路径（commit）。
- T-1.6.2b：自动化 UI 与 Agent 交叉修改、Conflict、高风险确认路径（commit）。
- T-1.6.2c：加入发布检查表、已知限制和用户快速开始文档（commit）。

## 5. R1.1 Community 稳定版

### E-1.1.1 数据生命周期

#### F-1.1.1.1 备份、恢复与完整性检查（PR）

- T-1.1.1.1a：实现一致性检查器和机器可读报告（commit）。
- T-1.1.1.1b：实现原子备份、恢复预检和恢复流程（commit）。
- T-1.1.1.1c：覆盖损坏 JSON、JSONL 尾部、引用错误和 Revision 回退（commit）。

#### F-1.1.1.2 Schema Migration（PR）

- T-1.1.1.2a：实现迁移注册表、预检、备份与幂等执行（commit）。
- T-1.1.1.2b：实现 dry-run 和未知新版本只读保护（commit）。
- T-1.1.1.2c：加入跨版本 fixture 和失败恢复测试（commit）。

#### F-1.1.1.3 导入导出（PR）

- T-1.1.1.3a：定义版本化、可校验且不含凭证的导出包（commit）。
- T-1.1.1.3b：实现导出、导入预检、ID 冲突报告和原子导入（commit）。
- T-1.1.1.3c：加入往返一致性和未来远程导入 fixture（commit）。

### E-1.1.2 发布可靠性

#### F-1.1.2.1 性能与规模基线（PR）

- T-1.1.2.1a：定义项目规模样本和启动/查询/写入预算（commit）。
- T-1.1.2.1b：基准测试扫描索引、Backlog 查询和 Journal 恢复（commit）。
- T-1.1.2.1c：仅在预算不达标时增加可重建 cache（commit）。

#### F-1.1.2.2 发布自动化与兼容矩阵（PR）

- T-1.1.2.2a：自动测试受支持 Harness 版本矩阵（commit）。
- T-1.1.2.2b：实现版本、变更日志、包完整性和 provenance 检查（commit）。
- T-1.1.2.2c：完成干净 Workspace 与已有数据的发布候选验收（commit）。

## 6. R1.2 Remote Connector（方向性）

### E-1.2.1 公共远程边界

#### F-1.2.1.1 Remote Gateway Port 与绑定（PR）

- T-1.2.1.1a：在 Application 定义协议无关的 Remote Gateway Port（commit）。
- T-1.2.1.1b：实现 `local | remote` Workspace Binding 和非敏感连接配置（commit）。
- T-1.2.1.1c：覆盖绑定切换、失效和凭证引用测试（commit）。

#### F-1.2.1.2 API Contract 与 Remote Adapter（PR）

- T-1.2.1.2a：定义握手、Principal、Capability、资源 DTO 和实时事件 Contract（commit）。
- T-1.2.1.2b：实现 Harness Host Remote Adapter、错误映射和幂等重试（commit）。
- T-1.2.1.2c：加入版本不兼容、认证失效、断网、超时和 Conflict 测试（commit）。

#### F-1.2.1.3 Community 迁移到远程服务（PR）

- T-1.2.1.3a：实现版本化快照上传和预检（commit）。
- T-1.2.1.3b：消费服务端 ID 映射并原子切换 Workspace Binding（commit）。
- T-1.2.1.3c：验证失败回滚和本地只读备份（commit）。

## 7. 外部服务依赖

多人协作、服务端 RBAC、Realtime 发布、通知、服务端审计、SSO/SCIM、Policy、HA、备份、Admin 和部署验收由 `dsh-scrum-server` 项目规划和测试。本仓库只维护它们所需的公共 Contract、客户端行为和跨仓库兼容 fixture。

## 8. 开始执行时的队列

首批严格按以下顺序：

1. F-0.1.1 初始化 TypeScript monorepo。
2. F-0.1.2 建立测试与质量基线。
3. F-0.2.1 定义基础领域类型与错误模型。
4. F-0.2.2 建立 API Contract 版本骨架。
5. F-0.3.1 固化 Harness 兼容矩阵。
6. F-0.3.2 验证 Scrum 页面扩展点。

R0 退出评审通过后，再开启 R1。R1 内先完成 E-1.1 Domain，再以 E-1.2 Storage 为主线；E-1.3 Application 可以在 Repository Port 稳定后跟进，E-1.4/E-1.5 不越过其依赖接口提前实现业务规则。

## 9. Release 通用完成标准

- 范围内验收路径全部自动化且通过。
- Domain 不变量、授权和 Revision 在所有写入口一致执行。
- 新增 Schema、Contract 和持久化格式有版本与迁移说明。
- 无凭证进入日志、导出包、`.scrum/` 或测试 fixture。
- 支持的 Harness/Node/浏览器版本有可复现证据。
- 安装、升级、故障恢复和回滚路径已验证。
- 文档、变更日志和已知限制与产物一致。
