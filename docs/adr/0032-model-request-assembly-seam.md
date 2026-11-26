# 「当前模型 → 请求」单缝装配：策略烤定案与三变体请求联合

> 规格见 issue #111；起源：`/improve-codebase-architecture` 候选 1（2026-11-26 巡览，design-it-twice 三版对拍）。
> 与 [ADR-0002](0002-ai-transport-decoupled-from-obsidian.md)（传输缝独立，RequestFn 不动）、
> [ADR-0024](0024-thinking-off-by-default.md)（单键思考参数——联合变体上的单值可选字段即其类型化）、
> [ADR-0030](0030-model-request-policy-overlay.md)（执行层只消费——本记录把它做到最强：client 不再 import 策略助手）、
> [ADR-0031](0031-wire-protocol-per-model.md)（协议是方言之内的模型级选择——两级判别字段即该裁决的类型化）衔接，
> 不推翻任何一条。

## Context

「当前模型」解析出的同一份事实被三处各自手工投影成请求配置（生成 10 字段、思考测试 8 字段、「测试」按钮 7 字段）；
`AIClientConfig` 四个可选字段各带静默缺省，漏抄不报错、只静默顶上；`anthropic`＋`responses` 矛盾组合类型可表示；
`ActiveModelConfig.contextLength` 解析产物无消费者。design-it-twice 三版（极简 / 灵活 / 生成零负担）在
「策略烤定案、三变体联合、候选收进缝、守卫留 resolveActive、传输口不动」上全票一致；分岔处经对拍裁决如下。

## Decision

1. **新纯模块 `src/ai/modelRequest.ts` 是「当前模型 → 请求」唯一的缝**，四个入口：
   `resolveModelFacts(provider, model, params?)`（总函数、逐层回落；行参数经**入参**递入——resolveActive 传
   `modelParams`、按钮传输入框值；不 import settings 侧任何模块）、`assembleChatRequest({target, facts, messages, globals})`
   （生成与「测试」按钮共用）、`assembleProbeRequest({target, facts, timeoutSeconds, param})`（探测提示与预算 256 内化、
   不吃额度下限、超时仍吃下限）、`probeOffCandidates(facts, providerId)`（providerId 由流程显式递入，record/clear 单一来源不变）。
2. **请求是三变体判别联合 `ModelRequest`**（放 types.ts），两级判别 `dialect` × `protocol` 镜像 ADR-0028 / 0031 的两根轴；
   Anthropic 变体无 protocol / 无 requestPolicy / 无 temperature（2026-10-21 已删，策略加不回——ADR-0030 分层规则类型化）；
   messages 收进请求，`chatCompletion(req)` / `thinkingProbe(req)` 单实参（+可选 RequestFn）；矛盾组合编译期不可表示。
3. **策略在装配层烤成定案**：温度按「策略 × 本次生效 effort」判死、额度 `max(行级 ?? 全局, 下限)` 钳 384K、超时抬下限——
   client 不再 import `src/core/requestPolicy`，`switch` 只放字段。
4. **facts 平铺不联合**：事实被零散读（假关判定读思考解析、显示矩阵读能力），类型诚实集中在唯一分派点（请求联合）。
5. **探测逐步装配**：状态机照旧拥有「基线 → 逐字段 → 四值判定」循环，每步现装配一次。
6. **「测试」按钮与生成共用装配，且发该行解析出的思考参数**（行为变化，如实记：带习得条目的自定义行
   「测试通过 ⇒ 生成可用」更真；其余模型实发面为零）。ping 消息归按钮的装配输入，`testConnection`（四行直通）删除。
7. **防环与收缩**：`thinkingFor` 挪 `src/core/thinking.ts`、providerSettings 原位 re-export（既有调用方零改动）；
   `resolveActive` 收缩为守卫 / 身份 / 密钥并委托事实解析，守卫语义零变更；`ActiveModelConfig` = `ModelFacts & RequestTarget`，
   `contextLength` 退役（模型行 UI / 持久化照常）。
8. **globals 窄三元组名 `RequestGlobals`**（必填三字段 temperature / maxTokens / timeoutSeconds，不收整份设置，
   避免与 appSettings 的 `GenerationParams` 撞名）。
9. **测试 replace, don't layer**：策略算术测试迁 `test/modelRequest.test.ts`（纯断言、无传输 mock）并删原处，不留双份；
   新增「按钮 ≡ 生成」等价测试；旧缝上的逐字段交接断言随交接一起消失。清单见 #111。

## Considered Options

- **探测计划对象（极简版）**：`candidates` + `requestFor(param)` 一次拿整包，对象身份查表、外来参数抛错——单次调用杠杆最大，
  但为一处循环发明一套小型语义，对 AI 可导航性净亏——否。
- **purpose 携带 param、事实装配时补齐（生成零负担版）**：生成调用最省，但事实解析有两个家（双源）、purpose 带数据语义混浊——否。
- **携带原始策略过缝**：client 仍要 import 策略判定助手，且 Anthropic 变体得发明「策略在场但恒空」的误导形状
  （正是 ADR-0031 为 protocol 禁掉的东西）——否。
- **client 直收 provider / model / settings 自行解析**：执行层开始依赖设置与供应商领域类型，违反 ADR-0002 方向，三版一致拒绝——否。
- **facts 联合化**：Anthropic 事实装不下 protocol 更诚实，但每个零散读点都要交窄化税，而需要诚实的只有装配分派一处——否。
- **只把 `AIClientConfig` 改必填**：三处照抄不减，静默缺省只是搬家——否。

## Consequences

- 执行层变纯：client.ts 的类型 import 缩到 `ModelRequest`（报文构造另需 `ChatMessage` / `ThinkingParam`，
  清单配置仍用 `ApiStyle`），删 RequestPolicy / WireProtocol / requestPolicy.ts 依赖；「探测预算不吃下限」从注释约定变结构（探测入口够不到额度下限助手）。
- 表未来零接口变化：加策略行 / 能力行 / 候选清单改动不动接口；加协议值 = 值 + 核心表行 + 联合变体 + client 格式器四处，
  编译器引导补全。
- 假关判定与显示矩阵仍读 facts（呈现层关注点不属装配），`ModelFacts` 因此保留完整 `ThinkingResolution`。
- 按钮对未保存的行也走同一事实解析（表查找对任意模型串可算）；守卫 need-url / need-model 留在按钮。
- 行为变化唯一一处：带习得条目的自定义模型行「测试」开始发思考参数（#111 AC7）；其余请求逐字段等价。
- `ModelRequest` / 装配属架构词汇，循 ADR-0023「frame 不进词表」先例，不入 `CONTEXT.md`。
