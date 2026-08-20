# 0001 工程工具链

## 状态

已接受（2026-08-20）

## 背景

仓库从纯文档状态进入实现阶段，需要一次性确定包管理、编译、测试、Lint 和依赖边界检查的工具。约束来自 `AGENT.md`：

- 模块边界必须可强制执行，`scrum-domain` 不得依赖 React、Harness、HTTP 或存储 Adapter。
- 测试要覆盖 Domain、Storage、Application、Harness Host/Client、Server 和 Edition 六类场景，形态上分为单元、集成和契约三层。
- 每个 commit 都要通过该范围适用的 lint、类型检查和测试，因此工具必须能按包运行，且在 CI 中足够快。

## 决策

| 用途 | 选择 | 版本 |
|---|---|---|
| 包管理 | pnpm workspace | 10.22 |
| 语言与编译 | TypeScript，composite project references | 6.0.x |
| 测试 | Vitest，根级 `projects` 分层 | 4.1 |
| Lint | ESLint flat config + typescript-eslint | 10.x / 8.x |
| 格式化 | Prettier，仅作用于代码 | 3.9 |
| 依赖边界 | dependency-cruiser | 18.x |

配套约定：

- 包的测试位于 `<package>/tests/<layer>/`，`layer` 取 `unit`、`integration` 或 `contract`。
- 仓库结构守卫位于根目录 `tests/workspace/`，单独一个 `workspace` project；它断言的是包清单、入口点形状和依赖边界，不是产品行为。
- 测试通过 workspace alias 指向包的 `src`，不经过 `dist`，因此测试结果不受构建新旧影响。
- 测试由 `tsconfig.test.json` 做类型检查，但不进入 composite 构建；ESLint 对测试关闭类型感知规则。
- Node 支持范围 `>=22.12 <25`，CI 在 22 和 24 两端各跑一遍。

## 理由

**TypeScript 固定在 6.0.x 而不是已发布的 7.0.x**：`typescript-eslint@8` 声明的 peer 范围是 `typescript >=4.8.4 <6.1.0`。升到 7.0 意味着放弃类型感知 lint 规则，而这类规则正是防止 Promise 漏 await、错误类型收窄等问题的主要手段。等 typescript-eslint 支持 7.0 后再升级，属于纯工具升级，无产品影响。

**Vitest 而不是 node:test**：Domain 与 Storage 层用 node:test 也够，但 R1 的 `scrum-ui` 需要组件测试环境、`.scrum/` 存储需要临时目录与并发用例、契约层需要快照。Vitest 一套配置覆盖这些场景，且与后续 Harness Client 的 Vite 构建同源。

**ESLint + Prettier 而不是 Biome**：Biome 快、配置少，但没有类型感知规则，也没有等价的依赖边界能力，仍需再引入一个工具；本仓库的核心约束恰好是边界和类型正确性。

**dependency-cruiser 而不是自写脚本**：仅校验 `package.json` 的依赖字段无法发现深层相对路径导入（例如 `../../scrum-domain/src/...`）。dependency-cruiser 直接分析导入图，规则表达力足以覆盖 `docs/development/architecture.md` 第 6 节的全部禁止方向。

**dependency-cruiser 通过 `tsconfig.depcruise.json` 的 `paths` 解析工作区包**：pnpm 用符号链接安装工作区包，enhanced-resolve 报告的是真实路径，`@dsh-scrum/...` 导入会落进 `dist`，而全部边界规则都写在 `^packages/<group>/<package>/src` 上——规则匹配不到任何边时输出是绿的。改用 `paths` 后这些边落在 `src`，并被标记为 `aliased-tsconfig-paths`，`no-cross-package-file-import` 得以继续拒绝相对路径导入而不误伤包名导入。用 `exports` 自定义条件也能解析到 `src`，但实测那样的边被标记为 `undetermined`，正是 `no-undeclared-dependency-in-source` 禁止的类型，需要放宽两条规则而不是收紧一条。`enhancedResolveOptions.alias` 被 dependency-cruiser 的配置 schema 拒绝，所以别名只能放在 tsconfig 里。

**测试不进入 composite 构建**：如果测试文件被包的 `tsconfig.json` 收录，产物 `dist/` 里会出现编译后的测试；如果被排除，测试文件又不属于任何 TypeScript 项目，类型感知 lint 会直接报错。折中方案是用独立的 `tsconfig.test.json` 做完整类型检查，同时对测试关闭类型感知 lint 规则——测试的类型安全由 `tsc` 保证，Lint 只做风格与常见错误检查。

## 后果

- 类型检查和构建在 composite 项目下是同一件事，`typecheck` 与 `build` 不是互相独立的两次分析。
- 测试通过 alias 读取 `src`，因此包的 `exports` 字段错误不会被单元测试发现，需要由契约层测试单独覆盖。
- 工具链需要跟随 typescript-eslint 的支持节奏升级 TypeScript；升级时应同时更新本 ADR 的版本表。
- 测试文件不享受类型感知 lint。若将来测试中出现大量异步误用，可以为 `tests/` 单独建立 composite 配置再打开该能力。
