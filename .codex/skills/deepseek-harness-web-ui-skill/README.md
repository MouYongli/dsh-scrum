# DeepSeek Harness Web UI Skill

面向 DeepSeek Harness 插件开发的 Web UI 设计与实现 Skill。

适用于：

- Harness 插件主页
- Agent 工作区
- Task / Run / Session 页面
- Tool 调用面板
- Human-in-the-loop 审批界面
- Artifact、日志和执行结果展示
- 插件设置页
- 响应式 Web 管理界面

本 Skill 不包含 Electron 原生窗口、桌面标题栏、系统托盘、原生文件菜单等内容。

## 在本仓库中的位置

`SKILL.md` 的正文是 Harness 插件界面的通用规则；本仓库自己的界面契约写在两份
reference 里，两者冲突时以本仓库为准：

- `references/scrum-surface.md`：Slot 挂载点、六个工作台分区、首次进入状态、
  模式切换契约。
- `references/harness-theme-tokens.md`：主题 Token 绑定规则，实际样式表在
  `packages/harness/scrum-harness-client/src/client/styles.ts`。

工程约束以仓库根目录的 `AGENT.md` 为准，实测 Slot 契约见
[开发指南](../../../docs/development/dsh-dev-guide.md)。

界面用 React 18 加 `createElement` 编写，没有 JSX 构建步骤，没有 Tailwind，也没有
运行时 CSS-in-JS。

## 目录

```text
deepseek-harness-web-ui-skill/
├── SKILL.md
├── README.md
├── references/
│   ├── scrum-surface.md
│   ├── harness-theme-tokens.md
│   ├── harness-plugin-ui.md
│   ├── agent-workspace-patterns.md
│   ├── run-and-task-states.md
│   ├── approval-and-tool-ui.md
│   ├── accessibility.md
│   ├── responsive-design.md
│   └── anti-patterns.md
├── templates/
│   ├── plugin-ui-brief.md
│   └── ui-review.md
└── examples/
    └── example-prompts.md
```

Skill 不带截图或审计脚本：插件没有独立的 dev server，界面挂在真实 Harness Shell
的 Sidebar 入口后面，直接打开 URL 的脚本到不了那个页面。评审循环见 `SKILL.md`
第 16 节和[本地开发循环](../../../docs/development/local-development.md)。

## 使用

本 Skill 随仓库分发，Codex 从 `.codex/skills/` 读取，Claude Code 从
`.claude/skills/` 读取同一份内容。

## 推荐调用

```text
Use the deepseek-harness-web-ui skill to design and implement
the Web UI for this Harness plugin.

Preserve the existing plugin contract and backend APIs.
Focus on task state, agent activity, tools, approvals,
artifacts, logs, errors, recovery, and responsive layout.
```
