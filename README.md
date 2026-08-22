# DeepSeek Harness Scrum Plugin

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Scrum 项目管理插件，让用户和 Agent 在同一个 Workspace 中共同维护 Product Backlog、Sprint、看板、工作项和基础度量。

Community MVP 的领域、存储、用例、Harness Host、Agent Tools 和界面已经实现并有测试覆盖；浏览器与 Host 之间的调用通道尚未接通，因此界面还读不到数据。边界见[已知限制](docs/product/known-limitations.md)，上手见[快速开始](docs/product/quick-start.md)。

## 产品概览

产品提供本地和远程两种运行模式：

```text
Local  = Community，本地个人 Scrum
Remote = 连接独立的 Teams / Enterprise 服务
```

本仓库实现共享 Core、Community 本地存储、Harness 插件、UI、Agent Tools、远程连接 Port/Adapter 和版本化 API Contract。Community 直接在 Harness Host 中运行，并将权威数据存放在绑定 Workspace 的 `.scrum/` 目录。

Teams 和 Enterprise 的服务端、商业身份、服务端存储、同步、审计、通知和部署能力由独立的 `dsh-scrum-server` 项目实现。本插件只连接符合公共 Contract 的远程服务，不在客户端推断商业授权。

## 核心原则

- 一个 Harness Workspace 可以包含多个 Session，并绑定零个或一个 Scrum Project。
- Workspace 下的 Session 和 Agent 自动继承当前用户在绑定 Scrum Project 中的有效权限。
- Scrum Store 是业务状态的权威来源，Session Log 只保存对话、工具调用和必要引用。
- 用户、Agent 和 UI 操作同一份权威数据。
- 高风险操作需要确认，并发写入必须检测冲突。
- 插件使用 Harness 公开扩展点，不修改 Harness Agent Loop。

## 代码组织

```text
packages/   Core、Contract、Community、UI、Harness 与远程连接模块
docs/       产品、架构和开发文档
```

本仓库不包含可部署的 Scrum Server 或企业 Admin App。远程服务的仓库边界和 Contract 兼容规则见[系统架构](docs/development/architecture.md)与 [ADR 0003](docs/development/adr/0003-repository-boundary.md)。

## 开发

在本仓库根目录：

```bash
pnpm install

# 提交前
pnpm typecheck && pnpm lint && pnpm lint:deps && pnpm test
pnpm build && pnpm lint:publish

# 挂进 DeepSeek Harness 的 web profile（一次挂载对所有项目生效）
pnpm dev:link && pnpm dev:config
pnpm dev:unlink                       # 用完摘掉
```

也可以绕过仓库脚本，直接调用项目当前验证的 Harness CLI 版本。添加插件时必须传 Bundle 的绝对路径；下面的 `$PWD` 写法需要在本仓库根目录执行：

```bash
# 添加本地 Bundle 到 web profile
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 plugin --profile web add "$PWD/packages/harness/scrum-harness-bundle"

# 验证 web profile 已组合出 Scrum 插件配置
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 --profile web --dump-config

# 按包名从 web profile 移除插件（可在任意目录执行）
npx --yes @deepseek-ai/dsh@0.1.0-rc.8 plugin --profile web remove @dsh-scrum/scrum-harness-bundle
```

如果不在仓库根目录执行添加命令，请将 `$PWD/packages/harness/scrum-harness-bundle` 换成该目录的完整绝对路径。移除命令按包名操作 profile，不依赖当前目录。

在你想用 Scrum 管理的代码项目目录里启动 Harness——启动目录就是 Workspace，数据落在它的 `.scrum/`：

```bash
cd ~/你的代码项目 && npx @deepseek-ai/dsh web
```

挂载后 Sidebar 底部会出现 Scrum 入口，工作台可以打开，但浏览器与 Host 之间的调用通道尚未接通，因此还读不到数据。完整循环、构建、探针与边界说明见[本地开发循环](docs/development/local-development.md)，产品侧边界见[已知限制](docs/product/known-limitations.md)。

## 文档

- [快速开始](docs/product/quick-start.md)：安装、建项目、排 Backlog、跑一个 Sprint，以及让 Agent 参与。
- [已知限制](docs/product/known-limitations.md)：本版仍然存在的边界，以及每一条为什么没解决。
- [Scrum 产品设计](docs/product/scrum.md)：Scrum 概念、角色、产品功能、使用流程和首版范围。
- [版本设计](docs/product/editions.md)：Community、Teams 与 Enterprise 的定位、能力和授权差异。
- [Scrum 术语表](docs/product/glossary.md)：产品文档和界面使用的统一术语。
- [系统架构](docs/development/architecture.md)：运行拓扑、模块、数据模型、存储、一致性、迁移和发布。
- [DeepSeek Harness Scrum 开发指南](docs/development/dsh-dev-guide.md)：插件、UI、Workspace、Session、Agent 工具和权限集成。
- [分级实施计划](docs/development/implementation-plan.md)：Release、Epic、Feature PR 与 Task/commit 的执行顺序和完成标准。
- [架构决策记录](docs/development/adr/README.md)：已生效的工具链、依赖和格式决策及其理由。
- [本地开发循环](docs/development/local-development.md)：提交前的检查、构建，以及把插件挂进 Harness 跑起来。
- [Harness 兼容矩阵](docs/development/harness-compatibility.md)：支持的 Harness 版本范围、依赖方式与升级检查项。
- [发布检查表](docs/development/release-checklist.md)：发布候选版本前逐条执行的检查与需要留存的证据。
- [Git 与 GitHub 协作规范](docs/development/git-workflow.md)：Issue、分支、Commit 和 PR 的命名、内容与合并流程。

仓库内编码 Agent 的实现约束见 [Agent Guide](AGENT.md)。
