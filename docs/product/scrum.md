# Scrum 项目管理系统

> 状态：初稿  
> 本文用于说明 Scrum 的基本概念、系统角色与权限、主要功能、项目管理流程及核心数据模型。本文描述的是产品设计目标，不代表所有功能均已实现。

## 1. 什么是 Scrum

Scrum 是一种用于开发、交付和持续改进复杂产品的轻量级敏捷框架。

Scrum 不试图在项目开始时制定一份不可改变的完整计划，而是把工作划分为一系列固定时长的短周期——Sprint。团队在每个 Sprint 中选择最有价值的工作，完成可使用的产品增量，并根据结果和反馈调整下一步计划。

典型闭环如下：

```text
产品目标
  ↓
Product Backlog
  ↓
Sprint Planning
  ↓
Sprint 执行与 Daily Scrum
  ↓
产品增量
  ↓
Sprint Review
  ↓
Sprint Retrospective
  ↓
调整 Backlog 与工作方式
  ↓
进入下一个 Sprint
```

Scrum 帮助团队持续回答以下问题：

1. 当前最重要的产品目标是什么？
2. 下一步最值得完成的工作是什么？
3. 当前 Sprint 希望达成什么结果？
4. 工作进展如何，存在哪些阻塞和风险？
5. 本轮实际交付了什么？
6. 下一轮应该如何调整产品和工作方式？

### 1.1 Scrum 的基本特征

- 迭代：通过连续的 Sprint 推进产品。
- 增量：每个 Sprint 都应产生可使用的产品增量。
- 透明：目标、工作内容、状态和风险对团队可见。
- 检查：团队定期检查产品结果和工作过程。
- 适应：发现偏差后及时调整计划、优先级或协作方式。
- 价值导向：优先交付最有价值的结果，而不是单纯完成更多任务。

### 1.2 Sprint

Sprint 是一个固定时长的工作周期，通常持续 1～4 周。

每个 Sprint 都应具有：

- 明确的 Sprint Goal；
- 为达成目标而选择的 Sprint Backlog；
- 可检查的工作进展；
- 满足完成定义的产品增量；
- Review 和 Retrospective 产生的反馈及改进行动。

任一 Scrum Project 同时最多只能存在一个进行中的 Sprint。

### 1.3 Scrum 工件

Scrum 的三个核心工件是：

#### Product Backlog

产品全部待办工作的有序列表。它会随着产品认知、用户反馈和业务变化持续更新。

#### Sprint Backlog

当前 Sprint 为实现 Sprint Goal 而选择的工作，以及 Developers 制定的执行计划。

#### Increment

Sprint 中完成并满足 Definition of Done 的可使用产品成果。一个 Sprint 可以产生一个或多个 Increment。

### 1.4 Scrum 活动

Scrum 包含以下主要活动：

- Sprint Planning：确定 Sprint Goal、选择工作并形成执行计划。
- Daily Scrum：每天检查 Sprint Goal 的进展并调整当天计划。
- Sprint Review：检查产品增量，收集利益相关者反馈并调整 Product Backlog。
- Sprint Retrospective：检查团队协作和工作方式，并确定下一轮改进行动。
- Backlog Refinement：持续澄清、拆分、估算和排序 Product Backlog。它是常见实践，但不是 Scrum 官方规定的独立事件。

## 2. 角色与职责

需要区分两类角色：

- Scrum 角色：定义团队在 Scrum 中承担的职责；
- 系统角色：定义用户在软件中可以执行的操作。

一个用户可以同时承担多个职责，但系统权限仍应按照最小权限原则授予。

### 2.1 Product Owner

Product Owner 对产品价值和 Product Backlog 的有效管理负责。

主要职责：

- 明确并维护 Product Goal；
- 创建、澄清和排序 Product Backlog；
- 确保工作项具有清晰的业务价值；
- 编写或确认验收标准；
- 与团队共同进行 Backlog Refinement；
- 在 Sprint Planning 中说明优先级和期望结果；
- 在 Sprint Review 中检查结果并收集反馈；
- 根据反馈调整后续方向。

Product Owner 负责决定“为什么做”和“优先做什么”，但不单方面决定 Developers 在 Sprint 中如何完成工作。

### 2.2 Scrum Master

Scrum Master 对 Scrum 的正确理解和有效实践负责。

主要职责：

- 帮助团队理解和实践 Scrum；
- 促进 Sprint Planning、Daily Scrum、Review 和 Retrospective；
- 发现并推动解决阻塞；
- 保护团队免受无序干扰；
- 帮助团队控制 WIP 和改善工作流；
- 观察交付趋势、周期时间和 Sprint 风险；
- 跟踪 Retrospective 产生的改进行动；
- 推动团队持续改进。

Scrum Master 不是任务分配者，也不以命令方式管理 Developers。

### 2.3 Developers

Developers 是在 Sprint 中共同创建可使用产品增量的团队成员，可能包括开发、测试、设计、运维、数据或其他专业人员。

主要职责：

- 参与 Sprint Planning；
- 拆分和估算工作；
- 制定并维护 Sprint Backlog；
- 领取或协作完成事项；
- 更新工作状态；
- 记录和推动解决阻塞；
- 确保结果满足验收标准和 Definition of Done；
- 每日检查 Sprint Goal 的进展；
- 根据实际情况调整执行计划；
- 对产品增量的质量共同负责。

### 2.4 Stakeholder

Stakeholder 不是 Scrum Team 的正式成员，但会影响产品方向或使用产品结果，例如客户、业务负责人、运营人员和管理层。

主要职责：

- 提供业务背景和用户反馈；
- 参与 Sprint Review；
- 检查产品结果；
- 提出新的需求、约束或风险；
- 关注目标和交付结果，而不是直接干预团队日常任务。

### 2.5 Project Administrator

Project Administrator 是系统权限角色，不是 Scrum 官方角色。

主要职责：

- 创建和配置 Scrum Project；
- 管理成员及项目角色；
- 配置工作流显示名称、估算方式和 WIP 上限；
- 管理项目归档、导入、导出及集成；
- 查看权限和 Activity；
- 处理数据恢复和系统配置。

### 2.6 Agent

Agent 是系统中的操作主体，不是 Scrum 官方角色。

Agent 可以根据用户请求：

- 查询 Project、Backlog、Sprint 和工作项；
- 汇总 Sprint 进展、阻塞和风险；
- 创建或更新工作项；
- 调整状态、负责人或排序；
- 协助整理 Sprint Planning、Review 和 Retrospective；
- 生成摘要、发布说明或改进建议。

Agent 必须使用当前用户身份执行操作，不能绕过用户角色、Project Policy、资源版本和高风险操作确认。Session 只作为可选审计来源，不参与授权。

## 3. 基于角色的系统功能

### 3.1 功能权限矩阵

| 功能 | Product Owner | Scrum Master | Developers | Stakeholder | Administrator |
|---|---:|---:|---:|---:|---:|
| 查看 Project 和 Sprint | ✓ | ✓ | ✓ | ✓ | ✓ |
| 查看 Product Backlog | ✓ | ✓ | ✓ | ✓ | ✓ |
| 创建和编辑工作项 | ✓ | ✓ | ✓ | 可提交建议 | ✓ |
| 调整 Backlog 优先级 | ✓ | 协助 | — | — | ✓ |
| 估算工作项 | 参与 | 促进 | ✓ | — | 可配置 |
| 设置验收标准 | ✓ | 协助 | 参与 | 可反馈 | ✓ |
| 创建 planned Sprint | ✓ | ✓ | 可选 | — | ✓ |
| 设置 Sprint Goal | ✓ | ✓ | 参与 | — | ✓ |
| 将事项加入 Sprint | ✓ | ✓ | 参与 | — | ✓ |
| 启动或结束 Sprint | 可配置 | ✓ | — | — | ✓ |
| 更新本人工作状态 | ✓ | ✓ | ✓ | — | ✓ |
| 更新任意事项状态 | 可配置 | ✓ | 可配置 | — | ✓ |
| 标记和解除阻塞 | ✓ | ✓ | ✓ | — | ✓ |
| 验收工作结果 | ✓ | 协助 | 提交验收 | 反馈 | ✓ |
| 管理 Retrospective | 参与 | ✓ | 参与 | — | ✓ |
| 查看团队报表 | ✓ | ✓ | ✓ | 只读摘要 | ✓ |
| 管理成员和权限 | — | — | — | — | ✓ |
| 修改项目配置 | — | 可配置 | — | — | ✓ |
| 归档或恢复项目 | — | — | — | — | ✓ |

实际权限可以由不同版本和组织策略调整。UI 隐藏入口不能代替服务端权限校验。

### 3.2 Product Owner 功能

- 创建和维护 Product Goal；
- 创建 Epic、Story、Bug 和其他工作项；
- 编辑描述、优先级和验收标准；
- 拖拽调整 Backlog 排序；
- 按标签、类型、负责人和优先级筛选；
- 进行 Backlog Refinement；
- 查看工作项是否满足 Definition of Ready；
- 创建 Sprint 草稿并提出 Sprint Goal；
- 查看 Sprint 交付情况；
- 接受、拒绝或退回待验收事项；
- 根据 Review 反馈调整 Product Backlog。

### 3.3 Scrum Master 功能

- 创建和维护 Sprint；
- 组织 Planning、Daily Scrum、Review 和 Retrospective；
- 查看 WIP、阻塞、停滞事项和范围变化；
- 设置或检查 WIP 上限；
- 跟踪 Sprint Goal 的风险；
- 结束 Sprint 并处理未完成事项；
- 查看燃尽趋势、完成率、Velocity 和 Cycle Time；
- 创建和跟踪改进行动。

### 3.4 Developers 功能

- 查看当前 Sprint 和 Sprint Goal；
- 查看分配给自己的工作；
- 拆分、估算和领取事项；
- 修改事项状态和排序；
- 维护验收标准和检查清单；
- 标记阻塞并填写原因；
- 添加评论、附件和相关链接；
- 关联分支、Commit、PR、构建和测试结果；
- 提交 Daily Scrum 更新；
- 参与 Review 和 Retrospective。

### 3.5 Stakeholder 功能

- 只读查看产品目标、路线图和 Sprint 结果；
- 查看 Release 和里程碑；
- 参与 Sprint Review；
- 对已交付功能提供反馈；
- 提交新的需求建议；
- 查看经过筛选的项目风险和交付预测。

Stakeholder 默认不应直接修改 Sprint Backlog 或改变事项状态。

### 3.6 Administrator 功能

- 创建、归档和恢复项目；
- 邀请、移除和停用成员；
- 分配系统角色和项目角色；
- 配置估算方式、WIP 上限及状态显示名称；
- 管理通知、Webhook 和第三方集成；
- 管理数据导入、导出、备份和恢复；
- 查看 Activity 和安全审计；
- 配置 Agent 的可用能力及高风险操作策略。

### 3.7 Agent 功能与限制

Agent 的最终权限由以下权限层共同决定：

```text
Agent 最终权限
  = 版本能力
  ∩ 当前用户的项目角色权限
  ∩ Project Permission Policy
  ∩ Project 状态
  ∩ 操作级安全策略
```

Workspace 绑定 Project 后，该 Workspace 下的所有 Session 和 Scrum 工作台内的 Agent 自动继承当前用户的有效 Project 权限，不提供逐 Session 的 Off、Read 或 Write 开关。

删除工作项、结束 Sprint、批量修改和项目设置变更等高影响操作必须获得明确确认。

## 4. 系统功能

### 4.1 Project 与成员管理

- 创建和配置 Scrum Project；
- 将 Harness Workspace 绑定到 Scrum Project；
- 管理项目名称、Key、说明和状态；
- 管理成员及角色；
- 配置估算方式、工作流显示名称和 WIP 上限；
- 归档、导出和恢复项目。

一个 Harness Workspace 最多绑定一个 Scrum Project。对 Community 用户而言，Project 可以直接表现为工作区中的 Scrum 看板，不必增加额外的项目选择层级。

### 4.2 Product Backlog

工作项分三个层级，五个类型：

```text
Product Goal
└── Epic                       level 1  跨多个 Sprint 的业务主题
    ├── Story                  level 2  从用户视角描述的一项需求
    │   └── Subtask            level 3  执行拆解
    ├── Task                   level 2  支撑性工作，对外行为不变
    │   └── Subtask
    └── Bug                    level 2  已交付功能不符合预期
        └── Subtask
```

父事项必须正好高一级。Story、Task 和 Bug 互为平级：Bug 不挂在 Story 下面，缺陷与它影响的需求之间是引用关系而不是归属关系，挂进去会让修缺陷的工作量算进那条需求的进度。

Epic 和 Subtask 都不进 Sprint、不估算。Epic 的进度由子项按点数聚合派生；Subtask 跟随父事项进入 Sprint，不单独计入 Velocity。

除类型外，每条工作项还带一个 `category`，说明这是哪一类工作：

| 条目类型 | category | 推荐类型 | 理由 |
|---|---|---|---|
| 功能需求（用户故事） | `feature` | Story | 有用户价值，可独立交付 |
| 非功能需求（用户可感知） | `nfr-visible` | Story | 例如"页面三秒内加载完"，用户能感受到 |
| 非功能需求（纯约束） | `nfr-constraint` | Task | 例如日志留存、合规要求，用户无感 |
| 技术债与重构 | `tech-debt` | Task | 无对外行为变化 |
| 探针（Spike） | `spike` | Task | 产出是结论而非功能 |
| 运维与迁移 | `ops` | Task | 支撑性工作 |
| 文档 | `docs` | Task | 支撑性工作 |
| 缺陷 | `defect` | Bug | 已交付功能不符合预期 |

推荐类型是创建时的默认值，团队可以改。判据是"用户是否可感知，以及能否独立交付价值"，但边界案例不做硬性校验。

Spike 不是独立类型，而是 `category` 为 `spike` 的 Task，额外带时间盒和结论字段。`labels` 与 `category` 并存，用于团队自己的切分维度，例如模块、平台或客户。

Definition of Ready 按类型配置：Story 要求验收标准与估算，Bug 要求复现步骤，Task 要求明确产出。

主要功能：

- 创建、编辑、复制和删除工作项；
- 拖拽排序；
- 搜索、筛选和保存视图；
- 设置优先级、负责人、类别、标签和估算；
- 编写描述和验收标准；
- 建立父子关系和依赖关系；
- 标记阻塞；
- 批量修改；
- 将工作项加入 planned Sprint；
- 检查 Definition of Ready。

### 4.3 Sprint 管理

- 创建和编辑 planned Sprint；
- 设置 Sprint Goal、开始日期和结束日期；
- 将 Backlog 工作项加入 Sprint；
- 检查工作量、依赖和风险；
- 启动 Sprint；
- 查看当前 Sprint；
- 结束 Sprint；
- 记录 Sprint 结果；
- 将未完成事项移回 Backlog 或转入另一个 planned Sprint；
- 查看历史 Sprint。

Sprint 状态：

```text
planned → active → closed
```

同一项目最多只能有一个 `active` Sprint。

### 4.4 Sprint 看板

默认工作流：

```text
Backlog → Todo → In Progress → Review → Done
```

其中 `Backlog` 通常在 Product Backlog 页面展示；当前 Sprint 看板主要展示：

```text
Todo → In Progress → Review → Done
```

主要功能：

- 拖拽改变状态和顺序；
- 按成员、Epic、优先级或标签筛选；
- 显示负责人、估算和阻塞状态；
- 显示 WIP 超限警告；
- 快速创建工作项；
- 打开工作项详情；
- 检测并发修改；
- 在写入失败时恢复到已确认状态。

### 4.5 工作项详情与协作

工作项详情包括：

- ID、类型、标题和描述；
- 状态和优先级；
- 负责人；
- 估算；
- Sprint；
- 父事项和子事项；
- 依赖关系；
- 标签；
- 验收标准；
- 阻塞状态和原因；
- 评论、附件和关联链接；
- 创建时间和更新时间；
- Activity；
- 可选的代码、PR、构建和测试信息。

### 4.6 Scrum 活动支持

系统可以为主要 Scrum 活动提供专门视图：

- Planning：Sprint Goal、候选事项、容量和风险检查；
- Daily Scrum：成员更新、停滞事项、阻塞和范围变化；
- Review：完成内容、目标结果、Demo 和反馈；
- Retrospective：意见收集、分组、投票和改进行动。

首个版本应优先完成 Backlog、Sprint 和看板闭环，会议辅助能力可以分阶段实现。

### 4.7 报表与洞察

基础报表包括：

- Sprint 完成率；
- Burndown 或 Burnup；
- Velocity；
- Cycle Time；
- Lead Time；
- 吞吐量；
- 阻塞时间；
- Carry-over 比例；
- Sprint Goal 达成情况；
- 缺陷趋势。

报表用于发现趋势和风险，不应将故事点、完成事项数或工时直接作为个人绩效指标。

## 5. 如何使用系统管理项目

### 5.1 初始化项目

```text
创建或打开 Harness Workspace
  → 创建或绑定 Scrum Project
  → 配置项目名称和 Key
  → 添加成员并分配角色
  → 配置估算方式和 WIP 上限
  → 创建 Product Goal
```

系统在用户首次明确创建项目、Sprint 或工作项时才写入 Scrum 数据。仅打开页面不应污染工作区。

### 5.2 建立 Product Backlog

Product Owner 收集需求并创建工作项：

```text
创建 Epic 或 Story
  → 编写描述与验收标准
  → 设置优先级
  → 建立父子和依赖关系
  → 与 Developers 共同拆分和估算
  → 调整 Backlog 排序
```

Backlog 的排序表达业务优先级，不等同于固定交付承诺。

### 5.3 进行 Sprint Planning

```text
创建 planned Sprint
  → 设置 Sprint Goal 和日期
  → 检查团队可投入能力
  → 从 Backlog 选择高优先级事项
  → 检查估算、验收标准和依赖
  → Developers 制定执行计划
  → 明确启动 Sprint
```

启动 Sprint 前，系统至少检查：

- 是否已经存在 active Sprint；
- Sprint 日期是否合法；
- Sprint 是否已经关闭；
- 工作项引用是否完整；
- 是否存在循环依赖；
- 是否存在需要用户注意的阻塞或容量风险。

### 5.4 执行 Sprint

Sprint 开始后，团队围绕 Sprint Goal 工作：

```text
领取或分配工作
  → 移入 In Progress
  → 更新进展
  → 标记阻塞
  → 提交 Review
  → 检查验收标准和完成定义
  → 移入 Done
```

Daily Scrum 用于检查 Sprint Goal，而不是逐人汇报工时。系统应重点突出：

- 阻塞时间过长的事项；
- 长时间未更新的事项；
- WIP 超限；
- Sprint 范围变化；
- 剩余工作与剩余时间的偏差；
- 可能影响 Sprint Goal 的依赖。

### 5.5 结束 Sprint

```text
检查 Done 事项
  → 检查产品增量
  → 举行 Sprint Review
  → 记录目标达成情况
  → 处理所有未完成事项
  → 关闭 Sprint
  → 举行 Retrospective
  → 创建改进行动
```

未完成事项必须明确选择：

- 移回 Product Backlog；或
- 移入指定的 planned Sprint。

系统不得静默删除、自动完成或擅自迁移未完成事项。

### 5.6 持续改进

Retrospective 产生的改进行动应具有：

- 明确的问题或改进目标；
- 负责人；
- 截止时间；
- 所属或目标 Sprint；
- 当前状态；
- 后续验证结果。

下一 Sprint 应主动展示尚未完成的改进行动。

## 6. 首个版本范围

首个可用版本优先完成以下闭环：

```text
创建工作项
  → 管理 Product Backlog
  → 创建并规划 Sprint
  → 启动 Sprint
  → 在看板中推进工作
  → 标记阻塞和完成
  → 结束 Sprint
  → 处理未完成事项
```

首个版本包括：

- 一个 Workspace 对应一个 Scrum Project；
- Epic、Story、Task 和 Bug；
- Product Backlog；
- planned、active、closed Sprint；
- Backlog、Todo、In Progress、Review、Done 状态；
- 工作项详情、估算、负责人、验收标准和依赖；
- Agent 的结构化读写；
- Revision 并发控制；
- 高影响操作确认；
- 本地持久化；
- 基础 Sprint 进度。

以下功能可以后续增加：

- 多人实时协作；
- 评论、提及和通知；
- Daily Scrum 专用视图；
- Review 和 Retrospective 会议模式；
- 路线图和 Release；
- 高级报表；
- 第三方系统同步；
- 自定义工作流；
- 企业身份、审计和合规能力。
