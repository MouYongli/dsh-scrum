# 本地开发循环

本文说明在本仓库目录下如何验证改动：提交前跑哪些检查，以及如何把插件挂进真实的 DeepSeek Harness 里跑起来。

版本范围与依赖方式见 [Harness 兼容矩阵](harness-compatibility.md)，提交与 PR 规则见 [Git 与 GitHub 协作规范](git-workflow.md)。

## 1. 前置条件

Node `>=22.12 <25`，pnpm 10。首次或依赖变化后：

```bash
pnpm install
```

Harness CLI 不需要预装，脚本通过 `npx` 按兼容矩阵声明的版本拉取；已有安装可用 `DSH_BIN` 指定。

## 2. 提交前的检查

每个 commit 前跑完这四条，它们对应 CI 里的同名步骤：

```bash
pnpm typecheck    # tsc -b 全部包 + tsconfig.test.json 覆盖测试与构建配置
pnpm lint         # ESLint，src 走类型感知规则
pnpm lint:deps    # 依赖方向，禁止 domain 外流、跨包相对路径导入等
pnpm test         # Vitest，unit / integration / contract / workspace 四层
```

只跑某一层或某个包：

```bash
pnpm exec vitest run --project unit
pnpm exec vitest run packages/core/scrum-domain
pnpm test:coverage        # 覆盖率按需跑，没有阈值，不进每次提交
```

CI 还会跑 `pnpm format:check` 和 `pnpm build`，本地用 `pnpm format` 直接修格式即可。

## 3. 构建

```bash
pnpm build        # tsc -b，产物在各包的 dist/
```

composite 项目下类型检查和构建是同一件事，`pnpm typecheck` 已经产出声明；`pnpm build` 用于确认整棵引用树可以从零构建。

## 4. 挂进 Harness 跑

三条命令操作的是**你真实的 `web` profile**，也就是 `dsh web` 启动的那个：

```bash
pnpm dev:link      # 把 Bundle 挂进 profile
pnpm dev:config    # 确认 profile 组合出了插件行
pnpm dev:unlink    # 摘掉
```

`pnpm dev:config` 挂上后应输出：

```text
# == @dsh-scrum/scrum-harness-bundle
- id: scrum-host
  name: '@dsh-scrum/scrum-harness-host'
- id: scrum-client
  name: '@dsh-scrum/scrum-harness-client'
```

摘掉后输出 `@dsh-scrum/scrum-harness-bundle is not composed in profile web`。

然后在**目标项目目录**启动 Harness（Scrum 数据按启动目录所在的 Workspace 归属）：

```bash
cd ~/你的项目
npx @deepseek-ai/dsh web              # 端口冲突时加 --port <n>
```

不想动日常使用的 profile，就换一个：

```bash
DSH_PROFILE=scrum-dev pnpm dev:link
DSH_PROFILE=scrum-dev pnpm dev:config
npx @deepseek-ai/dsh --profile scrum-dev
```

脚本等价的原始命令（脚本会把它们打印出来）：

```bash
npx @deepseek-ai/dsh plugin --profile web add "$PWD/packages/harness/scrum-harness-bundle"
npx @deepseek-ai/dsh --profile web --dump-config
npx @deepseek-ai/dsh plugin --profile web remove @dsh-scrum/scrum-harness-bundle
```

三处容易写错的地方：

- **挂载传绝对路径，卸载传包名**。包还没发布，只能按路径装；pnpm 把它记成 `link:` 依赖。
- **挂载不需要手工改 profile 的 `dsh.profile.bundles`**。CLI 会按已安装状态自动并入声明了 `dsh.bundle` 的依赖，卸载时自动摘掉。
- **`--dump-config` 是 launcher 标志**，要写在 `--profile web` 后面。`dsh web --dump-config` 里的 `--dump-config` 可能被当作 web app 自己的参数。

## 5. 改了代码之后

`link:` 依赖指向工作区，因此改代码不必重新挂载：

| 改动位置 | 需要做什么 |
|---|---|
| node 半边（Host、Domain、Application、Contract） | `pnpm build`，然后重启 `dsh web` |
| Bundle 的 `cordis.patch.yml` 或 `package.json` | `pnpm dev:config` 确认组合结果，必要时重启 |
| 浏览器半边 | 见下节，当前尚不可用 |

## 6. 当前边界

**`dsh web` 里现在看不到任何 Scrum 界面，这不是配置问题。** Web Shell 按包在 `/plugins/<id>/client.js` 提供浏览器产物，需要包声明 `dsh.client.platform` 并产出符合 Shell 模块加载契约的 bundle；我们目前只有 `tsc` 直出的 `dist/`，所以挂上去只有 node 半边在运行。

浏览器产物、真实 Slot 注册和 `pnpm watch` 热迭代属于 Scrum 页面扩展点验证那一步，完成后本文的第 5 节会补上浏览器侧的循环。

## 7. 与安装探针的分工

```text
scripts/harness-profile-probe.sh   一次性 DSH_HOME 与 Profile，验证「装得上、组合得出、卸得干净」
pnpm dev:link / dev:config / dev:unlink   操作你真实的 Profile，验证「装上之后真的在跑」
```

探针是可重复的自动检查，改动 Bundle、patch 或支持范围时跑一次并把输出贴进 PR；本地循环是日常开发用的，不进 CI，因为它需要 Harness CLI 和一次网络安装。
