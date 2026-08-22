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


### A14. Harness Workspace / Session 服务的宿主端形状未验证

`scrum-harness-host` 定义了 `HarnessContext` Port（`instanceId` / `currentWorkspace()` / `currentSession()`），但**从 Harness 的类型声明里读不到宿主端 `workspaces` / `sessions` 服务的确切形状**，所以真正的 Adapter 没写。#54 组合时必须对着跑起来的 Harness 验证一次。

同理，Session 生命周期事件怎么观察（用来在访问模式变化时增删工具注册）也没验证。

### ~~A15. 浏览器到宿主的调用通道没定~~ — 已定（#51 调研，落地在 #54）

**决定：用 `ctx.connection.rpc`，不用 Typert Gateway。** `@deepseek-ai/dsh-client-connection` 两侧各暴露一半：Host 侧 `ctx.connection.rpc.handle('/scrum', handler, { authority: 'loopback' })` 注册一条逻辑通道，浏览器侧 `ctx.connection.rpc.call('/scrum', endpoint, payload)` 调用它。两者都是公开类型，不需要 Typert 代码生成，也不需要 `@deepseek-ai/dsh-api-gateway` 的 descriptor。

传输层的 `RpcResult` 错误码是封闭 union（`bad-request` / `internal` / …），装不下 `ConflictError` 的 `expectedRevision` / `actualRevision`。因此约定：**传输失败走 `RpcResult` 的 error 分支，业务失败走我们自己的信封**（`{ ok: false, error: SerializedScrumError }`）放在 `ok: true` 的 value 里。UI 侧 `toFailure` 按结构读 `code`，序列化往返后仍然认得出 Conflict。

Adapter 本身属于 #54，#51 起 UI 只依赖 `ScrumClient` 接口。

### A16. 确认门注册在整个 Context 上，不是 Agent Scope

`registerScrumConfirmation(ctx)` 会看到该 Context 里所有工具调用（对非 Scrum 工具一律返回 `allow`，行为上无害）。更整洁的做法是注册到 Scrum 的 Agent Scope，但那要等 #54 组合层显示出这个 scope 在哪。

### A17. `sessions/<instance>/<session>.json` 还没有 Adapter

Schema 和 Port 都定了（#47），Community 的落盘实现属于 #54。

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
- **B20. 归档是独立入口状态，不是 `bound` 上的一个 flag**（#46）。需要调用方记得查 flag 的设计，一定会有人忘了，然后给出一个 Host 随后拒绝的编辑入口。
- **B21. Workspace 路径存指纹不存原文**（#46）。路径可能含人名、客户名或未发布产品名，而 `.scrum/` 常被提交进用户仓库；摘要照样能回答"是不是同一个目录"。
- **B22. 属于别的 Workspace 的 Session 记为"无 Session"**（#46）。审计日志指向一段无关对话，比不指向任何对话更糟。
- **B23. Agent 侧是"二次收窄"而非第二条执行路径**（#48）。用例问角色允不允许，Agent API 问 Session 给了多大范围；两个问题都必须成立。
- **B24. Off Session 看不到工具，而不是看到后被拒**（#48）。模型看到不能用的工具会试、被拒、再换个形状试；看不到就一个 turn 都不会花。工具描述本身也会泄露 Session 没被授予什么。
- **B25. 工具返回值有硬上限，且必带 `total` / `truncated`**（#48）。返回摘要而非实体：结果会被重放进后续每一个 turn。
- **B26. Revision 冲突返回结构化数据而非抛错，且附带"该怎么办"**（#49）。只报当前 revision 不说怎么办，会诱导模型拿刚拿到的数字重发同一个调用 —— 那就是故意写出的 lost update。工具永不自动重试。
- **B27. 高风险工具用 `tools/pre-execute` 返回 `ask`**（#49）。没有 Approval Service 的部署会把 `ask` 变成拒绝，方向正确：联系不到人的 Agent 不该以"当时没人反对"为由关掉别人的 Sprint。
- **B28. `scrum-ui` 的异步部分抽成 Controller，组件对状态纯函数**（#50）。组件内部 fetch 只能靠"渲染后等待"来测，实际结果是没人等的状态就没人测。
- **B29. 项目 Key 不从名称推导**（#50）。它是所有工作项编号的前缀且不可更改，中文项目名下任何推导都是猜。
- **B10. `EntitlementService.limit()` / `LimitName` 不进 domain**（#37）。没有任何领域规则消费数值上限，把它拉进来等于把 Edition 关注点下沉到 domain。
- **B30. `scrum-ui` 依赖 `scrum-domain`**（#51）。实体形状（`WorkItem` / `Sprint` / 状态与优先级词表）不再在 UI 里重新声明。第二份声明就是会漂移的那份，而 domain 是纯数据与规则，UI 依赖它不引入任何运行时。`ScrumClient` 的命令与查询类型仍然由 UI 自己定义 —— 那才是 UI 与「背后是谁」的契约。
- **B31. 业务失败按结构分类，不按 `instanceof`**（#51）。同一个 `ScrumClient` 接口既在进程内实现也跨传输实现，序列化后重建的错误是同一个失败；只认类的检查会把每一个远程 Conflict 归成 unknown，而那恰好是最需要提示刷新的场景。
- **B32. 空列表要区分「项目是空的」和「筛选太窄」**（#51）。两者在屏幕上长得一样，需要的下一步却相反。合并成一个空状态，就是用户以为 Backlog 丢了的那条路径。
- **B33. 冲突不自动刷新、不自动重试**（#51）。自动刷新会丢掉用户正在输入的内容；拿错误里报的 revision 重发就是把 lost update 写出来。屏幕给一个刷新按钮，由用户按。
- **B34. 排序用上移/下移按钮，不用拖拽**（#51）。拖拽在键盘上不可达，而排 Backlog 是 Product Owner 的主要动作。目标位置按整条排序列表算，不按当前分组算 —— rank 是项目级的一条序。
- **B35. 估算输入框留空 = 未估算，不是 0**（#51）。Sprint 进度把两者分开计数，表单把一个变成另一个会让「全部已估算」这句话失真。
- **B36. 验收标准立即写入，不进表单草稿**（#51）。它按位置寻址，本地改过顺序的列表会让勾选落到存储里的另一条上。
- **B37. 归档项目隐藏写入入口是体面，不是检查**（#51）。Host 无论如何都会拒绝；隐藏只是省掉一个必然通向拒绝的入口。

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
  - E-1.3 Application：#43 ✅、#44 ✅、#45 ✅ —— **完整交付**。
  - E-1.4 Harness Host/Agent：#46 ✅（PR #67）、#47 ✅（PR #68）、#48 ✅（PR #69）、#49 ✅（PR #70）—— **完整交付**。
  - E-1.5 UI：#50 ✅（PR #71）。#51、#52、#53 待做。
  - E-1.6：#54 组合、#55 端到端验收，待做。
  - #43–#50 按你的授权，测试通过即自行合并；#51 起恢复逐个确认。
