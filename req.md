## RQ1

Scrum Edition 的选择与展示遵循以下要求：

- Sidebar 只保留一个 Scrum 入口，不为 Community、Teams 或 Enterprise 分别设置入口。
- Workspace 尚未绑定 Scrum Project 时，页面提供“创建本地项目”和“连接团队 Scrum”两个入口。
- 不允许用户直接手动选择 Teams 或 Enterprise；远程服务通过握手和许可证确定实际 Edition。
- 当前 Edition 在 Scrum 工作台头部可见，但功能是否可用及操作行为由服务提供的 Capability 决定，不直接根据 Edition 名称分支。
- Community 项目升级到远程 Teams 或 Enterprise 服务时，必须通过显式的“迁移”流程完成，不作为普通 Edition 切换处理。
- 同一个 Harness 实例必须能够同时连接不同 Workspace；各 Workspace 可以分别使用本地 Community、远程 Teams 或远程 Enterprise。

## RQ2

Scrum 的访问授权必须与 Harness Session 或对话解绑：

- Workspace 绑定 Scrum Project 后，该 Workspace 下的所有 Session 自动按照当前用户的 Project 有效权限访问 Scrum，不再逐个配置 `off`、`read` 或 `write`。
- Session 不参与 Scrum 权限计算；不得因 Session 没有单独授权而隐藏或拒绝 Scrum 能力。
- 删除面向用户的 Session Scrum Access 控件，不再持久化 Session Access 配置。
- `sessionId` 可以作为可选的 Activity 审计信息，用于追踪操作来自哪次对话，但不能成为授权条件。
- Scrum 工具是否可用，由 Workspace 是否绑定 Project、当前用户权限、Edition Capability、Project Policy 和 Project 状态共同决定。

## RQ3

Agent 必须能够嵌入 Scrum 工作台，并遵守与用户相同的授权模型：

- 用户无需先创建或选择 Harness 对话，即可在 Scrum 工作台中使用 Agent。
- Agent 使用当前用户身份，不得使用共享管理员身份或绕过用户的 Project Roles。
- Agent 的最终权限为 Edition Capabilities、当前用户 Project Roles、Project Permission Policy、Project 状态和操作级安全策略的交集。
- 高影响操作仍须明确确认，并记录 actor、source、target 和 revision；底层存在 Session 时可以附带 `sessionId`，但 Session 不参与权限计算。

## RQ4

Community 使用隐式个人 Tenant：

- 每个创建了本地 Scrum Project 的 Workspace 对应一个个人 Tenant。
- Tenant 在首次创建 Project 时生成稳定 `tenantId`，并随 Project 持久化；重新打开 Workspace 后必须继续使用原 `tenantId`。
- Project 以下实体不重复保存 `tenantId`，统一通过 Project 推导 Tenant。
- Community 不要求用户创建、选择或管理 Tenant，也不要求单独持久化完整 Tenant 管理实体。
- Community 迁移到远程服务时，必须将本地 Tenant 和 Identity 映射到用户选择或服务分配的远程 Tenant。

## RQ5

Community 的用户、角色和权限遵循单用户模型：

- Project 创建者是唯一的本地用户和隐式 owner。
- 系统为 owner 动态合成一个 active ProjectMember，并授予全部内置角色：`product_owner`、`scrum_master`、`developer`、`stakeholder` 和 `administrator`。
- Community 不单独持久化成员记录；成员身份从 `project.createdBy` 推导。
- owner 默认获得 `scrum.core` Capability 下的全部核心 Scrum 权限。
- Community 不提供 `rbac` Capability，因此 owner 不获得 `member.manage`，也不能邀请成员或编辑角色。
- Scrum 界面不向 Community 用户显示可编辑的成员与角色管理页面；可以显示只读的“个人项目 / 本地 Owner”说明及“迁移到团队服务”入口。

## RQ6

Teams 和 Enterprise 的成员与角色管理界面遵循 Capability 和 Permission 控制：

- 远程服务提供 `rbac` Capability 时，Project Settings 显示 Members & Roles 页面。
- 拥有 `member.manage` 的用户可以邀请、停用成员并分配角色；其他用户最多只能查看自己的角色和有效权限。
- Teams 至少支持内置 Project Roles；Enterprise 可以由远程服务扩展自定义角色、用户组、组织策略和权限来源说明。
- UI 的显示或禁用不能替代服务端校验，所有成员及角色变更必须由远程服务重新授权。

## RQ7

系统发布以下内置 Project Roles：

- `product_owner`：管理产品价值、Backlog 优先级、验收标准和验收结果。
- `scrum_master`：促进 Scrum 流程，管理 Sprint 生命周期、阻塞和持续改进。
- `developer`：估算和完成 Sprint 工作，更新状态并处理阻塞。
- `stakeholder`：查看项目与交付结果并提交建议，默认不修改 Sprint 工作。
- `administrator`：管理项目配置、成员、角色和项目生命周期；它是系统角色，不是 Scrum 官方角色。

一个成员可以同时拥有多个角色，角色授权采用并集，再与 Capability、Project Permission Policy、Project 状态和操作级安全策略求交集。

系统发布的 Permission 分为：

- 查看：`project.view`、`backlog.view`、`report.view`。
- Work Item 与 Backlog：`workItem.write`、`backlog.prioritize`、`workItem.estimate`、`workItem.setAcceptanceCriteria`、`workItem.updateOwnStatus`、`workItem.updateAnyStatus`、`workItem.setBlocked`、`workItem.accept`、`workItem.suggest`。
- Sprint：`sprint.create`、`sprint.setGoal`、`sprint.assignWorkItems`、`sprint.transition`。
- 团队流程：`retrospective.manage`。
- 项目管理：`member.manage`、`project.configure`、`project.archive`。

其中 `member.manage` 必须要求 `rbac` Capability；其余当前已发布权限属于 `scrum.core` Capability。
