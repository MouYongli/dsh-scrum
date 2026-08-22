# 发布检查表

发布候选版本前逐条执行。每一条都要有可粘贴的证据 —— 命令与输出，不是「本地测过了」。

版本范围见[兼容矩阵](harness-compatibility.md)，提交与 PR 规则见 [Git 与 GitHub 协作规范](git-workflow.md)。

## 1. 代码检查

在仓库根目录，全绿才继续：

```bash
pnpm typecheck
pnpm lint
pnpm lint:deps
pnpm format:check
pnpm test
pnpm test:coverage
pnpm build
```

- `pnpm test:coverage` 有下限，不是目标。低于下限意味着真实回归，不是噪声。
- `pnpm lint:deps` 检查的是实际 import 图，包括绕过包名的相对路径导入。

## 2. 端到端验收

```bash
pnpm exec vitest run packages/harness/scrum-harness-bundle
```

必须覆盖并通过：

- 主路径：建项目 → 建工作项 → 规划 → 启动 → 推进 → 关闭，且每一步的状态都被断言。
- 交叉修改：界面路径与 Agent 路径写同一份数据，冲突被拒绝、不覆盖、刷新后一致。
- 会话权限：Off 看不到工具，Read 拒绝写入，改动在下一次调用生效，两个会话互不影响。
- 高风险确认：`HIGH_IMPACT_TOOLS` 全部要求确认，其余写入工具全部不要求。
- `.scrum/` 里没有任何可能存放凭证的字段，没有 Workspace 原始路径，Activity 只引用会话而不携带对话内容。

## 3. 安装与升级

```bash
scripts/harness-profile-probe.sh          # 一次性 DSH_HOME，验证装得上、组合得出、卸得干净
pnpm dev:link && pnpm dev:config          # 真实 Profile，确认组合结果只有 Bundle 一行
pnpm dev:unlink
```

- Profile patch 只写 Bundle 的对外包名。输出里出现 `scrum-harness-host` 或 `scrum-harness-client` 即为不合格。
- 在一个已有 `.scrum/` 数据的目录上重装一次，确认项目、工作项、身份和 Tenant 都还在（`edition-community` 的 `reinstall` 用例覆盖同一性质）。

## 4. 兼容性

- 声明的 Harness 范围与 `package.json` 的 `dsh.targetHarnessVersion` 一致。
- 超出范围的 Harness 在加载时被拒绝，且错误里同时说出两个版本号。
- CI 在全部受支持的 Node 版本上通过。

## 5. 数据与格式

- 新增或变更的持久化格式带 `schemaVersion`，并在 PR 的 Data migration impact 里说明升级与回滚两个方向。
- 旧版本写的 workspace 能被新版本打开；新版本写的 workspace 被旧版本打开时，多出的文件被忽略而不是报错。
- `.scrum/` 里没有 Token、密码、企业密钥或登录凭证。

## 6. 文档

- [快速开始](../product/quick-start.md)与产物一致：命令能跑，界面描述与实际一致。
- [已知限制](../product/known-limitations.md)覆盖本次发布仍然存在的每一条边界，并写明为什么没解决。
- 变更日志与本次发布的范围一致。

## 7. 回滚

- 确认这次发布可以整体回滚：卸载插件不动 `.scrum/`，旧版本能打开新版本写过的 workspace。
- 如果不能，必须在发布说明里写清楚回滚需要的额外数据处理。
