# 规格：「获取模型列表」的 404 收进流程结局；挑选框保护规则补界面级测试

> 权威出处：GitHub issue [#116](https://github.com/telecomshy/TaskNotesAiReporter/issues/116)（`ready-for-agent`）。本文件是仓库内可被 `/code-review` 直接发现的副本，内容与 #116 一致。
>
> 起源：`/improve-codebase-architecture` 2026-11-26 巡览候选 6（原评级 Speculative），2026-11-27 经 `/grill-with-docs` 拷问收口。候选的另一半（「测试」按钮自拼请求 → 改走 `assembleChatRequest`）已由 [ADR-0032](../adr/0032-model-request-assembly-seam.md) / #111 全量吸收；本规格不重开装配议题。

## Problem Statement

**其一：清单流程的错误分类住在视图里。** `src/settings/fetchModels.ts` 的结局只有 `failed { error: unknown }`，不区分「上游没有模型清单」。于是 `src/settings/modelTab.ts` 的结局映射不得不伸手进 `AIClientError` 的内部词汇（`code === "models.http"` + `details.status === 404`）再加方言判断，才能决定是否追加「手动添加模型 ID」提示。清单流程的错误分类是这条动作的领域知识，却集中在视图的一个条件表达式里；换一种上游失败形态就要改视图，而不是改流程。

同一条件还漏了一个边界：它只看「Anthropic 方言」，不看「有没有手动入口」。内置的 Anthropic 预设（`type: "preset"`）没有「+ 手动添加模型 ID」入口，但它遇到 404 时仍会提示「请改为手动添加模型 ID」——一句话把用户指向不存在的操作。

**其二：挑选框的「当前模型保护」规则零测试。** 「取消勾选当前模型 → 提示并复原」「全不选也保留当前模型」两条规则只写在 `src/settings/modelPicker.ts` 的对话框里；现有测试只覆盖到门面层（`applyPickedModels` 的保护），用户实际看到的对话框交互没有任何回归面。以后的改动可以静默破坏这两条规则而不被测试发现。

## Solution

**其一：新增一个结局形态。** `FetchModelsOutcome` 增加 `failed-no-model-list { error: unknown }`，由 `runFetchModelsFlow` 在失败分类处产出；视图只按 `kind` 映射为提示，不再读 `AIClientError` 的 `code` / `status`。判定边界收紧为「自定义供应商 + Anthropic 方言 + HTTP 404」——只有确实存在「手动添加模型 ID」入口的供应商才提示该兜底路径。视图提示保持现状的两段式文案（失败详情 + 兜底提示），文案键零变化；唯一用户可见变化是 Anthropic **预设** 404 不再出现手填提示。

**其二：补界面级测试。** 复用既有 `renderModelTabHarness` 的 ctx 与真实 `openModelPicker`，用 `FakeEl` 假装 DOM 驱动勾选框与按钮，钉住六条保护规则。挑选框只补四个按钮语义类名供测试寻址，保护逻辑不动、不抽纯函数。

## User Stories

1. 作为使用自定义 Anthropic 兼容网关的用户，当该网关只实现 `/messages`、不实现 `/models`（HTTP 404）时，我要看到「可改为手动添加模型 ID」的兜底提示。
2. 作为使用自定义 Anthropic 兼容网关的用户，当失败是 401 / 超时 / 解析失败时，我只要普通失败提示，不要「手动添加模型 ID」的误导。
3. 作为 Anthropic 预设用户，404 时不要再被提示去「手动添加模型 ID」，因为预设卡片没有这个入口。
4. 作为使用自定义 OpenAI 兼容网关的用户，404 保持普通失败提示，不因本次改造被误提示手填模型 ID（分类边界不变）。
5. 作为维护者，视图不再拆 `AIClientError` 的 `code` / `status` 做业务分支，只按流程结局映射提示。
6. 作为维护者，新增结局时若视图漏映射，应在编译期失败（穷尽性守卫继续有效）。
7. 作为维护者，改动「获取模型列表」的失败分类只需改流程模块，不必回头找视图里的 HTTP 词汇。
8. 作为用户，我取消勾选「当前模型」时，勾选框立即复原为选中并提示「先切换模型」，不会静默改掉启用集。
9. 作为用户，我点「全不选」时，「当前模型」仍保留勾选；确认后启用集恰为当前模型这一项。
10. 作为用户，点「确认」才改动「启用模型」，点「取消」则一个都不变。
11. 作为用户，勾选变化的即时效果与确认后的持久结果一致（不会出现勾了却没启用）。
12. 作为用户，「当前模型」属于别的供应商时，本供应商的勾选不应被误挡。
13. 作为 AFK 实现者，我要 404 分类矩阵与视图提示的回归测试，让判定边界与提示呈现各自有网。
14. 作为 AFK 实现者，我要挑选框保护规则的界面级测试，只断言用户可见状态，不依赖私有字段。
15. 作为 reviewer，我要零新增文案键、零新增 ADR、零词汇表变更，且既有 548 条测试全绿。

## Implementation Decisions

1. **新结局形态**：`FetchModelsOutcome` 增加 `{ kind: "failed-no-model-list"; error: unknown }`；`failed` 保持原样。结局文档注释同步说明它＝「上游未提供模型清单，且该供应商可改用手填模型行」。
2. **判定归流程**：在 `runFetchModelsFlow` 的 `catch` 里分类——`provider.type === "custom"` 且 `apiStyleOf(provider) === "anthropic"` 且 `error instanceof AIClientError` 且 `error.code === "models.http"` 且 `error.details.status === 404` 时返回 `failed-no-model-list`（携带同一 `error`）；其余一律 `failed`。分类只此一处。
3. **视图只映射结局**：`modelTab.ts` 的 `fetchModels` 映射新增 `case "failed-no-model-list"`，产出现有两段式提示：`t("model.fetchFailed", { error: describeAIError(...) })` + `\n` + `t("model.fetchFailedNoModelList")`。删除该处对 `AIClientError` 的引用（该文件仅此一处用它；`apiStyleOf` 另有用处，保留）。末尾穷尽性守卫不动。
4. **文案零变化**：不新增、不改动任何 i18n 键；`describeAIError` 与两段式拼接顺序保持不变。
5. **唯一行为变化（如实记）**：Anthropic **预设** 遇到 404 时，结局从「带手填提示的失败」降为普通 `failed`，不再提示手动添加模型 ID。自定义供应商（Anthropic 方言）的提示逐字不变。
6. **挑选框只加可寻址类名**：`src/settings/modelPicker.ts` 给四个按钮补语义类 `tah-picker-select-all`、`tah-picker-select-none`、`tah-picker-confirm`、`tah-picker-cancel`；保留既有 `tah-auth-btn` / `tah-generate-btn`。`checked` / `rowInputs` / `isModelProtected` 判定与复原逻辑一律不动。
7. **测试缝沿用**：挑选框用例复用 `renderModelTabHarness` 的 ctx（真 `ProviderSettings` 门面 + 真翻译器 + 共享 state），调用 `openModelPicker(h.ctx, h.provider)`，从 `Modal.opened` 末尾取 `contentEl` 作为根。不新增第三份 harness。
8. **测试文件归属**：404 视图回归加进 `test/fetchGate.test.ts`（复用其 `makeHarness` / `fetchButton` / `flush` / `resetFakes`）；挑选框用例新开 `test/modelPicker.test.ts`（`test/*.test.ts` 的 glob 会拾取）。
9. **文档**：本规格副本落地；不新增 ADR、不改 `CONTEXT.md`。「无模型清单」是结局实现词汇，按 ADR-0032「架构词汇不进词表」先例处理。

## Testing Decisions

- **好测试断言外部可见行为**：流程测试断言结局与请求/清单写入；视图测试断言 Notice 文案；挑选框测试断言勾选框状态、Notice 与确认后的启用集。不断言私有 `checked` 集合或内部函数调用。
- **流程矩阵（`test/fetchModelsFlow.test.ts`，4 条）**：
  1. 自定义 Anthropic + 404 → `failed-no-model-list`，携带同一个 `AIClientError`（`models.http` / 404），且不写「模型清单」；
  2. 自定义 Anthropic + 401 → `failed`；
  3. Anthropic 预设 + 404 → `failed`（收紧的边界）；
  4. 自定义 OpenAI + 404 → `failed`（不放宽）。
- **视图回归（`test/fetchGate.test.ts`，1 条）**：自定义 Anthropic 供应商 + 404 响应，点击「获取模型列表」后 Notice 同时含「获取失败」与「手动添加模型 ID」，且不弹挑选框。
- **挑选框用例（`test/modelPicker.test.ts`，6 条）**：
  1. 取消勾选当前模型 → 勾选框立即复原为选中、弹 `model.protectActiveModel`、草稿与启用集不变；
  2. 「全不选」→ 当前模型仍选中、其余不选；确认后启用集恰为 `[当前模型]`；
  3. 「全选」→ 全部选中；确认后启用集为清单全集；
  4. 取消一条非当前模型后确认 → 启用集不含该模型；
  5. 改动勾选后点「取消」→ 启用集一个都不变；
  6. 当前模型属于别的供应商（`activeProviderId` 指向他处）→ 本供应商不误保护，「全不选」确认后启用集为空。
- **既有回归网不变**：`applyPickedModels` / `isModelProtected` 门面测试、`fetchGate` 既有用例、`activeModelRefresh` / `providerChangeNotification` 全部保持通过。
- **不测**：DOM 视觉、焦点、键盘行为（仓库既有约束：无 DOM / 视觉测试）。

## Out of Scope

- 把 404 分类放宽到任何供应商 / 自定义 OpenAI 403（403 不是 404）；重新讨论「自定义 OpenAI 404 是否也该提示」——另立 issue。
- 给预设供应商提供手填模型行，或为预设单独设计一条 404 文案。
- 把挑选框保护规则抽成纯函数、重构对话框逻辑或改变「当前模型」保护的产品语义（ADR-0026 不动）。
- 挑选框的视觉 / 焦点 / 键盘测试。
- 其它失败结局（`models.network` / `models.parse` / `timeout`）的分类改造。
- 新增 ADR、`CONTEXT.md` 词条或 i18n 键。

## Acceptance Criteria

1. 自定义 Anthropic + 404 返回 `failed-no-model-list`，视图提示仍为「失败详情 + 手动添加模型 ID」两段，文案逐字不变。
2. 自定义 Anthropic 401、Anthropic 预设 404、自定义 OpenAI 404 均返回 `failed`，且不出现手填提示。
3. `modelTab.ts` 的「获取模型列表」映射中不再出现 `AIClientError` 或 `details.status` 判断；新增结局由穷尽性守卫逼视图补全。
4. 挑选框六条保护规则用例全绿，断言只落在勾选框状态、Notice 与确认后的启用集。
5. 四个按钮语义类名存在，且测试按类名寻址。
6. 无新增 i18n 键；`npm run check`（typecheck + lint + test）全绿。
7. 本规格副本落地；无 ADR、无 `CONTEXT.md` 变更。

Related: #87, #105, #111

## 落地备注（实现时核对，不改正文）

- 挑选框四个按钮的语义类名改用 `tah-model-picker-select-all` / `-select-none` / `-confirm` / `-cancel`：`styles.css:1477` 已写明「`tah-picker-*` 命名已被任务挑选取用，模型挑选用 `tah-model-picker-*`」，正文 Decision 6 的 `tah-picker-*` 与这条仓库约定冲突，按约定优先。语义类数量、用途与测试寻址方式不变。
