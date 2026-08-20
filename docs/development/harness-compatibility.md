# Harness 兼容矩阵

本文是插件与 DeepSeek Harness 版本关系的唯一来源。`packages/harness/*` 的 `peerDependencies` 必须与本文一致，运行时检测也以本文声明的范围为准。

DeepSeek Harness 处于 Developer Preview，全部包仍是 `0.1.0-rc.x` 预发布版本。预发布版本之间可以出现破坏性变更，因此这里声明的是一个窄区间，而不是开放上界。

## 1. 支持范围

| 项 | 版本 | 说明 |
|---|---|---|
| 最低支持 | `0.1.0-rc.7` | 低于此版本不加载，直接拒绝并提示升级 |
| 目标版本 | `0.1.0-rc.8` | 开发、探针与本地循环默认针对的版本 |
| 已验证最高 | `0.1.0-rc.8` | 实际跑过安装、组合、卸载的最高版本 |
| 声明范围 | `>=0.1.0-rc.7 <0.2.0-0` | `peerDependencies` 写 `^0.1.0-rc.7`，运行时检测用完整区间 |

目标版本是 `0.1.0-rc.8`，但**最低支持仍保留 `0.1.0-rc.7`**，因为 rc.8 目前发布在 `next` 标签上，`latest` 还是 rc.7：用户执行 `npx @deepseek-ai/dsh` 默认装到的是 rc.7，把下限抬到 rc.8 等于拒绝 CLI 默认安装的版本。两个版本都用探针实测过。

目标版本在仓库里只有一处：根 `package.json` 的 `dsh.targetHarnessVersion`。安装探针和本地开发循环都从这里读，运行时检测的 `VERIFIED_HARNESS_VERSION` 与它由 `tests/workspace/harness-target-version.test.ts` 保证一致。

`@deepseek-ai/cordis` 单独声明为 `^4.0.1`：它是插件模型本身的依赖，版本节奏与 `dsh-*` 不同。

提升「已验证最高」的前提是真的在该版本上跑过安装、加载和卸载，并把输出记录在对应 PR 里；只升 `peerDependencies` 不算验证。

## 2. 依赖方式

Harness 包一律走 `peerDependencies`，与 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-workspace` 自身的做法一致：插件运行在宿主进程内，必须使用宿主已加载的那一份实例，把它们写进 `dependencies` 会在 Profile 里装出第二份副本，服务注册与实例判等都会失效。

同一范围同时写入 `devDependencies`，用于本地类型检查和测试，不进入发布依赖。

```text
peerDependencies   宿主提供，插件不得自带
devDependencies    本地类型检查与测试用
dependencies       仅限与 Harness 无关的普通库
```

## 3. Bundle 与 Profile

从已发布包读到的实际机制：

- Bundle 是一个普通 npm 包，`package.json` 的 `dsh.bundle.patch` 字段指向包内的 `cordis.patch.yml`。
- Profile 目录下的 `package.json` 用 `dsh.profile.bundles` 按顺序列出 Bundle；组合顺序是各 Bundle 的 patch、Profile 自身的 `cordis.patch.yml`、`$DSH_HOME/cordis.patch.yml`，最后是 `--patch` 覆盖层。
- `dsh plugin --profile <name> <pnpm args>` 把参数转发给 Profile 目录下的 pnpm，因此安装和卸载就是普通的包安装。
- Bundle 名先从 dsh 安装目录解析，再从 Profile 的 `node_modules` 解析。

Patch 以行 id 寻址，后写覆盖整行 `config`，不做深合并。

## 4. 运行时检测

静态 `peerDependencies` 只在安装时生效，用户完全可以在 Profile 里装上超出范围的 Harness。因此插件在加载时再检测一次：读取实际解析到的 `@deepseek-ai/dsh-base` 版本（它是每个 Profile 的第一层 Bundle），超出声明范围时拒绝加载，并在错误信息中同时给出实际版本和支持范围。

上界写 `<0.2.0-0` 而不是 `<0.2.0`：预发布版本排在正式版之前，`0.2.0-rc.1` 会满足 `<0.2.0`，于是下一个可能含破坏性变更的 minor 会被放行。

检测不到 Harness 时不拒绝。这种情况意味着插件根本不在 Profile 里运行（裸 Cordis 应用或测试），而这项检查的目的是挡住错误的宿主，不是强制存在一个宿主。

拒绝优于降级运行：Developer Preview 期间接口可能悄然改变，带着不兼容的宿主继续跑，出错点会离原因很远。

## 5. 已知约定

- 每个 Harness 包都发布一个 `./invariant` 伴生插件，向 `ctx.invariants` 注册自己的 npm 包名。第三方插件是否也应注册，尚未从公开文档得到确认，暂不实现。
- Workspace 注册表服务的真实名称是 `ctx.workspaceRegistry`。
- 插件形态是导出 `name`、`inject` 和 `apply(ctx)` 的 ESM 模块；`ctx.plugin()` 返回 Fiber，`fiber.dispose()` 撤销该插件注册的一切。

## 6. 安装探针

`scripts/harness-profile-probe.sh` 在临时 `DSH_HOME` 里建一个一次性 Profile，把 Bundle 以 `link:` 方式装进去，检查组合后的配置树包含两行插件，然后卸载并确认 Profile 回到原状。

```bash
scripts/harness-profile-probe.sh              # 默认对目标版本
scripts/harness-profile-probe.sh 0.1.0-rc.7   # 验证其他版本，例如当前的最低支持
DSH_BIN=$(which dsh) scripts/harness-profile-probe.sh
```

它不进 `pnpm test`：需要 Harness CLI 和一次网络安装，耗时和外部依赖都不适合放进每次提交的检查。改动 Bundle、patch 或支持范围时手动跑一次，并把输出贴进 PR。

探针只验证一次性 Profile 的装卸；把插件挂进日常使用的 Profile 开发，见[本地开发循环](local-development.md)。

Bundle 尚未发布，因此探针用 `link:` 指向工作区目录，其 workspace 依赖通过仓库自身的 `node_modules` 解析。发布流程建立后（见实施计划的 Community Bundle 部分），这里应改为安装真实的发布产物。

## 7. 升级检查项

升级支持范围时按顺序确认：

1. 目标版本的 `@deepseek-ai/cordis` 范围是否变化。
2. 用到的服务是否改名或改签名。
3. Bundle 与 Profile 的组合方式是否变化。
4. 在目标版本上跑一遍安装、加载、卸载探针。
5. 同步更新本文、`peerDependencies` 和运行时检测的范围常量。
6. 通过后再改本文的「已验证最高」。
