# 三张同构表保持分家，交叉排序不变式由生成式测试执法

> 规格见 issue #114；起源：`/improve-codebase-architecture` 候选 4（2026-11-26 巡览，grilling 定案）。
> **不推翻 [ADR-0030](0030-model-request-policy-overlay.md) 的「拒绝合表」**：本记录只给三张表加组合与执法，
> 不合并语义。**不改 [ADR-0031](0031-wire-protocol-per-model.md) 的「同源漂移」裁决**：只把漂移的后果
> 从「注释与手写样例」升级为生成式测试，属加法。
> 与 [ADR-0026](0026-thinking-test-learned-capability-model-catalog.md)（显式未知挡位）、
> [ADR-0032](0032-model-request-assembly-seam.md)（`resolveModelFacts` 是事实组合点）衔接——
> 执法面直接驱动这条装配缝，而不是分开测零件。

## Context

三张行键同构、都靠「首个命中」的窄表分散在三个文件：协议表（`src/core/wireProtocol.ts` 3 行）、
模型请求策略表（`src/core/requestPolicy.ts` 5 行）、思考能力表（`src/core/thinking.ts` 84–155 行）。
共用判定 `matchModelPattern` 却住在思考能力表模块里，被另两张表反向 import。

「Responses 路由的模型不得命中 Chat 形态参数」这条排序不变式只有注释与手写样例看守：
新增一个 Responses-only 族要同步改三处（协议表行、能力表显式未知挡位行、清单放回），漏一处
就会在 `/responses` 上发出 Chat 专有的顶层 `reasoning_effort`（或给 Chat 发嵌套 `reasoning`）。
能力表是首个命中匹配，挡位行还必须排在 `gpt-5.2*` / `gpt-5.4*` / `gpt-5.6*` 等前缀行之前——
顺序本身就是行为，而顺序没有执法面。

另外三处漂移：四张候选清单数组各自复述能力表构造器已有的关参数形状（Responses 的嵌套形状在
能力表里没有对应行，无法从行派生）；`thinkingCardModel` 用全局候选清单长度兜底 `triedFields`，
对 OpenAI 预设（1 个候选）会显示「实测 3 个字段」这种没有发生过的事。

## Decision

1. **三张表保持分家**（承 ADR-0030）。**执法面放在生成式交叉测试，不放运行时兜底**：
   在 `test/modelTableInvariants.test.ts` 里遍历协议表的每一行，机械造出一个「见证模型」
   （精确 ID 原样、`*-pro` → `any-pro`、`gpt-oss-*` → `gpt-oss-any`），先自检「见证模型确实解析回该行协议」，
   再驱动生产组合缝 `resolveModelFacts(供应商桩, witness)` 与 `probeOffCandidates(facts, providerId)`，断言：
   - 解析出的思考参数为 `null`，或属于该协议允许的形状集；
   - 该协议候选集全部落在允许形状集内；
   - 见证模型能过 `filterModelCatalog("openai", …)`（否则路由到 Responses 却选不进清单）。
   允许形状集：OpenAI-Chat＝顶层 `thinking` / `enable_thinking` / `reasoning_effort`；
   OpenAI-Responses＝只有嵌套 `reasoning.effort`；Anthropic＝只有顶层 `thinking`。
2. **同一套形状集扫全表**：交叉测试再遍历 `THINKING_CAPABILITIES` 每一行，凡 `switchable` 行，
   其 `off` 与 `on` 参数都必须属于该行解析出的（方言, 协议）允许形状集。`on` 与 `off` 同风险——
   顶层 `reasoning_effort:"high"` 发到 `/responses` 一样是错字段。这条不扩大交付面，只多扫一张表。
3. **`matchModelPattern` 抽到 `src/core/modelPattern.ts`**：三张表与测试全部改从那里导入；
   `thinking.ts` **不留** re-export（留兼容出口等于保留两条导入路径，正是本次要消掉的形状）。
   这是依赖方向，不是合表。
4. **候选形状单源、清单仍显式有序**：在 `thinking.ts` 内定义四个模块私有的命名形状常量
   （`thinking:{type:"disabled"}` / `enable_thinking:false` / `reasoning_effort:"none"` /
   `reasoning:{effort:"none"}`），能力表开关构造器与四张候选清单都引用它们。
   清单**不移除、不换成从能力行派生**：Responses 的嵌套形状没有对应能力行（那些族按 ADR-0026 不登记），
   派生不出来；「先试哪个」的顺序是设计，保留显式数组。
5. **`triedFields` 只认记录值**：`thinkingCardModel` 不再用全局候选清单长度兜底；
   条目缺 `triedFields` 时改用无 `{{count}}` 的文案变体（zh/en 各一条），不对当前配置做推断。
   卡片模型随之不再 import `THINKING_OFF_CANDIDATES`，呈现层与测试算法彻底脱钩（#102 已定的方向）。
6. **回写旧档**：ADR-0031 的「同源漂移」后果补一行注记，指向本记录；ADR-0030 不动。

## Considered Options

- **运行时兜底：`resolveModelFacts` 发现错形状参数就悄悄丢掉**：把「表写错了」变成「参数静默消失」，
  正是 ADR-0032 / #111 刚消灭的那类失败模式——否。
- **类型面收窄：把 `ThinkingParam` 拆成协议专属联合**：习得能力可携带任意关参数，收窄会卡死学习面
  （ADR-0030 已记录同类理由）——否。
- **合并成一张「模型族」表**：三层失败模式与维护源不同（报文路由 / 参数窄化 / 能力判定），
  ADR-0030 已拒绝；本候选只组合与执法——否。
- **从能力行派生候选清单**：Responses 嵌套形状在能力表里没有行（ADR-0026 明确不登记未知族），
  派生覆盖不到；未知模型恰恰最需要候选——否。
- **按当前来源的候选清单长度兜底 `triedFields`**：仍是事后重构而非记录事实；候选清单随版本改过顺序或条目时
  同样会说错，卡片模型还要新增方言 / 协议输入——否。
- **只保留手写样例测试**：顺序敏感的前缀挡位与三处同步点正是人会忘的地方；
  样例只覆盖已登记的族，新族漏改时全绿——否。

## Consequences

- **新增 Responses-only 族的三处同步点有了执法**：协议行、能力表显式未知挡位行（且必须排在通用前缀行之前）、
  清单放回；漏任何一处（含顺序错）都会让生成式测试变红。
- **见证模型是测试本地约定**：`*` 结尾 / 开头 / 单独 `*` 各有一条造名规则；「先断言见证模型确实解析回该行协议」
  是自检，防止造名规则本身把测试带偏。
- **全表扫描允许合法例外**：未来若官方给出某 Responses 族的 `none` 支持，按 ADR-0026 补一条 `switchable`
  行并写成嵌套 `reasoning.effort` 即可通过；写成顶层 `reasoning_effort` 才会红。
- **呈现层变化仅一处**：缺 `triedFields` 的「未能关闭」条目改显无数字文案；有记录值时文案与行为不变。
  新增一个 i18n 键（zh/en 齐备）。
- **无运行时行为变化、无合表、无新界面**；`ModelFacts` / 装配形状不动。
- **词汇不进 `CONTEXT.md`**：见证模型、执法面、形状集属架构 / 测试词汇，循 ADR-0032「架构词汇不进词表」先例。
- **实施排在 #112 之后**：该票给习得条目加「习得来源」，会重塑候选分派与 `resolveThinking`；
  本票的候选单源化与 `triedFields` 规则正好落在其未来形状上，先做要再改一遍。
