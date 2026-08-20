# DeepSeek Harness Scrum Plugin

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Scrum 项目管理插件，让用户和 Agent 在同一个 Workspace 中共同维护 Product Backlog、Sprint、看板、工作项和基础度量。

项目目前处于规格与架构设计阶段，尚无可发布构建。

## 产品概览

产品提供三个版本：

```text
Community  = 免费的本地个人 Scrum
Teams      = Community + 多人协作和共享服务
Enterprise = Teams + 企业治理、安全和私有部署
```

三个版本共享 Domain、Application、API Contract、UI 和 Agent Tools，通过不同的 Storage、Identity、Sync、Audit 与 Notification Adapter 组合能力。

Community 直接在 Harness Host 中运行，并将权威数据存放在绑定 Workspace 的 `.scrum/` 目录。Teams 和 Enterprise 通过 Harness 插件连接独立的 `scrum-server`。

## 核心原则

- 一个 Harness Workspace 可以包含多个 Session，并绑定零个或一个 Scrum Project。
- 每个 Session 独立选择 Scrum Access：Off、Read 或 Write。
- Scrum Store 是业务状态的权威来源，Session Log 只保存对话、工具调用和必要引用。
- 用户、Agent 和 UI 操作同一份权威数据。
- 高风险操作需要确认，并发写入必须检测冲突。
- 插件使用 Harness 公开扩展点，不修改 Harness Agent Loop。

## 代码组织

```text
apps/       可独立启动和部署的程序
packages/   被 App 或 Harness Bundle 组合的模块
docs/       产品、架构和开发文档
```

Community 不启动独立 Server。Teams 和 Enterprise 共用 `apps/scrum-server`，Harness 插件位于 `packages/harness/`。

## 文档

- [Scrum 产品设计](docs/product/scrum.md)：Scrum 概念、角色、产品功能、使用流程和首版范围。
- [版本设计](docs/product/editions.md)：Community、Teams 与 Enterprise 的定位、能力和授权差异。
- [Scrum 术语表](docs/product/glossary.md)：产品文档和界面使用的统一术语。
- [系统架构](docs/development/architecture.md)：运行拓扑、模块、数据模型、存储、一致性、迁移和发布。
- [DeepSeek Harness Scrum 开发指南](docs/development/dsh-dev-guide.md)：插件、UI、Workspace、Session、Agent 工具和权限集成。
- [分级实施计划](docs/development/implementation-plan.md)：Release、Epic、Feature PR 与 Task/commit 的执行顺序和完成标准。
- [架构决策记录](docs/development/adr/README.md)：已生效的工具链、依赖和格式决策及其理由。
- [本地开发循环](docs/development/local-development.md)：提交前的检查、构建，以及把插件挂进 Harness 跑起来。
- [Harness 兼容矩阵](docs/development/harness-compatibility.md)：支持的 Harness 版本范围、依赖方式与升级检查项。
- [Git 与 GitHub 协作规范](docs/development/git-workflow.md)：Issue、分支、Commit 和 PR 的命名、内容与合并流程。

仓库内编码 Agent 的实现约束见 [Agent Guide](AGENT.md)。
