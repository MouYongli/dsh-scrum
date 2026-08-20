# 0002 运行时 Schema 方案

## 状态

已接受（2026-08-20）

## 背景

`scrum-api-contract` 需要在运行时校验跨边界的载荷。边界有四处：Harness Host 与 Client 之间的 Host API、Agent Tool 的参数、Teams/Enterprise 的 HTTP API，以及从 `.scrum/` 读回的数据。

约束：

- TypeScript 类型在运行时不存在，跨边界的数据必须实际校验，不能只靠类型断言。
- 校验失败要能说出「哪个字段为什么不合法」，以便映射到 `VALIDATION` 错误的 `details`。
- 同一份 Schema 要能同时产出 TypeScript 类型，避免类型与校验规则各写一遍后逐渐漂移。
- Agent Tool 的参数声明需要 JSON Schema。
- `scrum-api-contract` 会被 Harness Client 打进浏览器包，体积不能失控。
- Domain 保持零运行时依赖，校验库只允许出现在 Contract 层及其外围。

## 决策

使用 **Zod 4**（`zod@4.4.3`）作为 `scrum-api-contract` 唯一的运行时依赖。

- Schema 是唯一事实来源，TypeScript 类型由 `z.infer` 推导。
- 校验失败的 `ZodError.issues` 映射为 `VALIDATION` 错误 `details.issues` 中的 `{ path, code, message }` 列表。
- Agent Tool 需要 JSON Schema 时使用 Zod 自带的 `z.toJSONSchema`，不再引入第二个库。
- Domain 不依赖 Zod。Contract 层负责把外部输入解析成 Domain 值对象。

## 理由

**Zod 而不是 Valibot**：Valibot 体积明显更小、更利于树摇。但本仓库的校验密集在 Host API 与 Server 两侧，浏览器侧只承担 Client 用到的那部分；而 Valibot 的 JSON Schema 导出需要额外包，函数式管道写法在多人协作时可读性也更依赖习惯。以当前阶段的权衡，生态成熟度和错误结构的表达力优先于打包体积。若将来 Client 包体积成为实际问题，Standard Schema 兼容性使替换成本可控。

**Zod 而不是 TypeBox**：TypeBox 以 JSON Schema 为原生表示，Agent Tool 参数可以直接复用，这一点确实更顺。但校验要额外接 Ajv 或 TypeCompiler，错误信息偏底层，映射到面向用户的中文提示需要多一层翻译；且 `0.34.x` 的版本号意味着公开 API 仍可能变动，而 Contract 是本项目最不该频繁返工的一层。

**不自己写校验器**：手写校验能做到零依赖，但校验规则会和类型定义分叉，且每个新 DTO 都要重复实现路径收集与错误聚合，长期成本高于一个依赖。

## 后果

- `scrum-api-contract` 有了第一个运行时依赖，随之而来的是 Zod 的升级节奏；主版本升级按公共 Contract 变更处理。
- Domain 与 Contract 的边界必须守住：Domain 里出现 `import { z }` 即为架构违规，由 dependency-cruiser 的 `domain-stays-pure` 规则拦截。
- Schema 既描述结构也描述业务约束时容易越界。业务规则留在 Domain，Contract 只做结构、类型和取值范围校验。
- 未来若 Client 包体积不达标，可按 Standard Schema 接口替换实现，届时应新增 ADR 取代本篇，而不是就地修改。
