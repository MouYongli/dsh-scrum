# Community、Teams 与 Enterprise 版本设计

## 1. 产品定位

Scrum 插件分为三个版本：

```text
Community  = 完整的个人 Scrum
Teams      = Community + 多人协作
Enterprise = Teams + 组织治理、安全和部署能力
```

Community 面向个人用户，不应通过删除 Backlog、Sprint、看板等基础 Scrum 能力制造限制。版本差异应主要体现在协作、组织治理、安全、合规和部署方式上。

## 2. 功能矩阵

| 能力 | Community | Teams | Enterprise |
|---|---|---|---|
| 目标用户 | 个人开发者 | 小型及中型团队 | 大型组织 |
| 价格 | 免费 | 按成员或组织收费 | 合同制 |
| 数据位置 | 本地 | 托管服务或团队服务器 | 托管、私有云或本地部署 |
| 用户数量 | 1 人 | 多人 | 多组织、多部门 |
| Scrum 核心功能 | 完整 | 完整 | 完整 |
| Backlog、Sprint、看板 | ✓ | ✓ | ✓ |
| Agent 操作 Scrum | ✓ | ✓ | ✓ |
| 协作、评论和提及 | — | ✓ | ✓ |
| 项目角色和基础 RBAC | 简化 | ✓ | ✓ |
| 自定义角色 | — | 可选 | ✓ |
| 实时同步 | — | ✓ | ✓ |
| 通知 | 本地 | 邮件、Webhook、应用通知 | 企业消息系统、策略化通知 |
| 审计日志 | 本地简要记录 | 基础审计 | 完整审计及导出 |
| SSO / SAML / OIDC | — | 可选 | ✓ |
| SCIM 用户同步 | — | — | ✓ |
| 数据保留策略 | — | 基础 | ✓ |
| 高可用和灾备 | — | — | ✓ |
| 数据驻留和加密策略 | — | — | ✓ |
| 管理 API | — | 基础 | 完整 |
| 支持和 SLA | 社区支持 | 标准支持 | 企业 SLA |

## 3. Community

Community 面向单个本地用户：

- 不要求登录或组织账号。
- 自动创建一个隐式个人 Tenant。
- 支持多个 Harness Workspace。
- 每个 Workspace 可以绑定零个或一个 Scrum Project。
- 提供完整的 Backlog、Sprint、看板、工作项和基础报表。
- 支持当前用户通过 Agent 查询和修改 Scrum 数据。
- 数据以多个 JSON/JSONL 文件存储在绑定 Workspace 的 `.scrum/` 目录中。
- 提供导出和升级到 Teams 的迁移能力。
- 不提供多人协作、组织成员管理和企业身份系统。

## 4. Teams

Teams 面向需要共享项目数据的团队：

- 多成员和团队空间。
- Product Owner、Scrum Master、Developer、Stakeholder 等项目角色。
- 基础 RBAC。
- 实时同步、评论、提及和通知。
- 团队共享 Backlog、Sprint 和报表。
- 基础审计日志。
- 邮件、Webhook 或应用内通知。
- 托管服务或团队自行部署的服务端。
- Agent 操作必须使用当前登录用户身份。

## 5. Enterprise

Enterprise 在 Teams 基础上增加组织治理：

- 多组织、多部门和用户组。
- 自定义角色与细粒度权限。
- SSO、SAML、OIDC 和 SCIM。
- 完整审计日志、导出和长期保留。
- 数据驻留、企业密钥和加密策略。
- 私有云、本地部署和隔离网络支持。
- 高可用、备份、恢复和灾备。
- 策略引擎和集中管理员控制。
- 完整管理 API。
- 企业支持和 SLA。

统一技术架构、模块组合和 Ports/Adapters 设计见[系统架构](architecture.md)。

## 6. 功能授权

版本能力通过统一的 Entitlement Service 判断：

```ts
interface EntitlementService {
  has(capability: Capability): boolean
  limit(name: LimitName): number | null
}

type Capability =
  | 'scrum.core'
  | 'collaboration'
  | 'rbac'
  | 'audit.basic'
  | 'audit.advanced'
  | 'sso'
  | 'scim'
  | 'selfHosted'
```

规则：

- 版本判断不能散落在 React 组件中。
- UI 根据 Entitlement 显示或禁用入口。
- Application Service 和服务端必须再次校验。
- 商业能力不能只依赖客户端布尔值。
- 企业授权使用服务端订阅或签名许可证。
- Community 保留相同的数据字段和领域模型。

## 7. 统一数据 Schema

Community 也使用 `tenant_id`、`actor_id` 等字段，只是只有一个隐式个人 Tenant。这样可以：

- 避免为 Community 单独维护 Schema。
- 允许将本地项目迁移到 Teams。
- 让导入、导出和备份格式保持统一。
- 让权限、审计和活动记录使用相同模型。

## 8. 开发与发布策略

建议采用：

- 单一代码仓库。
- 单一领域模型和 API Contract。
- Edition 作为插件组合清单。
- 公共迁移脚本和版本化 Schema。
- Community、Teams、Enterprise 独立集成测试。
- Harness 版本兼容矩阵。
- 商业版本功能由 Capability Gate 控制，而不是条件编译复制代码。
