# 待决问题

本文收集 E-1.1 Domain（#37、#38、#39）实现过程中留下的未决问题。每条都记了当前实现取的值、备选、以及推迟的代价。

分四类：**A** 需要你拍板；**B** 我已经拍了但现在改便宜、以后改贵；**C** 文档与实现已经分叉；**D** 环境问题。已解决的条目保留并划掉，记下结论。

---

## A. 需要你拍板

### ~~A1. Community 的成员与本地 Identity 存在哪~~ — 已定（PR #60）

**决定：只进 `project.json`，成员内存合成。** 本地用户的 `IdentityId` 只以 `createdBy` 和 Tenant 的 `ownerIdentityId` 出现；Community 不落成员文件，唯一成员由存储层按「owner 持有全部五个角色」在内存合成。每个 Workspace 一个独立个人 Tenant。已写进 `architecture.md` §7.4。

owner 不是豁免权限检查，而是恰好满足其版本能力允许的全部检查 —— 这样 Teams 能原样复用同一条执行路径。迁移到 Teams 时再补一次真实成员表。

### A2. `ProjectMember` 的主键

当前实现：独立的 `mbr_<ULID>`，对齐 `architecture.md` §7.4 的表。
备选：`(projectId, identityId)` 复合键 —— Community 单用户下省掉一个永远只有一行的 ID 空间。

A1 定了「Community 不落成员文件」之后，这条的紧迫性下降了：Community 根本不按主键查成员。但 Teams 真实落盘时仍要定。#40 不受它阻塞。

### ~~A3. `tenantId` 到底落到哪几个实体~~ — 已定（PR #60）

**决定：全省，只有 `Project` 带。** `ProjectMember` 的 `tenantId` 已移除，Project 之下的实体一律经 project 派生 Tenant，完全遵守「不重复保存可派生数据」。`architecture.md` §7.2/§7.4/§7.5/§7.6 已同步，并补了一个契约测试按名字断言成员文件里长不出 `tenantId` 和 `joinedAt`。

### A4. 写归档项目该抛哪种错

当前：`ValidationError`（"这是状态规则"）。
备选：`ForbiddenError`（UI 想据此显示一个独立的只读横幅，而不是把它混在字段校验失败里）。

这会进 API 错误契约和 Agent Tool 的返回，**现在定比 #43/#46 之后定便宜**。

### A5. Capability 集合要不要对齐

```
scrum-domain    CAPABILITY:        scrum.core collaboration rbac audit.basic audit.advanced sso scim selfHosted
scrum-api-contract REMOTE_CAPABILITY: scrum.core collaboration rbac audit.basic audit.advanced sso scim realtime notifications
```

domain 多 `selfHosted`，传输层多 `realtime` 和 `notifications`。

我的倾向是刻意保持不同：domain 是封闭枚举（只认它会据以判权限的那些），传输层刻意开放（旧插件要能忽略新服务返回的未知能力）。但这需要你确认是设计，而不是两边各写各的。#40 和 Remote Adapter 落地前定。

### A6. 估算方式的取值

`story_points | hours | count` 是我发明的，`scrum.md` 和 `architecture.md` 都没列过取值，只说"配置估算方式"。

### A7. WIP 上限的形状

当前：`workInProgressLimit: number | null`，项目级一个数。
备选：按列限流（`Partial<Record<WorkItemStatus, number>>`）—— 看板实践里更常见的是"In Progress 最多 3 个"而不是"全项目最多 3 个"。

改成按列是类型变更，#51/#52 的看板 UI 会直接消费它。

### A8. `permissionPolicy` 该不该出现在 Community 的 `config.json`

RBAC 是 Teams 能力，Community 是单用户、五角色全给一个人。现在这个字段无条件存在于每个 `config.json`。

备选：保留字段但仅在 `rbac` 能力存在时生效；或 Community 干脆不写。

### A9. 用例函数名与 domain 重名

`scrum-application` 导出 `createProject` / `archiveProject` / `restoreProject`，`scrum-domain` 也导出同名实体函数。同时 import 两个包会撞名，必须起别名。

好处是调用点读起来就是用例名（`project.create` Tool 直接对应）；代价是组合层每次都要 alias。撞名是编译错误不是静默 bug，所以我先按原样保留。要改就趁 #46 接入 Host 之前。

### A10. Activity 写失败要不要中断用例

当前：**抛出**。变更已经落地，但审计缺口不能静默 —— 调用方收到失败可以重试，重试因为 revision 过期会 Conflict 而不是重复写。

代价：`createProject` 没带幂等键时重试会真的建出第二个项目。所以幂等键在写路径上不是可选装饰。

备选：吞掉失败并把 Activity 结果放进用例返回值，让调用方决定。这会让每个用例的返回类型多一层。

### A11. Community 的 `unbindWorkspace` 无法实现

Community 的绑定不是一条记录，而是 `.scrum/project.json` 存在本身。删除它等于删项目，不是解绑。当前 Port 契约允许 `remove` 拒绝，并有测试覆盖；用例本身是给 Remote 的链接文件用的。

如果产品要「Community 也能解绑」，就得引入独立的 link 文件，`.scrum/` 布局要加一个文件。


### A12. `SprintId` 没有项目前缀

`SCR-12` 自带项目键，`sprint-1` 不带。测试里两个项目各建一个 Sprint 就撞了 —— Fake 按 id 单键存时直接冲突，改成 `(projectId, sprintId)` 复合键才对。

Community 一个 Workspace 一个项目，目录本身就是作用域，撞不到；Remote 多项目共库时，任何按 SprintId 单键索引的实现都会踩。要么给 Sprint 也加项目前缀（`SCR-S1`），要么在契约里写死「Sprint 主键是 (projectId, sprintId)」。**Remote Adapter 落地前定。**

### A13. 权限矩阵没有「删除工作项」这一行

`deleteWorkItem` 当前用 `workItem.write`。删除是不可逆动作，按矩阵的粒度它更该有自己一行。#48/#49 的 Agent Tool 会把它标成高风险操作，那时必须有明确答案。

---

## B. 我已经拍板了，但现在改便宜、以后改贵

这些都已合并，不阻塞任何事。列出来是因为它们都进了持久化格式或权限语义，越往后越难动。

- **B1. `backlog` 状态 ⟺ 不属于任何 Sprint**（#38）。比文档那条"backlog 项不属于 active Sprint"更强。好处是文档的两条不变量变成结构性成立；代价是"回到 backlog"必须走移出 Sprint 的操作，不能当状态迁移做。
- **B2. 权限矩阵叙述性单元格的坍缩规则**（#37）：协助/参与/促进/可选 → allowed；`—` → denied；Stakeholder 的可提交建议/可反馈/反馈 → 本行 denied ＋ 独立的 `workItem.suggest` allowed；Developers 的"提交验收" → `workItem.accept` denied（该动作实为 `updateOwnStatus` 推进到 review）；Stakeholder 的"只读摘要" → `report.view` allowed。**这是本 PR 里最有分量的一次解释，值得逐行过一遍。**
- **B3. 5 个 configurable 格子只默认放开 `workItem.updateAnyStatus → developer`**，其余四个 fail closed。
- **B4. `member.manage` 是唯一需要 `rbac` 能力的权限**，其余一律 `scrum.core`。没有为尚未建模的能力凭空发明更多门禁。
- **B5. 工作项类型嵌套不强制**（#38）。`scrum.md` §4.2 说 Epic→Story→Task/Bug 是"推荐层级"，所以任何类型可以当任何类型的父。
- **B6. 估算允许小数、允许 0，上限 1000**。工时是小数，故事点通常不是；因为估算方式是项目配置，取了宽松的那侧。
- **B7. 依赖目标不在索引里时容忍建链**（#38）。修复中的仓库必然有悬空引用，全都拒绝会让依赖图恰好在要修的时候不可用。悬空引用的报告归 R1.1 的一致性检查器。
- **B8. 验收标准没有独立 id，按位置寻址**（#38）。整个工作项在一个 revision 下原子写入，位置寻址是安全的；给它发 id 等于发明一套存储布局无处安放的方案。
- **B9. rank 用 Fractional Indexing，不用 LexoRank，不带 `0|` 桶前缀**（#38）。
- **B11. `WorkspaceBinding` 比 `architecture.md` §8.1 窄**（#43）。去掉了 `id`（`(instanceId, workspaceId)` 已唯一）、`tenant_id`（Project 带，第二份会不一致）、`workspace_path_fingerprint` 和 `last_verified_at`（没有消费方；写 `last_verified_at` 会让「打开 workspace」变成一次写，只读检出就打不开了）。要加回来必须先有读它的代码。
- **B12. 幂等记录只存引用不存结果**（#43）。重放时用引用重新读，所以重试方看到的和首次调用方看到的是同一份当前状态，而不是当初那一帧。
- **B13. 解绑不检查项目权限**（#43）。悬空绑定指向的项目已经不在了，要求权限会让最该被清掉的绑定成为唯一清不掉的。绑定则要求 `project.view`。
- **B14. `resolveWorkspaceBinding` 返回可辨识联合**（#43），`bound / stale / unbound` 三态，「已绑定但项目不存在」在类型上不可表达。
- **B15. 用例函数用朴素命名，与 domain 同名**（#43）。撞名是编译错误不是静默 bug，组合层起别名即可。
- **B16. 幂等键只在写入路径可选，能力检查在幂等包装之外**（#43）。被能力拒绝的调用不会消耗键。
- **B17. 多实体原子写只有一条路径 `TransactionPort`**（#45），`WorkItemRepository.saveAll` 已删。一个包里两套原子机制，只有一套会拿到下一个不变量。
- **B18. Sprint 进度全部派生，不落盘**（#45）；未估算条目数与估算总和并列上报，不折进总和。
- **B19. 改 Sprint 日期用 `sprint.create`，改名与目标用 `sprint.setGoal`**（#45）。日期是燃尽图和「是否准时」的度量基准，改它等于重新立项。
- **B10. `EntitlementService.limit()` / `LimitName` 不进 domain**（#37）。没有任何领域规则消费数值上限，把它拉进来等于把 Edition 关注点下沉到 domain。

---

## ~~C. 文档与实现已经分叉~~ — 已收口（PR #60）

`architecture.md` §7 的三张表已与实现对齐，比原计划的 #40 提前，因为存储适配器正是要拿它们当规格来写：

- **§7.4 `project_member`**：去掉 `tenant_id`；`joined_at` 就是 `created_at`；补上 `roles` / `revision` 和停用语义。
- **§7.5 `work_item`**：去掉 `tenant_id` 和独立的 `key`（`id` 本身就是 `SCR-12`）；阻塞只留 `blocked_reason`；补上 `depends_on` / `labels` / `acceptance_criteria`。
- **§7.6 `sprint`**：去掉 `tenant_id`；标注计划日期与实际时间戳的区别。

§8.1/§8.2/§8.3（Workspace Link、Session Context、Activity）里的 `tenant_id` 未动 —— 那三张表对应的代码还没写，不构成分叉。

## D. 环境

- **D1. `gh` token 缺 `read:project` scope**，读不了 GitHub Project board。这次靠 Milestone ＋ Issue 依赖链代替了，够用。要看板视图的话跑 `gh auth refresh -s read:project`。

---

## E. 已知的跨包重复

- **E0. `todo.md` 已经被提交进仓库**（#43 的第一个 commit 里 `git add -A` 带进去的，非本意）。它原本是本地草稿。要么保留并在每个 PR 里当 `docs(repo)` 更新，要么单独开一个 `[Chore]` PR 把它移出版本控制。**这条需要你定。**
- **E1. `ACTIVITY_SOURCE` 有两份**：`scrum-application/src/ports/activity.ts`（权威，五个值）和 `adapter-storage-workspace-files/src/activity.ts`（三个值）。两者是结构相同的 union，TypeScript 不会发现它们分叉。当前由 adapter 的契约测试断言「store 的取值是 application 的子集」兜住。Adapter 在 #54 实现 `ActivityRecorder` 时删掉自己那份。

## 当前进度

- **R0** 工程与集成基线：18/18 已关闭。
- **R1 Community MVP**：19 个 Issue（#37–#55）已建并绑定 Milestone，另加 #59。
  - E-1.1 Domain：#37 ✅、#38 ✅、#39 ✅ —— **完整交付**。
  - #59 Tenant 边界与数据模型表对齐 ✅（PR #60）。
  - E-1.2 Workspace 存储：#40 ✅、#41 ✅、#42 ✅ —— **完整交付**。
  - E-1.3 Application：#43 ✅（PR #64）、#44 ✅（PR #65）、#45 ✅（PR #66）—— **完整交付**。
  - 下一条主线：#46 Harness Host API 与 Workspace Context。
  - 从 #43 起到 #50，测试通过即自行合并，不再逐个等确认。
