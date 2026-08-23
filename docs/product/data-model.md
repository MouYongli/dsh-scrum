# Scrum 数据模型导读

> 状态：初稿

本文把这个插件里的数据模型讲给第一次接触它的人：系统里有哪些东西、它们之间怎么关联、每样东西存了哪些字段、这些数据在磁盘上长什么样。阅读它不需要事先了解 Scrum，也不需要读过代码。

本文不是规范。字段、约束和存储规则的权威来源是[系统架构](../development/architecture.md)第 7、10、11 节；两者冲突时以那里为准。本文只负责把同一套模型讲得能被读懂，因此会解释"为什么这样设计"，而规范只陈述"设计是什么"。

## 1. 阅读顺序

全文按三个递进的层次组织：

- 第 2 至 3 节是概念层：系统里有哪些东西，以及所有东西共有的性质；
- 第 4 至 8 节是字段层：每个实体存了哪些字段，取值范围是什么，状态怎么流转；
- 第 9 节是文件层：这些数据在磁盘上的实际形态。

只想建立整体印象的读者读完第 2 节即可；要查某个字段的含义可以直接跳到对应实体那一节；第 10 节是常见疑问的速查。

## 2. 五分钟建立整体印象

### 2.1 一块工作板

把这个系统想象成一块挂在墙上的工作板：

```text
Project    一块工作板，对应一个正在做的产品或项目
Work Item  板上的一张卡片，写着一件要做的事
Sprint     一段固定长度的时间盒，通常一到四周
Backlog    还没被排进任何一轮 Sprint 的卡片，按先做后做的次序竖着排
```

团队从 Backlog 顶部取一批卡片放进当前 Sprint，在 Sprint 期间把它们做完，Sprint 结束时清点结果，然后开始下一轮。这就是 Scrum 的基本循环，产品侧的完整描述见 [Scrum 产品设计](scrum.md)。

### 2.2 全文最重要的一句话

**Backlog 不是一张表，不是一个文件，也不是一个实体。**它是 `sprintId` 为空的 Work Item 的集合。

系统里没有任何地方存着"Backlog"这个东西。一条工作项要么写着自己属于某个 Sprint，要么这一栏是空的；所有这一栏为空的工作项，按 `rank` 字段排好序，就是 Backlog。把一条工作项排进 Sprint，做的事情就是给它的 `sprintId` 填上值；把它退回 Backlog，做的事情就是把这一栏清空。

这样设计的直接好处是：Sprint 和 Backlog 不可能互相矛盾。如果 Sprint 那边也存一份成员列表，那么"这条工作项在不在这个 Sprint 里"就有了两个答案，其中一次写入失败它们就会分叉。现在只有一个答案，而且移动一条工作项只需要改一个文件。

### 2.3 实体全景

```text
Tenant                          数据与权限的顶层边界（Community 中隐式，不单独落文件）
└── Project                     一个 Scrum 项目
    ├── ProjectConfig           这个项目的规则：工作流、估算方式、Sprint 长度、完成定义、权限策略
    ├── ProjectMember           谁在这个项目里、持有哪些角色（Community 中由存储层合成）
    ├── WorkItem                一条工作项。Epic、Story、Task、Bug、Subtask 都是它，靠 type 区分
    │   ├── AcceptanceCriterion 验收标准，随工作项一起存在同一个文件里
    │   ├── parentId            指向父工作项，表达层级
    │   └── dependsOn           指向被依赖的工作项，表达先后
    ├── Sprint                  一段时间盒
    └── Activity                谁在什么时候做了什么，只追加不修改

Harness Workspace
└── .scrum/                     这个 Workspace 绑定的那个 Project 的全部数据
```

一个 Harness Workspace 绑定零个或一个 Project。Workspace 里有没有 `.scrum/project.json`，就是绑没绑的判据。

Comment、Attachment、Product Goal 等概念在产品设计里已经出现，但当前版本尚未实现，本文不展开。

## 3. 每个实体都有的四个字段

除 Identity 外，所有实体都带同一组元数据（[metadata.ts:17-22](../../packages/core/scrum-domain/src/metadata.ts#L17-L22)）：

| 字段 | 类型 | 取值与约束 | 含义 |
|---|---|---|---|
| `schemaVersion` | 整数 | ≥1，当前恒为 `1` | 这条数据是按哪一版结构存的 |
| `revision` | 整数 | ≥1，创建时为 `1` | 修改次数计数器，每次成功写入加一 |
| `createdAt` | 字符串 | UTC 时间戳 | 创建时刻，此后不再变 |
| `updatedAt` | 字符串 | UTC 时间戳 | 最后一次修改时刻 |

### 3.1 revision：写入怎么保证不互相覆盖

`revision` 是本文第二重要的概念。它解决的问题是：两个人（或一个人和一个 Agent）同时打开了同一条工作项，先后保存，后保存的那次会不会把前一次的修改悄悄冲掉。

做法是：每次写入必须报出自己读到的是第几版。

```text
读到 revision = 7
    ↓
提交修改，同时声明 expectedRevision = 7
    ↓
存储层比对：文件里现在还是 7 吗？
    ├── 是 → 接受，写入，revision 变成 8
    └── 否 → 拒绝，返回 CONFLICT 错误，一个字节都不写
```

被拒绝的一方会收到明确的冲突错误，需要重新读取再决定怎么办，而不是发现自己的修改不见了。这条规则对界面和 Agent 一视同仁。

`schemaVersion` 的规则与之类似但方向相反：读到比当前构建更新的版本会被拒绝（`UNSUPPORTED_SCHEMA_VERSION`），因为用旧代码去写新结构会损坏数据；读到更旧的版本则被接受，以便迁移能够运行。

`updatedAt` 不允许倒退。时钟被回拨时写入会被拒绝，而不是留下一个 `revision` 在增长、`updatedAt` 在倒退的记录。

### 3.2 时间戳格式

所有时间戳都是固定宽度的 UTC 形式 `YYYY-MM-DDTHH:MM:SS.sssZ`，例如 `2026-08-20T10:00:00.000Z`。带时区偏移的写法（`+08:00`）会被拒绝而不是被转换。固定宽度加固定时区意味着两个时间戳直接按字符串比较就是正确的先后顺序。

### 3.3 标识符

| 类型 | 形式 | 例子 | 说明 |
|---|---|---|---|
| `TenantId` | `tnt_<ULID>` | `tnt_01K9Z…` | 租户 |
| `ProjectId` | `prj_<ULID>` | `prj_01K9Z…` | 项目 |
| `IdentityId` | `idt_<ULID>` | `idt_01K9Z…` | 一个人 |
| `MemberId` | `mbr_<ULID>` | `mbr_01K9Z…` | 一个人在一个项目里的成员身份 |
| `ProjectKey` | 1 个大写字母 + 1 至 9 个大写字母或数字 | `SCR` | 项目短代号 |
| `WorkItemId` | `<ProjectKey>-<序号>` | `SCR-12` | 工作项 |
| `SprintId` | `sprint-<序号>` | `sprint-12` | Sprint |

ULID 是一种按生成时间排序的 26 位标识符，因此目录列表和导出结果天然按创建顺序排列，不需要额外的排序字段。

`WorkItemId` 本身就是人类可读的编号，所以工作项没有另设一个 `key` 字段——两个字段表达同一件事，迟早会不一致。同理，`ProjectKey` 在项目创建后不可修改：它嵌在这个项目每一条工作项的编号里，改了就会让已经写在提交信息、聊天记录和文档里的 `SCR-12` 指不到任何东西。

## 4. Project：一块工作板

### 4.1 它是什么

一个 Project 是一个 Scrum 项目的身份和边界。一个 Harness Workspace 绑定零个或一个 Project，绑定关系由 Workspace 里存不存在 `.scrum/project.json` 决定。

### 4.2 字段

来源：[project.ts:37-45](../../packages/core/scrum-domain/src/project.ts#L37-L45)。

| 字段 | 类型 | 取值与约束 | 含义 |
|---|---|---|---|
| `id` | `ProjectId` | 创建时生成，永不复用 | 项目标识符。**落盘时这个字段叫 `projectId`**，见 4.4 |
| `tenantId` | `TenantId` | 必填 | 归属租户。项目之下的实体不再各自重复保存它 |
| `key` | `ProjectKey` | 创建后不可修改 | 项目短代号，例如 `SCR` |
| `name` | 字符串 | 去除首尾空白后 1 至 120 字符，不含控制字符 | 项目名 |
| `description` | 字符串 | 至多 2000 字符，允许换行；空串表示未填 | 项目说明 |
| `status` | 枚举 | `active` \| `archived`，创建时为 `active` | 项目是否还接受写入 |
| `createdBy` | `IdentityId` | 必填 | 创建者 |

外加第 3 节的 `schemaVersion`、`revision`、`createdAt`、`updatedAt`。

### 4.3 生命周期

```text
   创建                归档
  ──────▶ active ──────────────▶ archived
             ▲                       │
             └───────────────────────┘
                      恢复
```

归档的项目仍然完整可读，历史、导出和报表照常工作，它只是不再接受任何写入。这条约束由一个统一的守卫强制执行，工作项、Sprint 和项目配置的每一次修改都会经过它，而不是靠每个调用方各自记得检查。

归档一个已归档的项目会被拒绝而不是当作成功。静默的空操作在调用方看来是成功，但它下一次要提交的 `revision` 已经过期了。

### 4.4 落盘时的一处例外

所有实体的主键字段都叫 `id`，只有项目文件把自己的主键写成 `projectId`，以便和文件里出现的其他实体 ID 区分。这一处映射由契约测试钉死，不允许两侧各自演化。

项目文件里还多带一个 `edition` 字段（`community` \| `teams` \| `enterprise`）。它只是持久化标签，用于导出和迁移时识别数据来源；任何业务规则都不得基于它分支，版本差异一律由 Capability 决定，规则见[版本设计](editions.md)第 6 节。

## 5. ProjectConfig：这块板的规则

### 5.1 为什么单独一个文件

项目配置存在 `config.json`，与 `project.json` 分开，各自有独立的 `revision`。这样改一条完成定义和改项目名不会互相冲突：两个人同时做这两件事，两次写入都能成功。

### 5.2 字段

来源：[project-config.ts:50-59](../../packages/core/scrum-domain/src/project-config.ts#L50-L59)。

| 字段 | 类型 | 取值与约束 | 含义 |
|---|---|---|---|
| `projectId` | `ProjectId` | 必填 | 所属项目 |
| `statuses` | 状态列表 | 默认 `backlog, todo, in_progress, review, done` | 这个项目的工作流状态集合及其顺序 |
| `statusDisplayNames` | 映射 | 每个显示名至多 40 字符；默认为空 | 给状态起的自定义显示名 |
| `estimationMethod` | 枚举 | `story_points` \| `hours` \| `count`，默认 `story_points` | 估算单位 |
| `sprintLengthInDays` | 整数 | 正整数，至多 28，默认 14 | 建议的 Sprint 长度 |
| `definitionOfDone` | 字符串列表 | 至多 50 条，每条至多 200 字符；默认为空 | 完成定义 |
| `workInProgressLimit` | 整数或 `null` | 正整数；`null` 表示不限制 | 在制品数量上限 |
| `permissionPolicy` | 映射 | 只能覆盖权限矩阵中标为"可配置"的格子 | 项目对可配置权限的取舍，见 8.4 |

外加第 3 节的四个通用字段。

### 5.3 statuses 为什么不能直接改

`statuses` 不在可编辑字段列表里。自定义工作流会改变每一条已存工作项的状态含义，那是一次迁移而不是一次编辑。想给某一列换个名字，用 `statusDisplayNames`。

### 5.4 这里不放任何凭证

Token、密码、密钥不得出现在这个文件里。`.scrum/` 经常被提交进用户自己的代码仓库，一个能装下密钥的字段就是一个迟早会泄露密钥的字段。这条约束由钉死序列化键集的契约测试守着：新增字段会让它失败，必须被明确确认。

## 6. Work Item 与 Backlog

### 6.1 Backlog 怎么查出来

Backlog 是一次查询的结果，不是一份存储。对应的过滤条件是 `sprintId: null`（[work-items.ts:24-36](../../packages/core/scrum-application/src/ports/work-items.ts#L24-L36)）：

```text
filter.sprintId 缺省            → 不按 Sprint 过滤，返回全部工作项
filter.sprintId = null          → 只返回不属于任何 Sprint 的工作项，这就是 Backlog
filter.sprintId = 'sprint-12'   → 只返回属于该 Sprint 的工作项，这就是 Sprint Backlog
```

"缺省"和"显式为 null"必须是两回事，否则就没有办法描述 Backlog。结果一律按 `rank` 排序。

### 6.2 三个层级

Epic、Story、Task、Bug、Subtask 不是五张表，而是同一个实体的 `type` 字段的五个取值。`type` 决定这条事项落在层级的哪一层：

```text
level 1   Epic                  一块范围较大的业务主题，通常跨多个 Sprint
level 2   Story · Task · Bug    一件能独立排期、估算和交付的事
level 3   Subtask               把 level 2 的一件事拆成几步来做
```

父子关系只有一条规则：父事项必须正好高一级。所以 Epic 之下是 Story、Task 或 Bug，它们之下才是 Subtask；Epic 不能直接挂 Subtask，两条 Story 也不能互为父子。

**level 2 的三个类型是平级的。** Bug 不挂在 Story 下面，这是最容易搞错的一点。缺陷和它影响的那条需求之间是引用关系而不是归属关系：把 Bug 做成 Story 的子项，修缺陷花掉的工作量就会算进那条需求的进度里，于是一条早已交付的需求，会因为三个月后发现的一个缺陷而重新变回"未完成"。Bug 和 Story、Task 一样，可以有自己的 Subtask。

Epic 和 Subtask 都不进 Sprint，也都不估算，但理由不同：

- Epic 跨越多个 Sprint。它的估算和进度由子项加总派生——按点数算，没估算的子项按 0 计入分母。给 Epic 一个自己的 `sprintId`，"这件事在哪一轮交付"就会有两个可能互相矛盾的答案。
- Subtask 描述的是"怎么做"而不是"交付什么"。如果它能独立估算，同一份工作就会在父子两级各算一次，Velocity 会随着拆得多细而虚高。

Subtask 因此是 2.2 那句"Sprint 归属只由 `sprintId` 表达"的唯一例外：它自己没有这个字段，要问它属于哪个 Sprint，看它父事项的。这里选择派生而不是跟着父项存一份，是因为存一份就意味着移动父项时要级联重写它所有子项的文件，而那正是 2.2 想避免的事。

### 6.3 三个维度：类型、类别、标签

"这条事项在层级的哪一层"和"这是一件什么工作"是两个问题，用两个字段分别回答，再加一个自由标签：

| 字段 | 取值 | 回答的问题 |
|---|---|---|
| `type` | 五个固定值 | 它在层级里的位置，以及它有哪些特有字段 |
| `category` | 八个固定值 | 这是哪一类工作 |
| `labels` | 团队自己写的字符串 | 团队自己的切分维度，比如模块、平台、客户 |

`category` 的八个取值，以及它在创建时推荐的类型：

| category | 是什么 | 推荐的 type |
|---|---|---|
| `feature` | 功能需求 | Story |
| `nfr-visible` | 用户能感受到的非功能需求，例如"页面三秒内加载完" | Story |
| `nfr-constraint` | 用户感受不到的约束，例如日志留存期限、合规要求 | Task |
| `tech-debt` | 技术债与重构，对外行为不变 | Task |
| `spike` | 探针，产出是一个结论而不是一个功能 | Task |
| `ops` | 运维与迁移 | Task |
| `docs` | 文档 | Task |
| `defect` | 已交付的功能不符合预期 | Bug |

分辨 Story 和 Task 的判据是"用户是否感受得到，以及能不能独立交付价值"。但这只是**创建时的推荐**，不是校验：选了 `tech-debt`，界面会预选 Task，团队想改成 Story 也照样可以。像"页面三秒内加载完"这样的边界案例，不同团队本来就会落到不同一侧，把判据变成硬性校验，只会让人卡在一个填不下去的表单前。

`category` 用固定取值而不是随便写的标签，是为了让"这轮 Sprint 有多少点花在技术债上"这类问题有答案。自由标签拼写不一、各项目各写各的，统计不出来；而这恰恰是 `labels` 存在的位置——它不需要可比，只需要好用。

Spike 用"Task 加 `category: spike`"表示，不单开一个类型。类型枚举承载的是层级和字段结构，而 Spike 特殊的地方只有两个字段（时间盒和结论），为它新增一个类型，每一处判断类型的代码和每一个类型下拉框都要多出一个分支。

### 6.4 字段

来源：[work-item.ts:82-100](../../packages/core/scrum-domain/src/work-item.ts#L82-L100)，长度上限来自同一文件顶部的常量。

| 字段 | 类型 | 取值与约束 | 含义 |
|---|---|---|---|
| `id` | `WorkItemId` | 形如 `SCR-12`，项目内递增 | 工作项编号，本身即人类可读的 Key |
| `projectId` | `ProjectId` | 必填 | 所属项目 |
| `type` | 枚举 | `epic` \| `story` \| `task` \| `bug` | 工作项类型 |
| `title` | 字符串 | 去除首尾空白后 1 至 200 字符，不含控制字符 | 标题 |
| `description` | 字符串 | 至多 20000 字符，**不允许换行**；空串表示未填 | 描述 |
| `status` | 枚举 | `backlog` \| `todo` \| `in_progress` \| `review` \| `done`，创建时恒为 `backlog` | 当前状态 |
| `priority` | 枚举 | `low` \| `medium` \| `high` \| `critical`，默认 `medium` | 优先级 |
| `assigneeId` | `IdentityId` 或 `null` | `null` 表示未指派 | 负责人 |
| `reporterId` | `IdentityId` | 必填 | 创建人 |
| `estimate` | 数字或 `null` | 0 至 1000，允许 0；`null` 表示未估算 | 估算值，单位由 `estimationMethod` 决定 |
| `sprintId` | `SprintId` 或 `null` | `null` 表示在 Backlog 里 | 所属 Sprint。**这是 Sprint 归属的唯一来源** |
| `parentId` | `WorkItemId` 或 `null` | 同项目，不得成环 | 父工作项 |
| `dependsOn` | `WorkItemId` 列表 | 同项目，不得自依赖或成环；默认为空 | 依赖的工作项 |
| `rank` | 字符串 | 数字与小写字母，不以 `0` 结尾，至多 64 字符 | Backlog 排序键，见 6.8 |
| `blockedReason` | 字符串或 `null` | 至多 500 字符；`null` 表示未阻塞 | 阻塞原因，见 6.9 |
| `labels` | 字符串列表 | 至多 20 个，每个至多 40 字符；自动转小写并去重 | 标签 |
| `acceptanceCriteria` | 对象列表 | 至多 50 条 | 验收标准，见 6.6 |

外加第 3 节的四个通用字段。

`description` 不允许换行是实现现状（它走的是单行文本校验），项目描述则允许分段。

### 6.5 已定稿、尚未实现的字段

6.2 和 6.3 描述的层级与分类模型已在[系统架构](../development/architecture.md)第 7.5 节定稿，但当前代码还只有四个类型和一张平的类型枚举。以下字段属于该设计，读代码时不会看到：

| 字段 | 取值 | 含义 |
|---|---|---|
| `type` 的第五个取值 | `subtask` | level 3 |
| `level` | 1 \| 2 \| 3 | 由 `type` 唯一决定，仍然落盘，好让父子校验和聚合查询只依赖一个整数 |
| `category` | 见 6.3 的八个取值 | 这是哪一类工作 |
| `resolution` | `null` \| `done` \| `wont_fix` \| `duplicate` \| `cannot_reproduce` | 结束方式，见 6.7 |
| `typeDetails` | 见下表 | 各类型自己的字段 |

各类型的特有字段：

| type | 特有字段 |
|---|---|
| `epic` | `color`（在看板和时间轴上标识这个 Epic 的颜色） |
| `story` | 无。验收标准是通用字段，任何类型都能写 |
| `task` | 仅当 `category` 为 `spike`：`timebox`、`outcome` |
| `bug` | `severity`、`stepsToReproduce`、`expected`、`actual`、`environment`、`affectedVersion`、`isRegression`、`rootCause` |
| `subtask` | 无 |

Bug 的 `severity` 和通用的 `priority` 是两回事，所以分开存：严重度说的是这个缺陷本身造成多大影响，优先级说的是打算什么时候修。一个只影响少数用户、却卡住发布的缺陷，两者取值并不相同。

Spike 的 `outcome` 就是它的完成定义。探针交付的是结论而不是能用的功能，没有 `outcome` 就无法判断它做完没有；`timebox` 则保证它不会无限延长——一个没有时间盒的探针会一直"快有结论了"。

Definition of Ready 也按类型配置，不写死在领域层：Story 要求有验收标准和估算，Bug 要求有复现步骤，Task 要求说清楚产出。

### 6.6 验收标准

每条验收标准是一个两字段的对象，随工作项存在同一个文件里：

```json
{ "text": "优惠券过期后不能被使用", "satisfied": false }
```

`text` 至多 500 字符。这个结构刻意没有自己的 id：整个工作项文件在一个 `revision` 下原子写入，所以按位置来定位某一条是安全的——并发的重排会先被 `revision` 检查挡掉，不可能出现"勾选落到了别的条目上"。

### 6.7 状态与流转

```text
                       排进 Sprint
   backlog ──────────────────────────────▶ todo ⇄ in_progress ⇄ review ⇄ done
      ▲                                     │        │            │
      │                                     │        │            │
      └─────────────────────────────────────┴────────┴────────────┘
                  退回 Backlog（done 不允许）
```

规则如下：

- 新建的工作项状态恒为 `backlog`，且不属于任何 Sprint。把它排进 Sprint 是一次单独的、会被记录的操作，创建接口不能顺手代劳；
- 排进 Sprint 时，状态是 `backlog` 的会变成 `todo`；已经在做的保持当前列，所以在两个 Sprint 之间搬一张卡片不会把进度清零；
- `todo`、`in_progress`、`review`、`done` 四列之间可以任意移动，不强制按顺序推进；
- 状态不能被"改"回 `backlog`。回到 Backlog 是"移出 Sprint"这个操作的结果，它同时清空 `sprintId`；如果允许改状态回去，就会留下一条状态在 Backlog、却还指着某个 Sprint 的工作项；
- 已经 `done` 的工作项拒绝移出 Sprint。它所在的 Sprint 就是"这件事在哪一轮交付"的记录，抹掉它等于改写 Sprint 报表读的历史；
- 看板只显示 `todo`、`in_progress`、`review` 和 `done` 四列。`backlog` 不在看板上，因为在 Backlog 里就意味着不在这个 Sprint 里。

**结束方式是另一个字段（尚未实现）。**"不修了""这是重复提交的""复现不出来"都不是流转位置，而是结束方式，所以它们不做成状态，而是记在 `resolution` 里：没到 `done` 的事项 `resolution` 恒为 `null`，到了 `done` 就必须有值，默认是 `done`。

如果把它们做成状态，看板上就要为每一种各开一列，而且每个类型都得有一套自己的状态机——Bug 需要"无法复现"，Story 不需要。分开之后，五个类型共用同一套状态机，报表再按 `resolution` 区分真正完成的和其他终态。

### 6.8 rank 为什么是字符串

Backlog 的顺序存在每条工作项自己的 `rank` 字段里，取值是数字和小写字母组成的字符串，两个 `rank` 直接按字符串比较就是先后顺序。

用字符串而不是整数序号，是为了让"任意两条之间总能插进一条新的"永远成立。整数序号在 3 和 4 之间插一条就必须把后面所有条目重新编号，一次拖拽会重写整个 Backlog 的所有文件。字符串方案（Fractional Indexing）里 `a` 和 `b` 之间还有 `am`，`a` 和 `am` 之间还有 `ag`，所以拖动一张卡片只重写它自己那一个文件，也不存在"必须重排整个 Backlog"的时刻。

代价是反复往同一个缝隙里插入会让 `rank` 逐字符变长，由 64 字符上限兜住。

只有 level 2 的事项参与 Backlog 排序。Epic 在 Backlog 里是分组和筛选条件，Subtask 折叠在父事项里跟着它走，两者都不需要自己的次序。

### 6.9 为什么没有 blocked 字段

阻塞只存 `blockedReason`。为 `null` 就是没被阻塞，有值就是被阻塞了且这就是原因。

系统里不存一个额外的 `blocked` 布尔值，因为两个必须保持一致的字段最终一定会不一致，而"已阻塞但说不出原因"正是产品设计明确禁止的状态——一个没人解释的阻塞是一个没人能处理的阻塞。落盘数据里不存在 `blocked` 键这件事由契约测试直接断言。

### 6.10 两种关系

工作项之间有两种链接，都只指向同一个项目内的工作项：

- `parentId` 表达层级，一条工作项至多一个父；
- `dependsOn` 表达先后，一条工作项可以依赖多条。

两者都不允许成环：不能自己做自己的父或依赖，也不能绕一圈回到自己。仍然被别的工作项当作父或依赖的工作项不能删除，删除请求会被拒绝并指出是谁在引用它。

`parentId` 另外还要满足 6.2 的相邻一级规则，`dependsOn` 则不限层级——两条 Subtask 之间、一条 Story 和另一个 Epic 之间都可以有依赖。

### 6.11 哪些字段能一起改

界面上的"编辑详情"只能改这几项：`title`、`description`、`type`、`priority`、`assigneeId`、`estimate`、`labels`、`acceptanceCriteria`。

其余字段各有独立的操作和独立的权限：

| 要改的字段 | 对应操作 |
|---|---|
| `status` | 在看板上移动 |
| `sprintId` | 排进 Sprint / 移出 Sprint |
| `rank` | 在 Backlog 里拖动排序 |
| `parentId` | 设置父工作项 |
| `dependsOn` | 增删依赖 |
| `blockedReason` | 标记阻塞 / 解除阻塞 |

这样切分是为了让一次"编辑详情"不能夹带一次看板移动，绕过管着它的那条权限检查。

## 7. Sprint：一段时间盒

### 7.1 字段

来源：[sprint.ts:44-56](../../packages/core/scrum-domain/src/sprint.ts#L44-L56)。

| 字段 | 类型 | 取值与约束 | 含义 |
|---|---|---|---|
| `id` | `SprintId` | 形如 `sprint-12` | Sprint 编号 |
| `projectId` | `ProjectId` | 必填 | 所属项目 |
| `name` | 字符串 | 去除首尾空白后 1 至 120 字符 | 名称 |
| `goal` | 字符串 | 至多 1000 字符；空串表示未填 | Sprint Goal，这一轮希望达成的业务成果 |
| `status` | 枚举 | `planned` \| `active` \| `closed`，创建时为 `planned` | 生命周期状态 |
| `startDate` | 时间戳 | 必须早于 `endDate` | 约定的起点 |
| `endDate` | 时间戳 | 必填 | 约定的终点 |
| `startedAt` | 时间戳或 `null` | 启动时填入 | 实际开启的时刻 |
| `closedAt` | 时间戳或 `null` | 关闭时填入 | 实际关闭的时刻 |
| `resultSummary` | 字符串 | 至多 5000 字符；初始为空串 | 关闭时写下的结果小结 |
| `createdBy` | `IdentityId` | 必填 | 创建者 |

外加第 3 节的四个通用字段。

### 7.2 计划日期和实际时刻是两回事

`startDate` 和 `endDate` 是团队约定的时间盒；`startedAt` 和 `closedAt` 是它实际开合的时刻。

把它们合并成两个字段会让"延期交付"被悄悄改写成"按时交付"：只要在关闭时顺手把 `endDate` 挪到今天，报表就永远显示准时。分开保存之后，燃尽图、速率和"这一轮有没有按时结束"都有一个不会被事后修改的基准。

同样的理由决定了改期只在 `planned` 阶段可用：重排一个已经开始的 Sprint 的日期，就是在重写所有度量所依据的那个盒子。

### 7.3 生命周期

```text
   创建               启动                关闭
  ──────▶ planned ──────────▶ active ──────────▶ closed
             │
             └── 只有在这个阶段可以改期
```

各步骤的前置条件：

- **启动**：只有 `planned` 的 Sprint 能启动；同一个项目在同一时刻最多只能有一个 `active` 的 Sprint。这个检查在能看到项目其他 Sprint 的地方做，而不是指望调用方自己记得；
- **关闭**：只有 `active` 的 Sprint 能关闭，且指派给它的每一条工作项都必须已经 `done`。还没做完的必须先被显式处理——退回 Backlog，或者搬到下一个 Sprint——系统不会静默删除、自动标完成或擅自迁移；
- **已关闭**：不再接受新的工作项，名称和目标也不能再改。

名称和目标在 Sprint 运行期间是可以改的：第二天发现目标写得不好值得改掉，拒绝修改只会把真正的目标推到系统看不见的地方。

### 7.4 Sprint 不保存工作项列表

Sprint 文件里没有 `workItems`、`items` 之类的字段，契约测试直接断言它们不存在。成员关系只由工作项的 `sprintId` 表达，理由见 2.2。

### 7.5 进度是算出来的

Sprint 进度（每列有多少条、合计多少估算、完成了多少、还有几条没估算）在每次读取时由工作项现算，不存盘。存下来的合计是同一件事的第二份副本，只要有一次写入更新了工作项却没更新合计，看板就会理直气壮地显示错误数字。

其中"未估算条数"单独报出而不是并进估算合计：一个悄悄漏掉了没人估算的条目的合计，看上去像个完整数字，但它不是。

## 8. 谁能改什么：角色与权限

### 8.1 三个层次

```text
Identity        一个人。在 Community 里是本地用户，在其他版本里是目录账号
   ↓
ProjectMember   这个人在这个项目里的成员身份，携带角色和启用状态
   ↓
ProjectRole     角色。一个成员可以同时持有多个
```

`ProjectMember` 的字段是 `id`、`projectId`、`identityId`、`roles`、`status`，外加四个通用字段。它不重复保存 `tenantId`（经项目可以推出来），也不另设 `joinedAt`（那就是 `createdAt`）。

`status` 为 `suspended` 的成员保留着角色但不再获得任何权限：停用不是删除，历史记录和已有指派仍然可以解析，恢复时角色也还在。

### 8.2 五个角色

| 角色 | 中文 | 职责 |
|---|---|---|
| `product_owner` | 产品负责人 | 对需求价值和 Backlog 优先级负责 |
| `scrum_master` | Scrum Master | 保障流程运转、消除障碍 |
| `developer` | 开发者 | 完成产品增量，含测试和设计等交付成员 |
| `stakeholder` | 利益相关者 | 关注结果但不属于 Scrum 团队 |
| `administrator` | 项目管理员 | 管理成员、权限和项目配置，是软件角色而非 Scrum 角色 |

### 8.3 权限是细粒度动作

系统里有 20 个权限，每一个对应一个具体动作，而不是"读/写"这样的粗档位。按主题分组大致是：

```text
查看        project.view, backlog.view, report.view
编辑事项    workItem.write, workItem.estimate, workItem.setAcceptanceCriteria,
            workItem.setBlocked, workItem.accept, workItem.suggest
计划排序    backlog.prioritize, sprint.assignWorkItems
状态流转    workItem.updateOwnStatus, workItem.updateAnyStatus
Sprint      sprint.create, sprint.setGoal, sprint.transition
管理配置    member.manage, project.configure, project.archive, retrospective.manage
```

`workItem.updateOwnStatus` 和 `workItem.updateAnyStatus` 分开，是因为"能推进自己负责的卡片"和"能推进任何人的卡片"是两件事。

### 8.4 有效权限怎么算出来

每个"角色 × 权限"的格子有三种取值：

```text
allowed         这个角色本来就有
configurable    这个角色可以有，但要项目明确开启
denied          没有，且项目也开不了
```

一次权限判断按下面的顺序得出结论：

```text
成员的角色（suspended 成员按无角色处理）
    ↓ 取所持角色中最强的那个格子
allowed → 通过；configurable → 看项目的 permissionPolicy 有没有开
    ↓
版本 Capability 是否包含这个权限所需的能力
    ↓
项目是否已归档（归档后一切写入被拒）
    ↓
结论
```

`permissionPolicy` 存在 `config.json` 里，因此项目的取舍是可见的数据而不是藏在代码分支里。它只能改动标为 `configurable` 的格子；试图用它开启一个 `denied` 的格子会被拒绝而不是被忽略——默认矩阵是天花板，配置只能在天花板以下调整。出厂时只开了一个格子：允许 developer 移动任何人的卡片，因为几乎每个团队都这么用看板。

界面隐藏一个按钮不算权限检查。Host 和远程服务各自会再查一遍。

### 8.5 Community 里只有一个人怎么办

Community 不落成员文件。本地用户的 `IdentityId` 只出现在 `project.json` 的 `createdBy` 里，唯一的那个成员由存储层按"owner 持有全部五个角色"在内存中合成。

这样做的意义是：Community 不需要一个永远只有一行的文件，而权限矩阵对它照常生效。owner 不是被豁免了权限检查，而是恰好满足了其版本能力允许的全部检查。将来迁移到多人版本时再补一次真实的成员记录即可，领域规则一行都不用改。

### 8.6 Agent 的权限

Agent 使用当前用户的身份，受同一套约束，不会因为是 Agent 就多出或少掉任何权限。它的最终权限是"版本能力 ∩ 角色权限 ∩ 项目权限策略 ∩ 项目状态 ∩ 操作级安全策略"的交集；Session 只能作为审计来源，不参与授权。高风险操作必须先请求确认，并写入 Activity。

## 9. 这些数据在磁盘上长什么样

### 9.1 目录布局

Community 把权威数据直接放在绑定 Workspace 的 `.scrum/` 目录里，不用数据库，也不需要独立服务端。

```text
<workspace>/.scrum/
├─ project.json          项目身份，也是"这个 Workspace 绑定了项目"的判据
├─ config.json           项目配置
├─ work-items/
│  ├─ SCR-1.json         一条工作项一个文件
│  └─ SCR-2.json
├─ sprints/
│  ├─ sprint-1.json      一个 Sprint 一个文件
│  └─ sprint-2.json
├─ comments/
│  └─ SCR-1.jsonl        每行一条不可变的评论事件
├─ activities/
│  └─ 2026-08.jsonl      按月拆分的操作记录
├─ bindings/             这个 Workspace 挂在哪个项目上，按 Harness 安装分别记录
├─ idempotency/          已完成操作的记忆，按调用方给的 key
├─ operations/
│  └─ pending/           跨多个文件的操作日志，见 9.3
├─ attachments/
├─ backups/
└─ workspace.lock        写入期间持有的锁，它是一个目录
```

以实现 [paths.ts](../../packages/adapters/adapter-storage-workspace-files/src/paths.ts) 为准。两个细节值得一提：

- `bindings/` 和 `idempotency/` 下的文件名是内容的 SHA-256 摘要。`.scrum/` 经常被提交进用户自己的仓库，Harness 安装 ID 或调用方的 idempotency key 不该出现在目录列表和每一次 diff 里，而摘要仍然能回答"是不是同一个引用"这个唯一被问到的问题；
- `workspace.lock` 是一个目录而不是文件。创建目录要么成功要么失败，中间没有窗口，这正是锁需要的语义。

`.scrum/.gitignore` 应当忽略 `*.tmp`、`*.lock`、`operations/pending/` 和 `backups/`：它们是过程产物，不是需要进版本库的数据。

### 9.2 两个文件样例

`project.json`：

```json
{
  "schemaVersion": 1,
  "projectId": "prj_01K9ZQ8N7X4G2M6R0V3B5D7F9H",
  "tenantId": "tnt_01K9ZQ8N7X4G2M6R0V3B5D7F9H",
  "edition": "community",
  "key": "SCR",
  "name": "shop-service",
  "description": "",
  "status": "active",
  "createdBy": "idt_01K9ZQ8N7X4G2M6R0V3B5D7F9H",
  "revision": 1,
  "createdAt": "2026-08-20T10:00:00.000Z",
  "updatedAt": "2026-08-20T10:00:00.000Z"
}
```

`work-items/SCR-12.json`：

```json
{
  "schemaVersion": 1,
  "id": "SCR-12",
  "projectId": "prj_01K9ZQ8N7X4G2M6R0V3B5D7F9H",
  "type": "story",
  "title": "用户使用优惠券",
  "description": "",
  "status": "in_progress",
  "priority": "medium",
  "assigneeId": null,
  "reporterId": "idt_01K9ZQ8N7X4G2M6R0V3B5D7F9H",
  "estimate": null,
  "sprintId": "sprint-12",
  "parentId": null,
  "dependsOn": [],
  "rank": "i",
  "blockedReason": null,
  "labels": [],
  "acceptanceCriteria": [],
  "revision": 8,
  "createdAt": "2026-08-20T10:00:00.000Z",
  "updatedAt": "2026-08-20T12:00:00.000Z"
}
```

字段名与第 4、6 节的字段表逐条对应。落盘用的键集由契约测试钉死，改字段必须先改那里。

### 9.3 一次写入的完整过程

改一条工作项：

```text
1. 读取当前 revision
2. 校验调用方提交的 expectedRevision，对不上就返回 CONFLICT 并停止
3. 检查权限和领域规则
4. 把新内容写进同目录下的临时文件
5. 刷新到磁盘
6. 原子重命名，覆盖原文件
7. revision 加一
8. 追加一条 Activity
```

第 4 至 6 步是"要么完全是旧内容、要么完全是新内容"的保证：同目录内的重命名是原子的，因此断电不会留下一个写了一半的 JSON。

需要同时改多个文件的操作（例如关闭 Sprint 时批量处置未完成事项）先在 `operations/pending/` 写一份操作日志，然后逐个应用；中途崩溃时，下次启动可以据此把整个操作提交完或者回滚掉，而不是留下改了一半的状态。

Activity 和 Comment 是只追加的 JSONL：每行一条不可变记录，编辑和删除通过追加更正事件表达。追加由 Workspace 级的协调器串行化，崩溃留下的半行会被隔离而不是被静默删除。

### 9.4 界面、Agent 和存储的关系

界面和 Agent 不各自读写文件。两者都走同一套应用服务和同一个存储适配器，因此上面这套 `revision` 检查、权限检查和 Activity 记录对谁都一样，不存在"Agent 走了一条捷径"的路径。

## 10. 常见疑问速查

**Backlog 存在哪个文件里？**
不在任何文件里。它是 `sprintId` 为 `null` 的工作项按 `rank` 排序的结果。见 2.2 和 6.1。

**为什么没有 `blocked` 字段？**
它可以从 `blockedReason` 推出来。两个必须一致的字段迟早会不一致。见 6.9。

**为什么 Sprint 不存工作项列表？**
存了就有两个答案。归属只由工作项的 `sprintId` 表达，移动一条只写一个文件。见 7.4。

**为什么 `project.json` 的主键叫 `projectId` 而别的都叫 `id`？**
项目文件里会出现别的实体 ID，主键换个名字便于区分。这是唯一一处例外，由契约测试钉死。见 4.4。

**为什么 `rank` 是字符串？**
为了让任意两条之间总能插进一条新的，从而一次拖拽只重写一个文件。见 6.8。

**只有一个人的 Community 为什么还有 `tenantId` 和五个角色？**
为了让 Community 和多人版本共用同一套 Schema 与领域规则，导入导出和迁移才不需要改写数据。owner 不是被豁免检查，而是满足了全部检查。见 8.5。

**改一个字段要同步改哪里？**
先改 `packages/core/scrum-domain/src/` 下的实体定义，再改 `packages/core/scrum-domain/tests/contract/` 下钉死落盘键集的契约测试；两者不同步时测试会失败。涉及跨进程传输的还要看 `packages/api/scrum-api-contract/`。

**已经归档的项目还能看吗？**
能。归档只停写不停读，历史、导出和报表照常工作。见 4.3。

## 11. 延伸阅读

- [系统架构](../development/architecture.md)：数据模型、存储格式、并发与迁移的权威规范。
- [Scrum 产品设计](scrum.md)：Scrum 概念、角色、权限矩阵、使用流程和首版范围。
- [Scrum 术语表](glossary.md)：本文出现的英文术语的统一中文译名和解释。
- [版本设计](editions.md)：Capability 的定义，以及 Community 与商业版本的能力差异。
- [快速开始](quick-start.md)：装上插件、建一个项目、跑完一个 Sprint 的操作步骤。
