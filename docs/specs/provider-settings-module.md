# 规格：供应商配置收敛进 providerSettings 模块

> 权威出处：GitHub issue [#29](https://github.com/telecomshy/TaskNotesAiReporter/issues/29)。本文件是仓库内可被 `/code-review` 直接发现的副本，内容与 #29 一致。
> 状态：已实现并合并，commit `a0891ea`（`main`）。

## 目标

把「供应商配置」从约 20 个 DOM 处理函数手里收进一个模块，让状态转移、不变量与「当前模型解析」局部化。原 `src/settings/provider.ts` 的判定函数并入新模块。

## 模块与门面

- **纯核** `src/settings/providerSettings.ts`：命令转移 + 判定谓词 + `resolveActive()` 的纯部分，无 DOM、无 obsidian，可单测。
- **绑定门面**：`plugin.providers`，在 `main.ts` 组合根构造一次，注入 `getSecret: (id) => string | null` 与落盘（读可变切片、`commit` 回写并保存）。

## 外部接口（最终）

命令：

- `addProvider()`
- `removeProvider(providerId)`
- `setProviderName(providerId, name)`
- `setProviderBaseUrl(providerId, baseUrl)`
- `setSecretId(providerId, secretId)`
- `setAuthType(providerId, authType)`
- `applyFetchedModels(providerId, models)`
- `addModel(providerId)`
- `renameModel(providerId, modelConfigId, newModelId)`
- `setModelParams(providerId, modelConfigId, { contextLength?, maxTokens? })`
- `removeModel(providerId, modelConfigId)`
- `selectActiveModel(providerId, model)`

读取：

- `resolveActive()` → `{ ok: true, config } | { ok: false, reason: 'no-provider' | 'no-model' | 'missing-credentials' }`
- 密钥可用性：`secretValue(secretId)`、`isSecretMissing(secretId)`
- 判定谓词（纯函数，视图直接导入）：`modelsOf` / `isConfigured` / `isSelectable` / `isActiveModel`

> 设计时商定的命令是 8 条；实现时补齐了 `setProviderName` / `setProviderBaseUrl` / `addModel` / `setModelParams`，使视图不再有任何直接写 `settings.providers` 的路径。`setSecret` 定名为 `setSecretId`，对齐 `CONTEXT.md` 的「密钥名（Secret id）」。

## 不变量（集中在命令处）

- `activeProviderId` 恒存在于 `providers`；`selectActiveModel` 对不存在的供应商不改现状；删供应商时重置到首个。
- 删除/重命名模型、删除供应商 → 清空 `activeModel`。
- 切换认证方式为 `none` → 清空 `apiKeySecretId`。
- 清空预设供应商的密钥名 → 清空其 `models`（并因之清空 `activeModel`）。
- `resolveActive()`：模型不在 `modelsOf` 中 → `no-model`；`authType: "none"` 不要求密钥；需要却缺失 → `missing-credentials`；`baseUrl` 为空归入 `missing-credentials`。
- **载入时不校验 `activeModel`**，`normalizeSettings` 维持只保证 `activeProviderId` 存在（见 ADR-0010）。
- 密钥访问只经注入的 `getSecret`；不再直接访问 `app.secretStorage`。

## 行为变更

- `authType: "none"` 的供应商不再被误判缺凭证，可正常生成报告（修复既有 bug）。
- 删除/重命名当前模型会清空当前选择。

## 测试

- `test/provider.test.ts` → `test/providerSettings.test.ts`：保留判定断言，新增命令转移 + `resolveActive` 用例。
- `test/settings.test.ts` 中 `resolveActiveModelConfig` 的用例随之迁入；`test/secrets.test.ts` 不动。
- 全量 202 用例通过。

## 范围外（另立 issue）

- `selectedTemplateId` 在删除模板后悬空（同类不变量，不同模块）。
- 报告类型 UI 缺失（ADR-0009 已标为独立问题）。

## 相关决定

- [ADR-0010](../adr/0010-active-model-invariant-at-mutation-time.md)：当前模型失效只在变更命令处清理，载入时不校验。
- 与 ADR-0001 / ADR-0002 / ADR-0008 无冲突。
