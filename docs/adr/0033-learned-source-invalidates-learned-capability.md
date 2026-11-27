# 习得能力带「习得来源」，来源不符按未知

> 规格见 issue #112；起源：`/improve-codebase-architecture` 候选 2（2026-11-26 架构巡览，grilling 定案）。
> **修订 [ADR-0026](0026-thinking-test-learned-capability-model-catalog.md) 的优先级裁决**：把「习得能力 ＞ 内置能力表 ＞ 未知」
> 改为「习得能力（来源一致）＞ 内置能力表 ＞ 未知」——只加一条前提，不翻案。
> **确认 [ADR-0028](0028-api-dialect-as-provider-property.md)「切换方言保留配置」不变**：条目仍原样保留，只是不再照信。
> 与 [ADR-0031](0031-wire-protocol-per-model.md)（协议按（供应商, 模型）查表、可随版本表迁移）、
> [ADR-0032](0032-model-request-assembly-seam.md)（事实解析单缝）衔接：来源在一次事实解析里得出，判定只发生在解析层。

## Context

「习得能力」（#89）按（供应商, 模型）落键，载荷却是「接口方言 / 接口协议」形状的关参数：

- 自定义供应商在 OpenAI 方言下习得 `reasoning_effort: "none"`；用户切换方言到 Anthropic（#105 支持的动作），
  条目按 ADR-0028 保留；生成把 Chat 专有字段发往 `/messages` → 400 → `ai-error`，徽标仍显「实测」，
  纠正只能靠用户自发「重新测试」。
- ADR-0031 预告的「按一行表迁移」协议切换同样撞上：旧顶层 `reasoning_effort` 会原样发往 `/responses`
  （该字段在 Responses 上不存在——正是能力表加「未知挡位行」要防的事，只是防的是内置表，没防习得条目）。
- 证据锚点：`src/types.ts` L238–247（`LearnedCapability` 无来源维度）、`src/core/thinking.ts` L172–185
  （习得分支盲信 `learned.off`）、`src/settings/providerSettings.ts` L212–221（只写方言、其余保留）、
  `test/providerSettings.test.ts` L228–255（断言跨方言保留，没区分「保留」与「照信」）、
  `src/settings/logic.ts` L273–289（归一不验参数形状）。

## Decision

1. **条目带「习得来源」**：`LearnedSource` 是判别联合 `{ apiStyle: "openai"; protocol: WireProtocol } | { apiStyle: "anthropic" }`
   （镜像 ADR-0028 / ADR-0031 的两根轴；Anthropic 方言无协议）。`LearnedCapability` 增加可选 `source`
   （缺失＝旧版本条目＝来源不明）。**API 地址不记**——见 Considered Options。
2. **判定只在解析层发生一次**：`thinkingFor` 解析该（供应商, 模型）的当前来源
   （`resolveApiStyle` + `resolveWireProtocol`，与 #111 的 facts 同一来源），随 `resolveThinking` 传入
   （`ThinkingInput.source` 必填）。来源相符才生效；缺失 / 不符 / 不可解析一律**条目保留、解析为未知**
   （`param: null`），并通过 `ThinkingResolution.staleLearned` 带出该条目供呈现。
   优先级仍是「习得 ＞ 内置 ＞ 未知」，只多了「来源一致才轮到习得」这一条前提。
3. **呈现为「习得过期」而非消失**：新增显示状态 `learned-stale`——琥珀徽标（沿用「实测 {{date}}」文案）、
   脚注说明接口方言/协议已变更或无法确认、测试入口「重新测试」、思考开关置灰（能力未知）。
   切换方言**不弹新通知、不自动重测**（不在配置变更处发隐藏请求，延续 #90）。
4. **写入不经手抄**：来源由思考测试状态机随候选清单一起携带（`startThinkingTest(candidates, source)`），
   条目出生即完整；探测请求与落档条目取自同一次事实解析，流程层不再事后往 `entry` 里补字段。
5. **载入归一不发明来源**：存量条目缺 `source` 时原样保留（不写盘），按来源不明处理；
   来源结构不可读亦保留为来源不明（OpenAI 来源缺 `protocol` 同样按不可解析，不补 Chat 缺省）。
   `switchable` 条目的关参数名若不属于**条目自称来源**的候选清单
   （`thinkingOffCandidates`），视为内部矛盾的脏数据剔除（关闭「不验参数形状」）。
6. **存储仍是「每模型一条最近结论」**：切回旧来源时条目复得；在新来源重测会覆盖旧结论。

## Considered Options

- **载入时按当时的方言/协议补章**：看似「数据零迁移」，实为给条目盖一个它没经历过的来源声明，
  且归一结果会随下一次保存落盘——假履历被长期信任，正是本 bug 的复刻——否。
- **缺失来源＝通配，照信**：老数据原样踩坑，只保护新测试——否。
- **只让 `switchable` 失效**：弱结论受同一来源影响（Anthropic 的基线是请求级 opt-in），
  只作废一档会让界面半绿半灰、用户无从判断哪条可信——否。
- **按（方言, 协议）分槽多存**：切换来回不丢结论，但要改持久化形状与每个读面，只为罕见路径——否。
- **来源加 API 地址指纹**：地址变更（补 `/v1`、换代理）是常态操作，会大面积误失效——否，
  地址变更与网关侧行为漂移作为残余风险记入 Consequences。
- **切方言即清习得**：违背 ADR-0028「切换保留配置」的精神，切回原方言时白丢结论——否。
- **切方言即自动重测**：在配置变更处发起隐藏请求，与 #90「获取模型的唯一入口是手动按钮」同族违反——否。
- **复用 `unknown` 状态呈现过期**：零新增文案，但绿色「实测」一声不响变灰，会被读成数据丢失——否。

## Consequences

- **行为变化**：升级后存量习得条目一律呈现「需重测」（条目本身保留、可点重新测试，自愈一次）；
  **来源不符的条目绝不进入任何请求**（生成 / 连接测试 / 思考测试的基线与逐字段都不发它的关参数）。
  这与 #111 AC7「按钮发该行解析出的思考参数」同向——来源不符时解析出的就是「不发」。
- **呈现层加一行**：`ThinkingDisplayState` 增 `learned-stale`，`thinkingDisplayCopy`（zh/en）与显示矩阵
  编译器引导补全；徽标日期取 `staleLearned.testedAt`。
- **残余风险（如实记录）**：① API 地址变更、网关侧行为漂移不由来源捕获，只能靠用户重测；
  ② 候选清单未来若删减某个字段，用该字段学来的条目会在载入时被判脏数据剔除（同为「未知 + 重测」，可自愈）；
  ③ 每模型一条：方言来回切需在新来源重测，覆盖后旧结论不再回来。
- **词表**：`CONTEXT.md` 新增「习得来源（Learned Source）」，「习得能力」词条补上来源与失效语义。
  这是领域词汇；`LearnedSource` 类型本身属架构词汇，循 ADR-0032 先例不另立词条。
- **不改的裁决**：ADR-0028 的「切换保留配置」、ADR-0026 的「习得 ＞ 内置」次序、ADR-0030 / 0031 的协议层位
  全部不动；本记录只在习得条目上补一层来源前提。
