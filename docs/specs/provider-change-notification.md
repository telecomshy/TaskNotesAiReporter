# 规格：供应商变更通知——单一失效入口（#107 后续重构）

> 权威出处：GitHub issue [#108](https://github.com/telecomshy/TaskNotesAiReporter/issues/108)（`ready-for-agent`）。本文件是仓库内可被 `/code-review` 直接发现的副本，内容与 #108 一致。

## Problem Statement

#107 让模型行 / 凭据变更后自动重绘顶部「当前模型」卡，但「变更后重绘」的义务以手工调用形式铺在 `src/settings/modelTab.ts` 的 9 个点。新增一条会改变「可选模型集合」的命令时，漏写一次 `refreshActiveModel()` 就会静默回到旧 bug（下拉不更新），而且没有任何编译期或测试期提醒。

同时暴露出两个相邻的维护性问题：

- `renderCustomModelRow` 的参数膨胀到 7 个（`listEl / provider / row / ctx / syncHead / redraw / refreshActiveModel`），其中 `provider / ctx / 两个回调` 总是一起传递。
- 同一文件里 `ctx.refresh`（整页刷新）、`SecretControl.refresh`（密钥掩码同步）、`refreshActiveModel`（顶部卡重绘）三个 `refresh` 语义不同，容易读错。

## Solution

在供应商门面 `ProviderSettings` 上建立**单一变更通知**：每条写命令在 `run()` 时声明自己的类别，门面执行命令后发布类别；设置页订阅，并只对 `selectable` 类别重绘顶部卡。行为零变化：触发集仍是 #107 的 9 处（由 7 条命令覆盖），既有整页刷新路径不动。

## Implementation Decisions

1. **通知归门面**（不改 owner）：`ProviderSettings` 新增 `subscribe(listener: (kind: ProviderChangeKind) => void): () => void`，返回退订函数。理由：供应商领域才知道「可选模型集合」是什么（`isSelectable` 在同一层）；`SettingsOwner` 只管状态与落盘（ADR-0016），加全设置事件会越界。
2. **三类通知**，`ProviderChangeKind = "selectable" | "layout" | "quiet"`：
   - `selectable`：可能改变「可选模型集合」→ 设置页重绘顶部卡；
   - `layout`：卡片结构 / 当前模型 / 思考能力变了，但既有调用方本来就走整页刷新 → 订阅忽略，整页刷新路径不变；
   - `quiet`：不影响顶部卡（模型行参数、供应商改名）→ 订阅忽略。
3. **分类表集中一处且编译期强制**：用映射类型从 `ProviderSettings` 的 void 写方法派生命令键名，`Record<ProviderCommandKey, ProviderChangeKind>` 必须列全；新增写方法而漏分类会编译失败。`run(kind, command)` 用映射里的类别发布。
4. **每条命令都发布**（含空转：删不存在的 provider / 改名找不到行）：不做变更检测，避免给 17 条命令加返回值或前后快照。
5. **订阅生命周期**：`renderModelTab` 返回 disposer；`settings/index.ts` 在重画前、`hide()`、`display()` 开头调用并置空（沿用 `secretRef` 的字段模式）。旧顶卡被 `empty()` 丢弃后，不许再收到回调。
6. **卡内删除 9 处手工重绘**：`renderPresetProviderCard` / `renderCustomProviderCard` / `renderCustomModelRow` 不再接收 `refreshActiveModel`，也不再调用它。
7. **行编辑器参数收束**：新增 `CustomCardEnv { provider, ctx, syncHead, redraw }`，`renderCustomModelRow(listEl, row, env)` 由 7 参降为 3 参。
8. **命名**：`SecretControl.refresh` 改名 `syncSecretState`（同步掩码与「密钥不可用」提示）；`ctx.refresh` 保持原名（跨 Tab 的整页刷新）。
9. **文档**：新增 `docs/adr/0029-provider-change-notification.md`（门面发布、视图按类别失效；链接 ADR-0012 / 0016）。不改 `CONTEXT.md`（机制不是领域词）。不新增文案键、按钮或用户可见行为。
10. **B/C 机械项并入**：行参数收束、命名、测试脚手架抽取与本次一起交付，不另开票。

## 命令分类表（验收基准）

- `selectable`：`setProviderBaseUrl`、`setSecretId`、`setProviderApiStyle`、`setAuthType`、`addModel`、`renameModel`、`removeModel`。
- `layout`：`addProvider`、`removeProvider`、`refreshModelCatalog`、`applyPickedModels`、`setModelThinking`、`recordThinkingTest`、`clearLearnedThinking`、`selectActiveModel`。
- `quiet`：`setProviderName`、`setModelParams`。

## Testing Decisions

- 现有 548 条测试全绿；行为用例断言不改；只允许改 harness 接线、`renderModelTab` 返回值接线，以及新增契约 / 生命周期用例。
- **契约测试**：每条命令调用后订阅者收到分类表里的类别；`selectable` 命令收到 `selectable`，`setModelParams` 收到 `quiet`。
- **生命周期测试**：dispose 后调用写命令不再回调；顶部下拉元素实例保持不变（旧宿主不被重绘）。
- **共用 harness**：抽 `test/fakes/modelTabHarness.ts`，`test/fetchGate.test.ts` 与 `test/activeModelRefresh.test.ts` 共用，断言不变。
- **手工验收（Obsidian 内）**：输入焦点 / 光标、键盘 Tab、下拉展开、切接口方言后的高亮。

## Out of Scope

- 扩大触发集（如供应商改名刷新下拉分组标题）——另立 issue。
- 给 `SettingsOwner` 加全设置通知，或修改 ADR-0016。
- 把视图失效机制推广到其它 Tab / 报告弹窗。
- 下拉交互改版、自动替用户选中新模型。
- `CONTEXT.md` 词汇表变更。

## Acceptance Criteria

1. 9 处手工 `refreshActiveModel()` 调用从 `modelTab.ts` 消失；顶部卡重绘由订阅驱动。
2. 新增一条 `selectable` 写命令时，只需登记分类即可获得顶卡重绘；漏登记会编译失败。
3. `setModelParams`（上下文长度 / 最大输出）不触发顶卡重绘。
4. dispose 后旧顶部卡不再被重绘。
5. 全量 `npm test`、`typecheck`、`lint` 通过；#107 的行为（新增 / 改名 / 删除 / 改地址 / 改密钥 / 切认证 / 切方言）保持不变。
6. ADR-0029 落地；无新增 i18n 键、按钮或用户可见行为。

Related: #107
