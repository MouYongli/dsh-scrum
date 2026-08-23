# 系统架构

## 1. 仓库职责

本仓库只包含被 Community 或 DeepSeek Harness Bundle 组合的 `packages/`：共享 Core、公共 Contract、UI、Harness 集成、本地 Adapter 和远程客户端 Adapter。

因此：

- Community 完全运行在 Harness Host 中，不需要独立 Server。
- Teams/Enterprise 服务端及 Admin App 位于独立的 `dsh-scrum-server` 项目。
- 本仓库不得新增 `apps/scrum-server`、`packages/server/` 或商业身份与治理实现。
- 两个项目只通过已发布的版本化 Contract 协作，不依赖相邻 Checkout 或彼此的内部源码。

## 2. 运行拓扑

### Community

```text
DeepSeek Harness
└─ Scrum Bundle
   ├─ Harness Client
   ├─ Harness Host
   ├─ Agent Tools
   ├─ Application / Domain
   └─ Workspace File Adapter
      └─ <workspace>/.scrum/
```

### Remote

```text
DeepSeek Harness
└─ Scrum Bundle
   ├─ Harness Client
   ├─ Harness Host
   ├─ Agent Tools
   └─ Remote API Adapter
           │
           ▼
     External dsh-scrum-server
     ├─ HTTP API / Realtime
     ├─ Application / Domain
     ├─ Identity / Policy
     ├─ Audit / Notification
     └─ Server Storage
```

## 3. 推荐目录

```text
dsh-scrum/
├─ packages/
│  ├─ core/
│  │  ├─ scrum-domain/
│  │  └─ scrum-application/
│  ├─ api/
│  │  └─ scrum-api-contract/
│  ├─ ui/
│  │  └─ scrum-ui/
│  ├─ harness/
│  │  ├─ scrum-harness-host/
│  │  ├─ scrum-harness-client/
│  │  ├─ scrum-agent-tools/
│  │  └─ scrum-harness-bundle/
│  ├─ adapters/
│  │  ├─ adapter-storage-workspace-files/
│  │  ├─ adapter-remote-api/
│  │  ├─ adapter-identity-personal/
│  │  └─ adapter-audit-local/
│  └─ editions/
│     └─ edition-community/
├─ docs/
├─ scripts/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.json
```

远程服务的目录、存储和部署设计属于 `dsh-scrum-server`，不在本仓库复制。

## 4. 模块职责

### `scrum-domain`

纯领域模型和规则：Project、Sprint、Backlog、Work Item、Workflow、Comment、Activity、Role 和 Permission。不依赖 Harness、React、HTTP 或存储。

### `scrum-application`

实现 Create Project、Start Sprint、Move Work Item、Bind Workspace 等用例，并定义 Repository、Identity、Audit、Notification 和 Entitlement Port。

### `scrum-api-contract`

定义请求/响应 DTO、Schema、错误码、实时事件和 API 版本。不能直接把可变 Domain Entity 当作远端 DTO。

### `scrum-ui`

版本无关的 Backlog、Sprint Board、详情、报表和设置组件。它通过 Props/Client Interface 获取数据，不直接访问文件或网络。

### `scrum-harness-host`

运行在 Harness Host 中，读取 Workspace/Session，管理绑定，选择 Local Community Gateway 或 Remote Gateway，并向 Client 暴露 Host API。

### `scrum-harness-client`

运行在浏览器，注册 Sidebar Scrum 按钮和 Scrum 主页面，处理 Workspace 选择、项目创建/绑定及 UI 状态。

### `scrum-agent-tools`

提供 Scrum 查询和写入 Tool，根据 Workspace 绑定和当前用户有效权限控制 Tool 可见性及执行权限。

### `scrum-harness-bundle`

DeepSeek Harness 的最终安装包和 Composition Layer，组合 Host、Client、Tools、Community 与 Remote Connector。它是唯一对外可安装单元：Profile 的 patch 只写 Bundle 一行，Host 与 Client 两个半边由 Bundle re-export，内部包从 Profile 解析不到。三包分层只在工作区内部成立，机制与坑位见[开发指南](dsh-dev-guide.md)第 4.3 节和 [Harness 兼容矩阵](harness-compatibility.md)第 3 节。

### Adapters

- `adapter-storage-workspace-files`：Community 的 `.scrum/` JSON/JSONL 存储。
- `adapter-remote-api`：Harness Host 连接符合 Contract 的外部服务。
- `adapter-identity-personal`：Community 的隐式个人身份。
- `adapter-audit-local`：Community 本地 Activity 记录。

### Runtime composition

插件只区分数据来源，不在客户端组合商业 Edition：

```text
local
├─ workspace file storage
└─ personal identity

remote
├─ remote API adapter
├─ credential provider port
└─ server-provided principal and capabilities
```

Host 不在 Bundle 启动时把整个 Harness 固定到一个 Runtime。每个请求先读取当前 Workspace，
再由 `WorkspaceRuntimeResolver` 返回该 Workspace 的 `local` 或 `remote` Target 及 Runtime。
因此同一个 Harness Instance 可以同时打开本地、Teams 和 Enterprise Workspace。Remote Target
只保存 `connectionId` 与远端 `projectId` 等非敏感引用；令牌和其他凭证由独立 Credential
Provider 管理，不写入 Workspace 的 `.scrum/`。

## 5. 远程服务边界

远程服务负责身份、租户隔离、最终授权、服务端存储、同步、审计、通知和商业 Capability。插件负责连接配置、协议校验、凭证引用、错误映射、幂等重试和 UI/Agent 的能力降级。

连接时先完成版本化握手，获取服务版本、支持的 API 版本、当前 Principal 和 Capability。插件不能根据 Endpoint、产品名称或客户端布尔值推断 Teams/Enterprise 权限。

远程连接 Profile 保存在 Harness 的全局配置中，包含服务 Endpoint 与 Credential Provider
引用；认证材料只在请求时由 Provider 取出。Workspace 的 `.scrum/remote.json` 只保存
`connectionId` 和已授权的远端 `projectId`。连接流程先握手取得许可证 Edition、Tenant、
Principal 与 Capability，再读取该 Principal 可访问的 Project 列表；只有列表中的 Project
可以写入绑定。未知 Capability 可以通过握手，但在当前客户端中保持不授予状态。

认证、协议兼容、网络和授权错误在 Adapter 中分类。跨 Host/Client Contract 时只传安全的
分类与通用文案，不转发可能包含 Endpoint、路径或认证信息的底层异常。

## 6. 依赖方向

```text
harness bundle
├─ community composition
├─ remote adapter
├─ ui
└─ application
   └─ domain
```

禁止：

```text
domain      → adapter
domain      → ui
application → composition
ui          → workspace filesystem
ui          → remote network
plugin      → external server source
```

## 7. 领域与数据架构

所有版本共享同一个领域核心和数据 Schema。领域核心不依赖 JSON/JSONL、PostgreSQL、身份提供方、Harness UI、HTTP、WebSocket 或 Edition 名称。

### 7.1 概念关系

```text
Tenant
└── Scrum Project
    ├── Project Member
    │   └── Project Role
    ├── Product Goal
    ├── Work Item
    │   ├── Acceptance Criterion
    │   ├── Parent / Child
    │   ├── Dependency
    │   ├── Comment
    │   └── Activity
    ├── Sprint
    │   └── Sprint Goal
    └── Project Configuration

Harness Instance
└── Workspace
    ├── Workspace Project Link
    └── Session
        └── Optional Activity Provenance
```

共享领域对象包括 Tenant、Scrum Project、Product Goal、Product Backlog、Work Item（Epic、Story、Task、Bug、Subtask）、Sprint、Sprint Goal、Workflow、Acceptance Criteria、Definition of Ready、Definition of Done、Comment、Activity、Project Role 和 Permission。Feature 与 Spike 不是独立的领域对象：前者由 Epic 与 Story 的层级表达，后者是 `category` 为 `spike` 的 Task，见 7.5。

### 7.2 Tenant

Tenant 是数据和权限的顶层边界：

```text
scrum_tenant
  id
  edition                  // community | teams | enterprise
  name
  owner_identity_id
  created_at
  updated_at
```

Community 自动创建隐式个人 Tenant；Teams 和 Enterprise 使用组织 Tenant。Community 保留同一套 Tenant 与 Identity 概念，而不是把它们省掉，以便共享 Schema、导入导出和迁移。

但 Tenant 归属只由 `scrum_project.tenant_id` 表达一次。Project 之下的实体经 project 派生 Tenant，不各自再存一份——见 7.4 的说明。

### 7.3 Scrum Project

```text
scrum_project
  id
  tenant_id
  key
  name
  description
  status                   // active | archived
  created_by
  created_at
  updated_at
  revision
```

`revision` 用于乐观并发控制，每次成功写入后单调递增。

### 7.4 Project Member 与角色

```text
project_member
  id
  project_id
  identity_id
  roles                    // 多个 Project Role
  status                   // active | suspended
  created_at
  updated_at
  revision
```

角色可以是 `product_owner`、`scrum_master`、`developer`、`stakeholder` 或 `administrator`。同一成员可以拥有多个角色。停用成员保留角色但不再授予任何权限，以便历史记录和指派仍可解析。

成员不重复保存 `tenant_id`：Tenant 经 project 派生，重复保存等于给「这个成员属于哪个 Tenant」留下第二个答案，其中一次写入失败它们就会分叉。同理，`joined_at` 就是 `created_at`，不另设字段。

Community 不落成员文件。本地用户的 `IdentityId` 只出现在 `project.json` 的 `createdBy` 和 Tenant 的 `ownerIdentityId` 里；唯一成员由存储层按「owner 持有全部五个角色」在内存中合成。这样 Community 不需要一个永远只有一行的文件，权限矩阵对它也照常生效——owner 不是豁免权限检查，而是恰好满足其版本能力允许的全部检查。迁移到 Teams 时再补一次真实成员表。

### 7.5 Work Item

```text
work_item
  id                       // 即 SCR-12，本身就是人类可读的 Key
  project_id
  type                     // epic | story | task | bug | subtask
  level                    // 1 | 2 | 3，由 type 唯一决定，显式落盘
  category                 // null | feature | nfr_visible | nfr_constraint
                           // | tech_debt | spike | ops | docs | defect
  title
  description
  status                   // backlog | todo | in_progress | review | done
  resolution               // null | done | wont_fix | duplicate | cannot_reproduce
  priority                 // low | medium | high | critical
  assignee_id
  reporter_id
  estimate                 // level 1 与 level 3 恒为 null
  sprint_id                // level 1 与 level 3 恒为 null
  parent_id
  depends_on               // Work Item ID 列表
  rank                     // 仅 level 2 参与 Backlog 排序
  blocked_reason           // null 表示未阻塞
  labels
  acceptance_criteria
  type_details             // 类型特有字段，见本节末
  created_at
  updated_at
  revision
```

`id` 已经是 `SCR-12` 这样的可读 Key，不再另设 `key` 字段。阻塞只存 `blocked_reason`，`blocked` 由它派生——两个必须保持一致的字段最终一定会不一致，而「已阻塞但没有原因」正是不允许出现的状态。工作项同样不重复保存 `tenant_id`。

#### 层级

`type` 决定 `level`，`level` 决定结构：

```text
level 1   epic
level 2   story | task | bug
level 3   subtask
```

父子关系只有一条规则：`parent.level = self.level - 1`。Epic 不得有父事项，Subtask 必须有父事项，level 2 事项的父事项可以为空。

`level` 由 `type` 唯一决定，之所以仍然落盘，是为了让父子校验、视图投影和聚合查询只依赖一个整数，而不是各自重新展开类型枚举。将来在 Epic 之上追加层级时，这些位置都不需要改动。

level 2 的三个类型互为平级。Bug 不是 Story 的子项：缺陷与它所影响的需求之间是引用关系而不是归属关系，把 Bug 挂进 Story 会让缺陷的工作量并入需求的进度，缺陷统计随之失真。Bug 与 Story、Task 一样可以拥有 Subtask。

Epic 不进入 Sprint，也不独立估算。它的估算与进度一律由子项聚合派生，进度按点数计算，未估算的子项按 0 计入分母。Epic 跨越多个 Sprint，给它一个自己的 `sprint_id` 会让「这件事在哪一轮交付」出现两个互相矛盾的答案。

Subtask 既不持有 `sprint_id` 也不持有 `estimate`。它表达一条 level 2 事项的执行拆解，不表达可独立交付的价值；若允许它独立估算，同一份工作会在父子两级各计一次，Velocity 随拆解粒度虚增。

这是 8.4 中「Sprint 归属只由 `sprint_id` 表达」的唯一例外：查询某个 Sprint 的成员时，level 3 事项按其父事项的 `sprint_id` 派生，不读自身字段。选择派生而不是冗余存储，是因为冗余的那一份迟早会与父项分叉，而移动父项时级联重写全部子项文件又违背「移动一条事项只写一个文件」。

#### 三个正交维度

`type`、`category` 和 `labels` 各自回答不同的问题，不得互相替代：

| 维度 | 取值 | 回答的问题 |
|---|---|---|
| `type` | 五个枚举值 | 这条事项在层级中的位置，以及它有哪些特有字段 |
| `category` | 八个枚举值或 `null` | 这是哪一类工作 |
| `labels` | 自由字符串 | 团队自己的切分维度，例如模块、平台、客户 |

`category` 必须是受控枚举而不是自由标签。「本轮 Sprint 有多少点花在技术债上」这类问题要求取值集合封闭且跨项目可比，自由标签给不出可靠答案。

`null` 表示没有人分类过，是一个允许出现的取值。给未分类的事项一个默认类别，等于用猜测填充上面那个统计口径；报一个更小的数字并同时报出「还有多少条没分类」，比报一个掺了猜测的数字更有用。

创建事项时 `category` 推荐一个 `type`，但不强制：

| category | 推荐 type |
|---|---|
| `feature`、`nfr_visible` | `story` |
| `nfr_constraint`、`tech_debt`、`spike`、`ops`、`docs` | `task` |
| `defect` | `bug` |

推荐的判据是「用户是否可感知，以及能否独立交付价值」。它只是引导：边界案例（例如「页面三秒内加载」）在不同团队会落到不同一侧，把它变成硬校验，只会把一次团队约定变成一个填不下去的表单。

Spike 是 `category` 为 `spike` 的 `task`，不是第六个类型。类型枚举承载的是层级和字段结构；为一个只多出两个字段的语义分类新增类型，会让每一处类型判断和每一个类型选择器都多出一个分支。

#### 状态与结果

`status` 表达流转位置，`resolution` 表达结束方式，两者分开保存：

```text
status      backlog | todo | in_progress | review | done
resolution  null | done | wont_fix | duplicate | cannot_reproduce
```

未到达 `done` 的事项 `resolution` 恒为 `null`；`status` 为 `done` 时 `resolution` 必须有值，缺省为 `done`。

「不修了」「重复」「无法复现」是结束方式而不是流转位置。把它们做成状态，看板就要为每一种各开一列，而且每个类型都需要一套自己的状态机；分开之后全部类型共用同一套状态机，报表按 `resolution` 区分真正完成与其他终态。

#### 类型特有字段

通用字段之外，各类型另有自己的字段，存在 `type_details` 下，随事项文件在同一个 `revision` 下原子写入：

| type | 特有字段 |
|---|---|
| `epic` | `color` |
| `story` | 无（`acceptance_criteria` 是通用字段） |
| `task` | 仅当 `category` 为 `spike`：`timebox`、`outcome` |
| `bug` | `severity`、`steps_to_reproduce`、`expected`、`actual`、`environment`、`affected_version`、`is_regression`、`root_cause` |
| `subtask` | 无 |

`severity` 与 `priority` 分开：严重度描述缺陷本身的影响，优先级描述排期意图，一个影响面很窄却阻塞发布的缺陷，两者取值并不相同。

Spike 的 `outcome` 是它的完成定义。探针交付的是结论而不是可用功能，没有 `outcome` 的 Spike 无法判断是否做完；`timebox` 则保证它不会无限延长。

Definition of Ready 按类型配置，规则存于 Project Configuration，不硬编码在领域层：Story 要求验收标准与估算，Bug 要求复现步骤，Task 要求明确产出。

#### 子模型

相关子模型包括：

```text
work_item_label
work_item_dependency
acceptance_criterion
comment
attachment
external_link
```

依赖关系不允许工作项依赖自身、形成依赖环或引用不存在的事项；父子关系同样不得形成循环。

### 7.6 Sprint

```text
sprint
  id
  project_id
  name
  goal
  status                   // planned | active | closed
  start_date               // 约定的时间盒
  end_date
  started_at               // 实际开启与关闭的时刻
  closed_at
  result_summary
  created_by
  created_at
  updated_at
  revision
```

计划日期和实际时间戳分开保存：合并它们会让「延期交付」被悄悄改写成「按时交付」。Sprint 同样不重复保存 `tenant_id`。

同一 Project 最多有一个 active Sprint。closed Sprint 不再接收新事项；结束 Sprint 时必须处理所有未完成事项；Done 事项可以保留原 Sprint 引用用于历史统计。

#### 承诺基线与每日剩余

「Sprint 启动之后加进来了什么」和「燃尽图从哪一点起算」都要求知道启动那一刻承诺了哪些事项、合计多少点。这个事实无法事后重建：一条现在属于某个 Sprint 的事项，从当前数据看不出它是启动时就在其中，还是后来加进去的。

它也推不出来。`scrum_activity` 记录 `action`、`target` 和前后 `revision`，不记录字段取值，所以它能回答「谁在什么时候把这条事项排进了这个 Sprint」，却回答不了「当时它估了几点」。

因此单独保存一份只追加的 Sprint 进度记录：

```text
sprint_progress_entry
  sprint_id
  kind                     // baseline | daily
  recorded_at
  item_ids                 // 仅 baseline
  total_points             // baseline 为承诺点数
  remaining_points
  completed_points
  unestimated_count
```

启动 Sprint 时写入唯一一条 `baseline`，此后每天追加一条 `daily`，两类记录写入后都不再修改。

这份记录不是 Sprint 的成员列表，也不并入 `sprint` 实体：成员关系仍然只由工作项的 `sprint_id` 表达。基线描述的是过去某一时刻的事实而非当前归属，两者不会互相矛盾——基线不随事项进出而更新，这正是它的用处。

由它派生：范围变化是当前成员集合与 baseline `item_ids` 的差集，进出双向都能说明；燃尽曲线的起点是 baseline 的 `total_points`，其余的点来自 daily 记录。

Sprint 的当前进度仍然由工作项现算，不读这份记录；这份记录只服务于需要历史时点的报表。

## 8. Harness 绑定与活动模型

### 8.1 Workspace Project Link

```text
harness_workspace_link
  id
  tenant_id
  harness_instance_id
  harness_workspace_id
  scrum_project_id
  workspace_path_fingerprint
  linked_by
  linked_at
  last_verified_at
```

核心约束：

```text
UNIQUE(harness_instance_id, harness_workspace_id)
```

它保证一个 Harness Workspace 最多绑定一个 Scrum Project。如果业务要求一个 Scrum Project 最多绑定一个 Workspace，可以增加 `UNIQUE(scrum_project_id)`，但不建议默认增加；Teams 和 Enterprise 可能需要多个开发环境访问同一个远端项目。

### 8.2 Session Activity Context

```text
scrum_activity_context
  harness_instance_id
  harness_session_id
  harness_workspace_id
  scrum_project_id
```

核心约束：

```text
UNIQUE(harness_instance_id, harness_session_id)
```

该上下文只用于 Activity 追踪，可以在操作发生时从当前 Workspace Link 和调用来源生成，无需独立持久化。Session ID 可以为空且不参与授权。每次操作仍应验证 Workspace 和当前绑定是否一致。权限计算见 [DSH 开发指南](dsh-dev-guide.md#9-workspace-与-agent-授权)。

### 8.3 Activity

```text
scrum_activity
  id
  tenant_id
  project_id
  actor_identity_id
  source                   // ui | agent | api | automation | system
  harness_instance_id      // 可为空
  harness_session_id       // 可为空
  action
  target_type
  target_id
  before_revision
  after_revision
  created_at
```

Activity 用于回答谁修改了数据、修改来自哪个入口和 Session，以及操作影响了哪个对象版本。

`system` 表示没有任何人直接发起的变更，例如恢复流程或 Schema 迁移。它必须能与用户操作区分开，否则工具自身的修复会被记到当时打开 Workspace 的那个人头上。取值由 `scrum-application` 发布，Adapter 只能写其中的子集。

### 8.4 核心数据不变量

系统必须保证：

- 所有实体 ID 稳定、唯一且不复用。
- Project Revision 单调递增。
- 一个 Project 最多有一个 active Sprint。
- 所有引用必须指向存在且兼容的实体。
- 父子关系和依赖关系不得成环，且父子必须相邻一级：`parent.level = self.level - 1`。
- Epic 与 Subtask 的 `sprint_id` 和 `estimate` 恒为 `null`；Subtask 的 Sprint 归属由父事项派生。
- `status` 未到 `done` 的事项 `resolution` 恒为 `null`；`status` 为 `done` 的事项 `resolution` 必须有值。
- `backlog` 状态的事项不能属于 active Sprint。
- active Sprint 中未完成事项只能处于 `todo`、`in_progress` 或 `review`。
- 批量操作具有原子性，任一子操作失败则全部不写入。
- 并发冲突不得静默覆盖。
- 删除被引用事项前必须先处理引用。
- 高影响操作必须经过确认并记录 Activity。

## 9. 数据权威与版本存储

权威数据按职责分离：

```text
Scrum Store    = Project、Sprint 和 Work Item 的权威状态
Session Log    = Agent 对话、工具调用和操作结果
Activity Log   = 操作者、来源、动作及资源版本
```

Community 的权威副本位于 Workspace 的 `.scrum/`；Remote 模式的权威副本位于外部服务。两种模式共享业务语义和版本化 API Contract，但外部服务不导入本仓库未发布的内部模块。

### 9.1 Community

- 全部业务数据保存在用户本机，不要求登录。
- 使用个人 Identity 和个人 Tenant。
- 一个实体使用一个 JSON 文件，追加历史使用拆分的 JSONL。
- 使用 Revision、原子重命名、文件锁和 Operation Journal 检测冲突并支持恢复。
- 必须提供备份、导出和恢复能力。
- 导出格式与远程导入 Contract 一致。

### 9.2 Remote

```text
Local Harness Plugin
        │
        │ Authenticated API
        ▼
Compatible Remote Scrum Service
├─ PostgreSQL
├─ Realtime Event Stream
├─ Identity / RBAC
├─ Notification Worker
└─ Audit Storage
```

- 权威数据位于团队服务端。
- 本地只保存项目绑定、会话授权和可丢弃缓存。
- 多个用户可以共享同一个 Backlog 和 Sprint；具体商业能力由远程服务声明。
- Agent 使用当前登录用户身份，不能使用共享管理员身份。
- 所有写操作包含用户身份、Session ID 和预期 Revision。
- 服务端发布实时变更事件。

### 9.3 Commercial service responsibilities

```text
Harness Nodes
        │
        ▼
External Scrum Platform
├─ PostgreSQL / 企业数据库
├─ SSO / SCIM
├─ Policy Engine
├─ Audit Store
├─ Encryption / KMS
├─ HA / Backup
└─ Data Residency Controls
```

Teams 与 Enterprise 的身份、策略、审计、部署和合规实现全部属于外部项目。本仓库只消费它公开的 Principal、Permission、Capability 和业务资源 Contract。

## 10. Community JSON/JSONL 存储

### 10.1 决策与目录

Community 的 Scrum 权威数据直接存放在绑定 Workspace 的 `.scrum/` 目录中，不使用 SQLite，也不需要独立 Server。

```text
Workspace 中没有 .scrum/project.json → 未绑定 Scrum Project
Workspace 中存在有效 project.json   → 已绑定一个 Scrum Project
```

```text
<workspace>/.scrum/
├─ project.json
├─ config.json
├─ work-items/
│  ├─ SCR-1.json
│  └─ SCR-2.json
├─ sprints/
│  ├─ sprint-1.json
│  └─ sprint-2.json
├─ comments/
│  ├─ SCR-1.jsonl
│  └─ SCR-2.jsonl
├─ sprint-progress/
│  └─ sprint-1.jsonl
├─ activities/
│  └─ 2026-08.jsonl
├─ operations/
│  └─ pending/
├─ attachments/
└─ backups/
```

### 10.2 文件职责

`project.json` 是项目身份和存储入口，字段与 7.3 的 `scrum_project` 一一对应：

```json
{
  "schemaVersion": 1,
  "projectId": "prj_01K...",
  "tenantId": "tnt_01K...",
  "edition": "community",
  "key": "SCR",
  "name": "shop-service",
  "description": "",
  "status": "active",
  "createdBy": "idt_01K...",
  "revision": 1,
  "createdAt": "2026-08-20T10:00:00Z",
  "updatedAt": "2026-08-20T10:00:00Z"
}
```

实体的主键字段一律叫 `id`，只有项目文件把自己的主键写成 `projectId`，以便和文件里出现的其他实体 ID 区分。这一处映射由领域包的契约测试钉死，不允许两侧各自演化。

`edition` 只是持久化标签，用于导出和迁移时识别数据来源。任何领域规则都不得基于它分支，行为差异一律由 Capability 决定，规则见[版本设计](../product/editions.md)第 6 节。

`config.json` 保存工作流、估算方式、Sprint 周期、Definition of Done 和本地显示设置，不能保存敏感凭证。

每个 `work-items/<id>.json` 保存一个工作项：

```json
{
  "schemaVersion": 1,
  "id": "SCR-12",
  "projectId": "prj_01K...",
  "type": "story",
  "title": "用户使用优惠券",
  "description": "",
  "status": "in_progress",
  "priority": "medium",
  "assigneeId": null,
  "reporterId": "idt_01K...",
  "estimate": null,
  "sprintId": "sprint-12",
  "parentId": null,
  "dependsOn": [],
  "rank": "i",
  "blockedReason": null,
  "labels": [],
  "acceptanceCriteria": [],
  "revision": 8,
  "createdAt": "2026-08-20T10:00:00Z",
  "updatedAt": "2026-08-20T12:00:00Z"
}
```

Sprint 成员关系只由 `sprintId` 表达，Sprint 文件不重复保存 Work Item ID 列表。

每个 `sprint-progress/<sprint-id>.jsonl` 只追加，保存 7.6 的承诺基线和每日剩余：首行是启动时写入的 `baseline`，此后每天一条 `daily`。它记录的是历史时点，不是成员关系，因此不与上一条冲突；当前进度仍然由工作项现算。

`rank` 用 Fractional Indexing：字符集是数字加小写字母，按字符串直接比较即为 Backlog 顺序，任意两个 rank 之间总能取到新值，因此一次拖拽只重写被拖动的那一个文件，也不存在需要重排整个 Backlog 的时刻。代价是反复拖进同一个间隙会让 rank 逐字符变长，由长度上限兜住。不使用 LexoRank 的 `0|` 桶前缀：那个前缀的用途正是支持重排，而这里不需要重排。

阻塞只存 `blockedReason`，不再存一个可从它派生的 `blocked` 布尔值：两个必须保持一致的字段最终一定会不一致，而 `blocked` 为真却没有原因正是不允许出现的状态。

- `sprints/<id>.json`：保存 Sprint Goal、状态、日期和 Revision，不重复保存可从 Work Item 派生的数据。
- `comments/<work-item-id>.jsonl`：每行一条不可变 Comment Event；编辑或删除通过追加更正事件表达。
- `activities/<yyyy-mm>.jsonl`：按月拆分的 Activity，记录 Actor、UI/Agent 来源、Session ID、Action、Target 和 Revision。

## 11. 写入安全与一致性

### 11.1 单 JSON 文件

1. 读取当前 Revision。
2. 校验调用方的 `expectedRevision`。
3. 将新内容写入同目录临时文件。
4. 刷新内容。
5. 原子重命名覆盖目标文件。
6. 追加 Activity。

Revision 不匹配时返回 Conflict，调用方必须重新读取，不能覆盖。

### 11.2 JSONL

- 所有追加通过 Workspace 级 Write Coordinator。
- 多进程访问时使用文件锁。
- 每行包含稳定 Event ID 和完整时间戳。
- 读取时允许识别并隔离崩溃产生的不完整末行，但不能静默删除已确认记录。

### 11.3 多文件操作

多实体更新先创建 `operations/pending/<operation-id>.json`，记录预期 Revision 和计划步骤。全部完成后写入 Commit 标记并清理；启动时扫描 Pending Operation，并按操作类型完成或回滚。

应通过数据模型减少多文件事务。例如移动 Work Item 到 Sprint 只更新 Work Item 的 `sprintId`，不同时修改 Sprint 的成员列表。

### 11.4 并发模型

- 一个 Harness Host 内使用内存 Write Queue 串行化写入。
- 多个 Host 访问同一 Workspace 时使用 Workspace 文件锁。
- Entity Revision 负责发现过期读取。
- Project Revision 或专用全局锁保护“只能有一个活动 Sprint”等跨实体约束。
- UI 与 Agent 使用同一个 Application Service 和 Storage Adapter，不能绕过冲突检测直接写文件。

通用写入流程：

```text
读取当前 Revision
  → 提交 expectedRevision
  → 检查角色和 Session 权限
  → 验证领域规则
  → 应用完整操作
  → 持久化
  → Revision + 1
  → 记录 Activity
```

如果当前 Revision 与 `expectedRevision` 不一致，系统拒绝写入。Agent 重新读取后根据变化决定是否重试，必要时请求用户确认，不能自动覆盖最新内容。

## 12. Git、Schema 与查询

### 12.1 Git 策略

JSON/JSONL 允许用户选择将 Scrum 数据纳入 Git，初始化向导应明确询问：

- **本地私有**：将整个 `.scrum/` 加入根 `.gitignore`。
- **Git 协作**：提交 JSON/JSONL，忽略临时文件、锁和备份。

建议 `.scrum/.gitignore`：

```gitignore
*.tmp
*.lock
operations/pending/
backups/
```

临时文件用 `*.tmp` 后缀而不是 `.tmp-*` 前缀：前缀形式写出来的名字仍以 `.json` 结尾（`.tmp-SCR-1.json`），会被目录扫描当成一个工作项读进去。后缀形式保证它永远不以 `.json` 结尾，扫描无需知道写入机制就会跳过它。

`workspace.lock` 是一个目录 —— 创建它这件事本身就是加锁，因为 `mkdir` 要么成功要么失败，中间没有窗口。

若进入 Git，合并后必须运行完整性校验，检查重复 ID、无效引用、Revision 回退和同时存在多个活动 Sprint。

### 12.2 Schema 与迁移

- 每个文件包含 `schemaVersion`。
- Migration 必须可重复执行，并在修改前创建 Backup。
- 迁移通过同样的原子写入和 Operation Journal 完成。
- 未知的新 Schema Version 必须拒绝写入，避免旧插件损坏新格式。
- Community 迁移到远程服务时上传一致性校验后的项目快照和 JSONL 历史，不依赖 Harness Session Log 重建。

Community 迁移到远程服务的步骤：

1. 在远程服务创建或选择 Tenant。
2. 上传本地项目快照。
3. 服务端重新生成或映射全局 ID。
4. 保留旧 ID 到新 ID 的迁移映射。
5. 迁移 Activity，并将原始 Actor 标记为本地个人身份。
6. 将 Workspace Link 指向服务端 Project ID。
7. 验证完成后，将本地项目切换为只读备份。

### 12.3 索引与查询

初期扫描 JSON 并构建内存索引。索引是可丢弃的派生数据，不是权威数据。项目增长后，可以在 `.scrum/cache/` 生成索引文件，但必须能从 JSON/JSONL 完整重建；查询层不能把 Cache 当作事实来源。

### 12.4 存储边界

- `.scrum/` 不保存账号密码、Token、SSO 凭证或企业密钥。
- Attachment 使用相对路径，不能把 Workspace 外的绝对路径作为唯一来源。
- Remote 模式的本地 `.scrum/` 只允许保存非敏感绑定声明、凭证引用和可丢弃缓存。

## 13. 架构组合规则

应用层依赖 Port，不直接依赖具体基础设施：

```ts
interface ProjectRepository {}
interface WorkItemRepository {}
interface IdentityProvider {}
interface AuthorizationService {}
interface AuditWriter {}
interface NotificationService {}
interface RealtimePublisher {}
interface EntitlementService {}
```

不同运行模式提供不同组合：

```text
Community
├─ LocalIdentityProvider
├─ WorkspaceFilesRepository
├─ LocalAuditWriter
└─ NoopRealtimePublisher

Remote
├─ RemotePrincipalProvider
├─ RemoteApiRepository
├─ CredentialProvider
└─ RemoteCapabilityProvider
```

Community 组合不包含领域规则，只声明本地 Capability 和 Adapter。Remote Capability 来自服务端握手；模式判断不能散落在 Domain 或 React 组件中。具体授权规则见[版本设计](../product/editions.md)。

## 14. 发布产物

建议至少发布：

```text
@dsh-scrum/scrum-harness-bundle   Harness Bundle
@dsh-scrum/scrum-api-contract     公开的远程协议 Contract
```

`scrum-api-contract` 必须使用 SemVer 发布，并同时产出机器可读 Schema。其他内部包默认保持私有；若外部项目确需复用 Core，必须先通过独立 ADR 明确公共 API、版本和弃用策略，不能通过相邻 Checkout 直接引用。
