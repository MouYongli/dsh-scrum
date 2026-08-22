# DeepSeek Harness Scrum 开发指南

## 1. 文档目的

本文面向开发和维护 Scrum 插件的工程人员，说明产品如何集成 DeepSeek Harness，包括公开插件机制、界面扩展点、Workspace 与 Session、Agent 工具与授权，以及 Scrum 页面的交互状态。

第 4 节与第 5 节的扩展点内容来自 `0.1.0-rc.8` 已发布包的类型定义与实现；其余章节基于公开资料整理。DeepSeek Harness 当前仍处于 Developer Preview，可能发生破坏兼容性的变更，因此插件必须声明并检测兼容的 Harness 版本范围。

参考资料：

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [插件开发入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md)
- [UI Layout](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.md)
- [UI Sidebar](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar/README.md)
- [UI Workspace](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-workspace/README.md)
- [UI Conversation](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/README.md)

## 2. 当前插件机制

DeepSeek Harness 基于 Cordis，产品中的模型适配器、工具、会话、Agent Loop 和 Web UI 等能力都由插件组成。

一个基础插件通常是导出 `apply` 函数的 TypeScript 模块：

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'scrum-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // 注册服务、工具、事件和界面贡献。
}
```

插件可以通过 Bundle 分发，并通过 `dsh plugin` 安装到指定 Profile。插件通过 `inject` 声明依赖，由 Cordis 在依赖满足后加载，并在卸载时自动撤销通过上下文注册的能力。

Web Client 不允许业务插件任意插入 React 组件。界面必须通过 Slot 系统注册：

```ts
ctx.slots.register(...)
```

组件只能注册到宿主已声明的 Slot。跨插件协作应使用 Slot 或 Cordis Service，不能直接导入其他界面插件的内部组件。

## 3. 当前界面

DeepSeek Harness Web UI 使用三栏布局：

```text
┌──────────────────┬─────────────────────────────────────┬───────────────┐
│ Sidebar          │ Conversation                        │ Details       │
│ 左侧栏           │ 对话主区域                           │ 详情面板       │
│                  │                                     │               │
│ DeepSeek Harness │ 当前对话标题                         │ 工具调用详情    │
│ [+ New Session]  │ [Chat] [Trajectory] ...             │ 文件/任务详情   │
│                  │                                     │               │
│ [搜索][添加][视图]│ 用户消息                            │               │
│                  │ AI 回复                             │               │
│ ▼ Workspace A    │ 工具调用                            │               │
│   Session 1      │                                     │               │
│   Session 2      │                                     │               │
│                  │                                     │               │
│ ▶ Workspace B    │                                     │               │
│                  │ [模型][权限] 输入消息……       [发送] │               │
│ [Settings]       │                                     │               │
└──────────────────┴─────────────────────────────────────┴───────────────┘
```

主要行为：

- Sidebar 顶部显示品牌、折叠控制和 New Session。
- Sidebar 中部由 `ui-workspace` 显示 Workspace 和 Session。
- Sidebar 底部显示 Settings。
- 未选择 Workspace 时，对话区显示 Workspace 选择入口。
- 选择 Workspace 后可以创建和使用 Session。
- 一个 Workspace 可以包含多个 Session。
- Details 默认关闭，可在查看工具调用等内容时打开。

## 4. 实测扩展点

本节内容来自 `0.1.0-rc.8` 已发布包的类型定义与实现，不是推断。升级目标版本时按[Harness 兼容矩阵](harness-compatibility.md)第 7 节重新核对。

### 4.1 Slot 注册

界面贡献通过 Slot 注册，签名是「先等声明，再注册」：

```ts
ctx.slots.inject('sidebar.footer.action', () =>
  ctx.slots.register({ name: 'sidebar.footer.action', id: 'scrum', order: -1 }, Component),
)
```

`ctx.slots.inject(name, callback)` 把某个 Slot 的**声明**当作依赖：声明存在时同步执行回调，不存在则等待；声明消失会撤销回调注册的一切，重新声明会再跑一次。回调返回一个 disposer 或一个 disposer 迭代器，因此 generator 可以把多次 `register` 当作一次事务，中途失败会回滚已注册的部分。

直接对未声明的 Slot 调用 `ctx.slots.register()` 会抛错，所以跨插件注册一律走 `inject`。

Slot 的类型契约通过模块扩展声明：

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: SidebarFooterActionOwnerProps }
  }
}
```

`kind` 为 `single` 的 Slot 只接受一个占位者且通常已被内置插件占用；`list` 可以多方注册，用 `order` 排序。

### 4.2 现有 Slot

Sidebar 由 `@deepseek-ai/dsh-client-ui-sidebar` 声明三个：

| Slot | kind | 现状 |
|---|---|---|
| `sidebar.workspaces` | single | 已被 ui-workspace 占用，Workspace 与 Session 浏览器 |
| `sidebar.settings` | single | 已被 ui-settings 占用，底部设置入口 |
| `sidebar.footer.action` | list | **可用**，Settings 旁边的附加操作，owner props 只给栏宽状态 `wide` |

其他可用落点：

| Slot | 用途 |
|---|---|
| `shell.overlay` | 根级全局浮层，可覆盖对话主区与详情区，是整页工作台的落点；`list` 型，**无 owner props** |
| `conversation.input.dock` | 输入框上方的附加条，宿主的目标/待办 chip 也在这里 |
| `tool.call.toolview` | 按工具名注册的工具调用卡片视图 |

**`sidebar.primaryActions` 与 `application.view` 不存在**，本文早前版本据此提出的上游 Slot 提案不再需要：整页工作台用 `shell.overlay` 就能实现，无需修改宿主布局。

`shell.overlay` 的容器是 `position: absolute; inset: 0`，覆盖整个 Frame，**包含 Sidebar 列**。注册方拿不到任何列几何：

- Slot 声明是 `{ kind: 'list'; scope: 'root' }`，没有 owner props。
- `ctx.layout` 只有 `toggleSidebar`、`openDetails` 和 `closeDetails`，没有几何读取。
- 列宽存在根入口的私有 layout store 里，Frame 以内联 `grid-template-columns` 写出，不是 CSS 变量。
- 该容器是绝对定位元素，其子元素也拿不到 Grid 列。

因此「从 Sidebar 右缘起」只能由浮层自行测量。本仓库的做法是**只从本插件自己的元素出发**：Sidebar 入口 `[data-scrum-entry]` 是我们注册的，且折叠时也渲染，所以从它向上走到 Frame 的直接子元素即得 Sidebar 列，全程不触碰宿主的 class 名或组件。Sidebar 可拖拽也可折叠，测量因此用 `ResizeObserver` 保持跟随；走不到列时退回覆盖整个 Frame，而不是按猜的数字缩进。

### 4.3 浏览器产物的加载契约

Client 半边不是被 Node 端 import 的，而是由 `@deepseek-ai/dsh-client-modules` 提供给浏览器：

1. Node 半边扫描**已启用的 Loader entry**，找出声明了 web `dsh.client` 的包。
2. 解析该包的 `exports["./client"]`，把构建产物哈希进 boot graph，在 `/plugins` 下提供。
3. 浏览器执行该脚本时**只注册工厂**：`window.__ModuleLoader__.load({ id, factory })`。
4. 模块体的副作用（包括样式注入）留在工厂闭包里，materialize（`factory(require)`）时才执行。

包清单声明形如：

```json
{
  "exports": { "./client": "./dist/client.js" },
  "dsh": { "client": { "platform": "web" } }
}
```

`dsh.client` 还接受可选的 `inject`（字符串数组）与 `immediately`（布尔）。声明了 `dsh.client` 却没有 `exports["./client"]` 会直接报错。

两个实测得出的硬性要求：

- **包必须导出 `"./package.json": "./package.json"`**。Loader 读包自身的清单来定位浏览器产物，取不到时**静默跳过**该插件：没有报错，Boot Graph 里也没有它的条目。Harness 自己的每个包都带这一行。
- **Patch 行里的包名从 Profile 目录解析**。Profile 里只装了 Bundle，它的依赖在 pnpm 隔离布局下只链在 Bundle 自己的 `node_modules` 中，因此把内部包名直接写进 patch 会让整个 Shell 启动失败（`ERR_MODULE_NOT_FOUND`）。正确做法是 patch 只写 Bundle 一行，由 Bundle re-export 各半边。

产物必须是 CJS 工厂形式，externals 取宿主的固定模块表（React、cordis、`@deepseek-ai/dsh-client-*` 等）。表外的 specifier 在 `require` 时抛错，错误信息会指出是构建期 externals 漂移还是跨插件值导入。

## 5. Scrum 界面的落点

据 4.2 的实测结果，Scrum 界面按以下方式接入，不使用 DOM Hack，也不替换宿主内置插件：

```text
sidebar.footer.action     Scrum 入口（列表型 Slot，与 Settings 并列）
shell.overlay             Scrum 工作台整页浮层，覆盖对话主区与详情区
conversation.input.dock   当前会话的焦点事项 chip（可选）
tool.call.toolview        Scrum 工具调用卡片（按工具名注册）
```

要点：

- **Scrum 是与「对话」并列的工作模式，不是需要手动关闭的浮层。** Shell 只有 conversation 和 scrum 两种模式；点会话进对话，点 Scrum 进 Scrum。
- 工作台是根级浮层，处于对话模式时不渲染任何内容，因此**每次进入 Scrum 都是重新挂载并重新加载**，页内状态（页签、筛选、选中项）不跨模式保留。
- 入口位于 Sidebar 底部而非顶部：宿主未开放顶部操作 Slot，底部 `sidebar.footer.action` 是唯一的附加操作位。入口在 Scrum 模式下需要显示选中态，且**两种模式下都必须渲染**——浮层的左缘偏移是从它出发测量的。
- Sidebar 折叠时 owner props 的 `wide` 变为 `false`，入口需要自行退化为图标。
- 没有 Session 时 Scrum 界面仍应可用：浮层不依赖会话存在。
- 浮层自行测量几何尺寸，不修改宿主布局的列结构。

模式切换的实测契约：

- **宿主不发布「用户选中了某个 Session」事件。** 唯一可观察的是 `sessions.list` 快照里的 `current`。点会话行、点 `＋ New Session`、连接 Workspace 三件事都经由它：`workspaces.startSession()` 连接工作区并打开会话，完全没有工作区时改为 `sessions.clear()`。所以一条规则覆盖三个入口。
- 两类变化不算导航：`phase` 仍为 `pending` 的列表还在装配基线；宿主自己的启动选择（Boot 后放上屏幕的第一个会话）是它在追赶而不是用户在移动。都不得把刚进入 Scrum 的用户弹出去。
- **重复点击已经选中的那个会话观察不到**，快照没有变化，工作台不会退出。契约层面无解，见[已知限制](../product/known-limitations.md)。
- Esc 也返回对话，但必须放过输入法正在持有的那一次（`isComposing` 或 `keyCode === 229`）与内层已经 `preventDefault` 的那一次，并且挂在冒泡阶段——捕获会把 Esc 从工作台内的输入框手里抢走，而本项目文案是中文、表单全是文本框。
- 只有存在未保存的编辑内容时才提问；普通浏览直接返回。提问期间**不能切换模式**：持有草稿的表单在浮层子树里，先切模式会把被问的东西一起卸载掉。

Client Context 需要注入的服务按用途声明，例如 `['slots', 'connection', 'workspaces', 'sessions']`；未声明的服务不会出现在 `ctx` 上。

## 6. 改造后界面

### 6.1 对话模式

```text
┌──────────────────┬─────────────────────────────────────┬───────────────┐
│ DeepSeek Harness │ Conversation                        │ Details       │
│ [＋ New Session] │                                     │               │
│──────────────────│ 当前对话标题                         │ 工具调用详情    │
│ [搜索][添加][视图]│                                     │               │
│                  │ 用户与 Agent 对话                    │               │
│ ▼ shop-service   │                                     │               │
│   优惠券接口      │                                     │               │
│   修复支付问题    │                                     │               │
│                  │ [输入消息……]                 [发送] │               │
│ [Settings][▦ Scrum]                                    │               │
└──────────────────┴─────────────────────────────────────┴───────────────┘
```

### 6.2 Scrum 模式

```text
┌──────────────────┬─────────────────────────────────────────────────────┐
│ DeepSeek Harness │ Scrum                                               │
│ [＋ New Session] │                                                     │
│──────────────────│ 工作区：shop-service                 [切换工作区 ▾] │
│ [搜索][添加][视图]│─────────────────────────────────────────────────────│
│                  │ [概览] [Backlog] [Sprint 看板] [报告] [项目设置]    │
│ ▼ shop-service   │                                                     │
│   优惠券接口      │ Sprint 12：优惠券结算                               │
│   修复支付问题    │ 目标：用户可以安全、正确地使用优惠券                 │
│                  │ ┌──────────┬──────────┬──────────┬──────────┐       │
│ ▶ mobile-app     │ │ 待处理    │ 进行中    │ 测试中    │ 已完成    │       │
│                  │ │ SCR-18   │ SCR-12   │ SCR-15   │ SCR-09   │       │
│ [Settings][▦ Scrum] ●                                  │              │
└──────────────────┴─────────────────────────────────────────────────────┘
```

Scrum 工作台是注册在 `shell.overlay` 的根级浮层，从 Sidebar 右缘起覆盖原 Conversation 和 Details 空间，回到对话模式后两栏原样恢复。Sidebar 底部入口在 Scrum 模式下带选中态（图中 `[▦ Scrum]` 后的 `●`），工作台头部提供「返回对话」，Esc 同样返回。该左缘偏移不在 Slot 契约里，由浮层自行测量，做法见 4.2。入口位于 Sidebar 底部的 `sidebar.footer.action`，与 Settings 并列——宿主没有开放顶部操作 Slot。工作项详情由工作台自己的抽屉承载，不复用对话的工具详情面板。

## 7. 首次进入状态

### 7.1 未选择 Workspace

```text
┌───────────────────────────────────────────────────────┐
│                         Scrum                         │
│                                                       │
│             请先选择一个代码工作区                     │
│                                                       │
│             [选择已有工作区]                           │
│             [添加本地工作区]                           │
└───────────────────────────────────────────────────────┘
```

### 7.2 Workspace 尚未绑定 Scrum Project

```text
┌───────────────────────────────────────────────────────┐
│ shop-service                                          │
│                                                       │
│ 此工作区尚未启用 Scrum 项目管理                        │
│                                                       │
│ [创建本地项目]                                        │
│ [连接团队 Scrum]                                      │
│                                                       │
│ 当前 Edition：Community · Local · Personal Tenant     │
└───────────────────────────────────────────────────────┘
```

用户不选择 Teams 或 Enterprise。「连接团队 Scrum」只启动登录与远程项目选择；最终 Edition
由服务握手和许可证返回。工作台头部显示解析后的 Edition、服务和 Tenant，但页面功能始终按
Capability 与当前用户 Permission 控制，不能按 Edition 名称分支。连接入口不得卸载本地项目
表单，用户已经输入的草稿仍由统一离开保护管理。

### 7.3 Workspace 已绑定项目

直接打开该项目上次访问的页面，例如概览、Backlog、当前 Sprint 或报表。由于一个 Workspace 最多绑定一个 Scrum Project，不应反复要求用户选择项目。

**尚未实现**：当前每次进入 Scrum 都从 Backlog 开始。这与第 5 节的「离开即卸载」直接冲突——要记住上次访问的页面，就得让浮层在对话模式下保持挂载，届时才需要显式的工作区身份来决定何时丢弃这份记忆（现在由重新挂载顺带完成）。

## 8. Workspace 与项目集成

### 8.1 核心关系

插件必须遵循以下关系：

- 一个 Harness Workspace 可以包含零个或多个 Session。
- 一个 Workspace 可以绑定零个或一个 Scrum Project。
- 一个 Session 可以操作绑定的 Scrum Project，也可以完全不使用 Scrum。
- Workspace 已绑定项目后，其中所有 Session 按当前用户的 Project 角色与权限使用 Scrum。
- Scrum Project 数据不能以 Session Log 为权威来源。

```text
Harness Instance
└─ Workspace 1 ───── 0..1 ───── Scrum Project
   ├─ Session A ─── inherits current user's Project permissions
   ├─ Session B ─── inherits current user's Project permissions
   └─ Scrum Agent ─ inherits current user's Project permissions
```

Session ID 仅作为 Activity 的可选来源，不是授权边界，也不持久化独立 Scrum Access。

### 8.2 Workspace 身份

根据 Harness 的公开定义，Workspace 是一个代码目录的持久记录，包含稳定的 Workspace ID、规范化目录路径、显示名称和所属 Session ID 列表。Session 通过自身的 `cwd` 与 Workspace 的规范化路径验证成员关系，一个 Session 在结构上最多属于一个 Workspace。

参考资料：[DeepSeek Harness Workspace 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/workspace.md)

Workspace 和 Session ID 只应被视为某个 Harness 实例中的稳定标识。Remote 模式可能存在多台 Harness 主机，因此所有跨实例引用必须同时携带 `harness_instance_id`：

```text
(harness_instance_id, harness_workspace_id)
(harness_instance_id, harness_session_id)
```

不能假设 Workspace ID 或 Session ID 在所有客户、设备和部署之间全局唯一。具体绑定和 Session Activity Context 见[系统架构](architecture.md#8-harness-绑定与活动模型)。

### 8.3 Workspace 生命周期

插件需要处理以下情况：

- **Workspace 改名**：绑定使用稳定 Workspace ID，不受显示名称变化影响。
- **Workspace 路径变化**：使用 Workspace ID 作为主引用，路径指纹只用于检测异常，不使用路径作为外键。
- **Workspace 从 Harness 删除**：默认不删除 Scrum Project；将 Workspace Link 标记为失效或解除，项目数据仍然保留。
- **Workspace 重新添加**：如果产生新的 Workspace ID，不应只根据路径自动恢复远端项目绑定；提示用户确认后重新绑定。
- **Scrum Project 归档**：Workspace Link 可以保留，但页面和 Agent 权限自动收窄为只读。

## 9. Workspace 与 Agent 授权

### 9.1 Workspace 继承

Workspace 绑定 Scrum Project 后，该 Workspace 下的所有 Session 和 Scrum 工作台内的 Agent 自动继承当前用户的有效 Project 权限。产品不提供逐 Session 的 Off、Read 或 Write 开关。

每次操作重新解析 Workspace Link、当前用户和 Project 状态。Session ID 只作为可选 Activity 来源，用于回答操作来自哪次对话，不参与授权，也不单独持久化 Scrum Access。

### 9.2 最终权限计算

Agent 的最终权限是多个权限层的交集：

```text
最终权限 =
    版本能力
  ∩ 用户项目角色权限
  ∩ Project Permission Policy
  ∩ Project 状态
  ∩ 操作级安全策略
```

例如，用户角色为 Developer，但项目策略规定 Developer 不能结束 Sprint，则 Agent 可以更新任务但不能结束 Sprint。

前端隐藏入口不能替代权限检查。每次写操作都必须重新检查当前用户、项目角色、Project Policy、Project 状态、操作策略和资源版本。

### 9.3 Agent 工具

Harness 支持在 Workspace 或 Agent Scope 中注册工具。Scrum 工具只应在 Workspace 已绑定 Project 且当前用户拥有相应 Permission 时可见，避免全局注册后仅依靠工具内部拒绝。

参考资料：[DeepSeek Harness Tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)

建议工具分组：

```text
只读工具
├─ scrum_get_project
├─ scrum_list_backlog
├─ scrum_get_sprint
└─ scrum_get_work_item

普通写工具
├─ scrum_create_work_item
├─ scrum_update_work_item
├─ scrum_move_work_item
└─ scrum_add_comment

高风险工具
├─ scrum_start_sprint
├─ scrum_close_sprint
├─ scrum_delete_work_item
└─ scrum_change_project_settings
```

高风险操作必须要求人工确认并记录完整 Activity，Community 也不例外。Agent 必须使用当前用户身份，不能使用共享管理员身份或绕过 Application Service 直接修改文件。

### 9.4 Scrum Store、Session Log 与 Activity

三类数据有不同职责：

```text
Scrum Store    = 当前权威业务状态
Session Log    = Agent 对话、工具调用和执行结果
Activity Log   = 谁通过哪个入口修改了哪个 Scrum 对象
```

Session Log 只记录必要引用和操作结果，例如：

```json
{
  "projectId": "prj_123",
  "itemId": "SCR-42",
  "action": "move_to_testing",
  "resultRevision": 18
}
```

不要把完整 Story、Sprint 或 Project 复制到每个 Session，否则会产生冲突副本、恢复旧 Session 时覆盖新数据的风险、无意义的日志膨胀，以及多人协作一致性问题。权威数据和 Activity Schema 见[系统架构](architecture.md)。

## 10. 建议实施路线

1. 明确最低和最高兼容 Harness 版本。
2. 按第 4 节的实测契约接入现有 Slot，不向上游提交新的扩展点。
3. 将 Scrum 拆分为 Host 插件和 Client 插件，通过 Bundle 安装。
4. 为工作区选择、空项目、已绑定项目、归档项目和失效绑定分别实现状态页面。
5. 实现 Workspace 继承授权和按有效 Permission 注册的 Agent 工具。
6. 使用 Harness 标准主题变量、国际化和 Slot Props Contract。
7. 避免直接依赖 `ui-sidebar`、`ui-layout` 等插件的内部 React 组件。
8. 为 Slot 注册、页面切换、折叠 Sidebar、无 Session 状态、权限降级和绑定变化建立兼容性测试。

## 11. 插件与独立应用的边界

Harness 插件位于 `packages/harness/`，由 Host、Client、Agent Tools 和 Bundle 组成。Teams/Enterprise 后端位于独立的 `dsh-scrum-server` 项目；本仓库不包含 `apps/scrum-server`。Community 直接通过 Host 插件读写 Workspace 下的 `.scrum/` JSON/JSONL 数据，Remote 模式通过公开 Contract 连接外部服务。

模块、数据和存储设计见[系统架构](architecture.md)，版本能力见[版本设计](../product/editions.md)。
