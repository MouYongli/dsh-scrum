# DeepSeek Harness Scrum 开发指南

## 1. 文档目的

本文面向开发和维护 Scrum 插件的工程人员，说明产品如何集成 DeepSeek Harness，包括公开插件机制、界面扩展点、Workspace 与 Session、Agent 工具与授权，以及 Scrum 页面的交互状态。

本文基于截至 2026-08-20 的公开资料整理。DeepSeek Harness 当前仍处于 Developer Preview，可能发生破坏兼容性的变更，因此插件必须声明并检测兼容的 Harness 版本范围。

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

## 4. 当前扩展限制

当前 Sidebar 公开的主要子插槽是：

```text
sidebar
├─ sidebar.workspaces
└─ sidebar.settings
```

目前没有明确公开以下通用扩展点：

```text
sidebar.primaryActions
sidebar.topActions
application.view
```

因此，仅使用现有标准 Slot，无法干净地实现以下完整需求：

1. 在 Sidebar 顶部增加 Scrum 主按钮。
2. Scrum 页面在尚未创建 Session 时也能打开。
3. 点击 Scrum 后，用工作区级 Scrum 页面替换 Conversation 和 Details 区域。

现有可选方案：

| 方案 | 做法 | 问题 |
|---|---|---|
| 替换整个 Sidebar 和主布局 | 用 Bundle Patch 覆盖内置插件配置 | 与 Harness 内部结构高度耦合，升级成本高 |
| 注册 Conversation View | 把 Scrum 注册为 `conversation.view` | 必须先有 Session，不符合工作区级产品模型 |
| 增加通用扩展点 | 为 Sidebar 操作和应用主页面增加 Slot | 兼容性和可维护性最好 |

推荐向 DeepSeek Harness 上游提交通用扩展点，而不是提交 Scrum 专用接口。

## 5. 建议的通用扩展点

建议增加：

```text
sidebar.primaryActions
application.view
```

目标结构：

```text
root
└─ AppFrame
   ├─ sidebar
   │  ├─ sidebar.brand
   │  ├─ sidebar.primaryActions
   │  │  ├─ New Session
   │  │  └─ Scrum
   │  ├─ sidebar.workspaces
   │  └─ sidebar.settings
   │
   └─ application.view
      ├─ conversation
      └─ scrum
```

其中：

- `sidebar.primaryActions` 是有序列表 Slot。
- `application.view` 是按 Key 选择的页面 Slot。
- Conversation 是默认页面。
- Scrum 在没有当前 Session 时仍然可用。
- Workspace 切换不应销毁全局页面状态。
- Sidebar 折叠后 Scrum 显示为图标。
- 页面切换由 Layout 或 Navigation Service 管理，不使用 DOM 操作或非正式 URL Hack。

概念性注册方式：

```ts
ctx.slots.inject('sidebar.primaryActions', () =>
  ctx.slots.register(
    {
      name: 'sidebar.primaryActions',
      key: 'scrum',
      order: 20,
    },
    ScrumSidebarButton,
  ),
)

ctx.slots.inject('application.view', () =>
  ctx.slots.register(
    {
      name: 'application.view',
      key: 'scrum',
      label: 'Scrum',
    },
    ScrumApplication,
  ),
)
```

以上代码只是建议的接口形态，最终实现必须遵循目标 Harness 版本的 Slot Contract。

## 6. 改造后界面

### 6.1 对话模式

```text
┌──────────────────┬─────────────────────────────────────┬───────────────┐
│ DeepSeek Harness │ Conversation                        │ Details       │
│ [＋ New Session] │                                     │               │
│ [▦ Scrum]        │ 当前对话标题                         │ 工具调用详情    │
│──────────────────│                                     │               │
│ [搜索][添加][视图]│ 用户与 Agent 对话                    │               │
│                  │                                     │               │
│ ▼ shop-service   │                                     │               │
│   优惠券接口      │                                     │               │
│   修复支付问题    │                                     │               │
│                  │ [输入消息……]                 [发送] │               │
│ [Settings]       │                                     │               │
└──────────────────┴─────────────────────────────────────┴───────────────┘
```

### 6.2 Scrum 模式

```text
┌──────────────────┬─────────────────────────────────────────────────────┐
│ DeepSeek Harness │ Scrum                                               │
│ [＋ New Session] │                                                     │
│ [▦ Scrum] ●      │ 工作区：shop-service                 [切换工作区 ▾] │
│──────────────────│─────────────────────────────────────────────────────│
│ [搜索][添加][视图]│ [概览] [Backlog] [Sprint 看板] [报告] [项目设置]    │
│                  │                                                     │
│ ▼ shop-service   │ Sprint 12：优惠券结算                               │
│   优惠券接口      │ 目标：用户可以安全、正确地使用优惠券                 │
│   修复支付问题    │                                                     │
│                  │ ┌──────────┬──────────┬──────────┬──────────┐       │
│ ▶ mobile-app     │ │ 待处理    │ 进行中    │ 测试中    │ 已完成    │       │
│                  │ │ SCR-18   │ SCR-12   │ SCR-15   │ SCR-09   │       │
│ [Settings]       │ └──────────┴──────────┴──────────┴──────────┘       │
└──────────────────┴─────────────────────────────────────────────────────┘
```

Scrum 页面占据原 Conversation 和 Details 空间。工作项详情由 Scrum 页面自己的抽屉或面板承载，不强制复用对话工具详情面板。

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
│ [创建新的 Scrum 项目]                                 │
│ [绑定已有 Scrum 项目]       Teams / Enterprise        │
│                                                       │
│ 项目名称：shop-service                                │
│ Sprint 周期：2 周                                     │
│ 工作流：待处理 → 进行中 → 测试中 → 已完成              │
└───────────────────────────────────────────────────────┘
```

### 7.3 Workspace 已绑定项目

直接打开该项目上次访问的页面，例如概览、Backlog、当前 Sprint 或报表。由于一个 Workspace 最多绑定一个 Scrum Project，不应反复要求用户选择项目。

## 8. Workspace 与项目集成

### 8.1 核心关系

插件必须遵循以下关系：

- 一个 Harness Workspace 可以包含零个或多个 Session。
- 一个 Workspace 可以绑定零个或一个 Scrum Project。
- 一个 Session 可以操作绑定的 Scrum Project，也可以完全不使用 Scrum。
- Workspace 已绑定项目，不代表其中所有 Session 自动获得项目权限。
- Scrum Project 数据不能以 Session Log 为权威来源。

```text
Harness Instance
└─ Workspace 1 ───── 0..1 ───── Scrum Project
   ├─ Session A ─── Scrum access: OFF
   ├─ Session B ─── Scrum access: READ
   └─ Session C ─── Scrum access: WRITE
```

### 8.2 Workspace 身份

根据 Harness 的公开定义，Workspace 是一个代码目录的持久记录，包含稳定的 Workspace ID、规范化目录路径、显示名称和所属 Session ID 列表。Session 通过自身的 `cwd` 与 Workspace 的规范化路径验证成员关系，一个 Session 在结构上最多属于一个 Workspace。

参考资料：[DeepSeek Harness Workspace 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/workspace.md)

Workspace 和 Session ID 只应被视为某个 Harness 实例中的稳定标识。Teams 和 Enterprise 可能存在多台 Harness 主机，因此所有跨实例引用必须同时携带 `harness_instance_id`：

```text
(harness_instance_id, harness_workspace_id)
(harness_instance_id, harness_session_id)
```

不能假设 Workspace ID 或 Session ID 在所有客户、设备和部署之间全局唯一。具体绑定和 Session Context Schema 见[系统架构](architecture.md#8-harness-绑定与活动模型)。

### 8.3 Workspace 生命周期

插件需要处理以下情况：

- **Workspace 改名**：绑定使用稳定 Workspace ID，不受显示名称变化影响。
- **Workspace 路径变化**：使用 Workspace ID 作为主引用，路径指纹只用于检测异常，不使用路径作为外键。
- **Workspace 从 Harness 删除**：默认不删除 Scrum Project；将 Workspace Link 标记为失效或解除，项目数据仍然保留。
- **Workspace 重新添加**：如果产生新的 Workspace ID，不应只根据路径自动恢复远端项目绑定；提示用户确认后重新绑定。
- **Scrum Project 归档**：Workspace Link 可以保留，但页面显示只读归档状态；Session 的 Write 权限自动降级为 Read 或 Off。

## 9. Session 与 Agent 授权

### 9.1 Session Scrum Access

每个 Session 独立设置 Scrum 访问模式，默认值为 `Off`，遵循最小权限原则：

| 模式 | Agent 能力 |
|---|---|
| Off | 不显示 Scrum 工具，不注入项目上下文 |
| Read | 可以查询项目、Sprint、Backlog 和工作项 |
| Write | 可以在当前用户权限范围内创建和修改数据 |

建议在对话输入框附近显示：

```text
[模型：DeepSeek V4] [权限：Workspace Write] [Scrum：Off ▾]
```

选择菜单：

```text
Scrum access

● Off
○ Read project
○ Read and update project
```

启用时从当前 Workspace Link 解析项目并写入 Session Scrum Context。每次操作仍要重新验证 Session、Workspace 和当前绑定是否一致，不能把启用时的结果永久当作授权事实。

### 9.2 最终权限计算

Agent 的最终权限是多个权限层的交集：

```text
最终权限 =
    版本能力
  ∩ 用户项目角色权限
  ∩ Session Scrum Access
  ∩ 操作级安全策略
```

例如，用户角色为 Developer、Session Scrum Access 为 Write，但项目策略规定 Developer 不能删除 Sprint，则 Agent 可以更新任务但不能删除 Sprint。

前端隐藏入口不能替代权限检查。每次写操作都必须重新检查当前用户、项目角色、Session 授权、操作策略和资源版本。

### 9.3 Agent 工具

Harness 支持在全局或 Agent Scope 中注册工具。Scrum 工具只应在允许使用 Scrum 的 Session 或 Agent Scope 中可见，避免全局注册后仅依靠工具内部拒绝。

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
2. 向 Harness 上游提交 Sidebar 主操作与应用页面的通用 Slot。
3. 将 Scrum 拆分为 Host 插件和 Client 插件，通过 Bundle 安装。
4. 为工作区选择、空项目、已绑定项目、归档项目和失效绑定分别实现状态页面。
5. 实现 Session Scrum Access 和按 Scope 注册的 Agent 工具。
6. 使用 Harness 标准主题变量、国际化和 Slot Props Contract。
7. 避免直接依赖 `ui-sidebar`、`ui-layout` 等插件的内部 React 组件。
8. 为 Slot 注册、页面切换、折叠 Sidebar、无 Session 状态、权限降级和绑定变化建立兼容性测试。

## 11. 插件与独立应用的边界

Harness 插件位于 `packages/harness/`，由 Host、Client、Agent Tools 和 Bundle 组成。`apps/scrum-server` 不是插件，而是 Teams/Enterprise 连接的独立后端；Community 不启动该服务，直接通过 Host 插件读写 Workspace 下的 `.scrum/` JSON/JSONL 数据。

模块、数据和存储设计见[系统架构](architecture.md)，版本能力见[版本设计](../product/editions.md)。
