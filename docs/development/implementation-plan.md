# 分级实施计划

本文把产品路线拆成四级：`Release → Epic → Feature → Task`。计划以 Community 的首个可用闭环为第一目标，Teams 和 Enterprise 在共享 Domain、Application 与 API Contract 稳定后推进。

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
| R2 Teams | 多用户共享项目、RBAC、实时协作和基础审计 | 企业 SSO/SCIM、策略治理、HA | 多租户隔离与并发协作验收通过，可从 Community 迁移 |
| R3 Enterprise | 企业身份、策略、审计、部署和灾备 | 与 Scrum 无关的通用 ALM 能力 | 安全、恢复、升级和隔离验收通过 |

当前承诺范围是 R0、R1 和 R1.1。R2、R3 是方向性计划，在前一 Release 结束时重新估算，不提前冻结服务端技术选型。

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

#### F-1.4.2 Session Scrum Access（PR）

- T-1.4.2a：实现 Off/Read/Write Context 的本地持久化（commit）。
- T-1.4.2b：实现 Edition ∩ Role ∩ Session ∩ Policy 的最终权限计算（commit）。
- T-1.4.2c：覆盖默认 Off、绑定变化和项目归档时的降级测试（commit）。

#### F-1.4.3 只读 Agent Tools（PR）

- T-1.4.3a：实现 project、backlog、sprint、work-item 查询工具（commit）。
- T-1.4.3b：按 Agent Scope 注册/移除工具并限制返回载荷（commit）。
- T-1.4.3c：覆盖 Off 不可见、Read 可见和身份传播测试（commit）。

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

#### F-1.5.4 Session Access 控件（PR）

- T-1.5.4a：实现 Off/Read/Write 选择器和当前状态反馈（commit）。
- T-1.5.4b：实现角色/归档/绑定变化导致的权限降级提示（commit）。
- T-1.5.4c：覆盖刷新恢复和多 Session 相互隔离测试（commit）。

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
- T-1.1.1.3c：加入往返一致性和未来 Teams 上传 fixture（commit）。

### E-1.1.2 发布可靠性

#### F-1.1.2.1 性能与规模基线（PR）

- T-1.1.2.1a：定义项目规模样本和启动/查询/写入预算（commit）。
- T-1.1.2.1b：基准测试扫描索引、Backlog 查询和 Journal 恢复（commit）。
- T-1.1.2.1c：仅在预算不达标时增加可重建 cache（commit）。

#### F-1.1.2.2 发布自动化与兼容矩阵（PR）

- T-1.1.2.2a：自动测试受支持 Harness 版本矩阵（commit）。
- T-1.1.2.2b：实现版本、变更日志、包完整性和 provenance 检查（commit）。
- T-1.1.2.2c：完成干净 Workspace 与已有数据的发布候选验收（commit）。

## 6. R2 Teams（方向性）

### E-2.1 服务端权威数据

#### F-2.1.1 Server Runtime 与存储 Adapter（PR）

- T-2.1.1a：基于 ADR 初始化单一 `scrum-server` Runtime（commit）。
- T-2.1.1b：实现共享 Repository Ports 的服务端存储和事务（commit）。
- T-2.1.1c：覆盖 Tenant 隔离、Revision 和迁移测试（commit）。

#### F-2.1.2 HTTP API 与 Remote Adapter（PR）

- T-2.1.2a：实现版本化 API、认证上下文和错误映射（commit）。
- T-2.1.2b：实现 Harness Host Remote Adapter 和幂等重试（commit）。
- T-2.1.2c：加入 Contract、断网、超时和 Conflict 测试（commit）。

#### F-2.1.3 Community 升级 Teams（PR）

- T-2.1.3a：实现快照上传、校验和 ID 映射（commit）。
- T-2.1.3b：迁移 Activity/Actor 并切换 Workspace Link（commit）。
- T-2.1.3c：验证失败回滚和本地只读备份（commit）。

### E-2.2 多人协作

#### F-2.2.1 Team Identity 与基础 RBAC（PR）

- T-2.2.1a：实现成员、邀请和多角色模型（commit）。
- T-2.2.1b：实现服务器端权限矩阵和当前用户身份传播（commit）。
- T-2.2.1c：覆盖越权、撤权和跨 Tenant 攻击测试（commit）。

#### F-2.2.2 Realtime Sync（PR）

- T-2.2.2a：定义可恢复的版本化实时事件（commit）。
- T-2.2.2b：实现发布、订阅、重连和缺口重取（commit）。
- T-2.2.2c：实现 UI 缓存失效及并发编辑提示（commit）。

#### F-2.2.3 评论、提及与通知（PR）

- T-2.2.3a：实现不可变评论事件和编辑/删除更正（commit）。
- T-2.2.3b：实现提及解析、通知 Port 和应用内通知（commit）。
- T-2.2.3c：实现邮件/Webhook Adapter 与失败重试（commit）。

### E-2.3 Teams 发布

#### F-2.3.1 基础审计与运维（PR）

- T-2.3.1a：实现可查询的服务端审计记录（commit）。
- T-2.3.1b：加入健康检查、结构化日志、指标和备份钩子（commit）。
- T-2.3.1c：覆盖审计完整性和数据恢复演练（commit）。

#### F-2.3.2 Teams 端到端验收（PR）

- T-2.3.2a：自动化两个用户并发规划和看板协作（commit）。
- T-2.3.2b：验证 RBAC、断线重连、通知和 Agent 身份（commit）。
- T-2.3.2c：产出部署、升级、回滚和迁移手册（commit）。

## 7. R3 Enterprise（方向性）

### E-3.1 企业身份与策略

#### F-3.1.1 SSO/OIDC/SAML 与 SCIM（PR）

- T-3.1.1a：实现企业身份 Adapter 和账号链接（commit）。
- T-3.1.1b：实现 SCIM 用户/组同步及停用（commit）。
- T-3.1.1c：覆盖身份接管、撤权和断言校验测试（commit）。

#### F-3.1.2 Policy 与自定义角色（PR）

- T-3.1.2a：定义版本化策略和决策解释 Contract（commit）。
- T-3.1.2b：实现 Policy Authorization Adapter 和自定义角色（commit）。
- T-3.1.2c：覆盖 UI、API、Agent 三入口一致执行测试（commit）。

### E-3.2 合规与安全

#### F-3.2.1 高级审计与保留（PR）

- T-3.2.1a：实现防篡改审计、检索和导出（commit）。
- T-3.2.1b：实现保留、Legal Hold 和删除策略（commit）。
- T-3.2.1c：覆盖策略冲突、导出完整性和访问审计（commit）。

#### F-3.2.2 加密与数据驻留（PR）

- T-3.2.2a：实现 KMS/企业密钥 Adapter 和轮换（commit）。
- T-3.2.2b：实现区域放置、跨区限制和敏感配置管理（commit）。
- T-3.2.2c：完成威胁模型与安全测试（commit）。

### E-3.3 企业部署

#### F-3.3.1 HA、备份和灾备（PR）

- T-3.3.1a：实现无状态扩展、Worker 协调和故障转移（commit）。
- T-3.3.1b：实现备份、时间点恢复和跨环境恢复（commit）。
- T-3.3.1c：执行并记录 RPO/RTO 演练（commit）。

#### F-3.3.2 Enterprise Admin 与管理 API（PR）

- T-3.3.2a：实现组织、策略、许可证管理 API（commit）。
- T-3.3.2b：实现独立 Admin App 的最小治理界面（commit）。
- T-3.3.2c：覆盖管理员权限分离和审计测试（commit）。

#### F-3.3.3 Enterprise 发布验收（PR）

- T-3.3.3a：自动化私有部署、滚动升级和回滚（commit）。
- T-3.3.3b：完成隔离、安全、性能和灾备验收（commit）。
- T-3.3.3c：发布运维、安全和兼容性文档（commit）。

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
