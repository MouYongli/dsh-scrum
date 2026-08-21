# 0003 插件与远程服务仓库边界

## 状态

已接受（2026-08-21）

## 背景

原架构把 Community 插件、Teams/Enterprise 服务端、商业身份、治理和部署放在同一个 monorepo 路线中。这让插件发布与商业服务发布互相阻塞，也容易让客户端包含服务端授权或 Edition 组合逻辑。

Community 必须能够独立安装和离线工作；远程服务则需要独立选择数据库、身份、部署和商业发布节奏。两个系统仍需共享稳定的业务语义和机器可验证的远程协议。

## 决策

- `dsh-scrum` 拥有 Domain/Application Core、Community Workspace 存储、Harness Host/Client、UI、Agent Tools、Remote Gateway Port/Adapter 和 `scrum-api-contract`。
- `dsh-scrum-server` 拥有 Teams/Enterprise Runtime、服务端存储、Tenant、身份、最终 RBAC、Realtime、审计、通知、Admin、策略和部署。
- 插件只区分 `local` 与 `remote`。Teams/Enterprise Edition 和商业 Capability 由远程服务组合并在握手中返回。
- `scrum-api-contract` 是远程协议的唯一事实来源，使用 SemVer 和版本化 fixture；外部服务作为消费者执行兼容测试。
- 两个仓库不得通过相邻 Checkout、源码相对路径、符号链接或复制内部类型协作。公共包发布前，外部服务只能实现不依赖业务 Contract 的 Runtime 骨架。
- `.scrum/` 的远程绑定只保存 Endpoint 标识、远程资源 ID、凭证引用和可丢弃缓存，不保存 Token 或商业密钥。

## 理由

按部署边界拆仓后，Community 保持轻量和可独立发布，商业服务可以采用不同的安全、运维和发布流程。以 Contract 而非共享源码作为边界，可以让兼容性被 fixture 和消费者测试验证，也避免客户端成为服务端权限的事实来源。

没有选择在插件仓库保留 Server 子目录，因为这仍会耦合依赖、CI、Issue 标签和发布节奏。没有把 Remote Adapter 移到服务端仓库，因为它运行在 Harness Host 中，是插件交付物的一部分。

## 后果

- 本仓库删除 Server、商业 Edition 和 Admin 的目录与实施计划。
- 远程协议变更必须记录兼容性影响，并在两个仓库中通过 Contract 测试。
- `scrum-api-contract` 对外发布前需要确定其对私有 `scrum-domain` 的依赖处理方式。
- 跨仓库端到端测试需要固定服务端版本或容器，而不是源码级联构建。
- 服务端实现的安全与运维标准在 `dsh-scrum-server` 中独立维护。
