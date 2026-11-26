# 接口协议：方言之内的模型级端点选择

> 规格见 issue #110；事实锚点 `docs/research/responses-api.md`（2026-11-26 官方文档核对）。
> **修订 [ADR-0028](0028-api-dialect-as-provider-property.md) 第 2 条**「方言只决定地址、认证头、请求体与响应读取」：
> 地址根、认证头与错误语义仍归方言，端点路径、请求体与响应读取改由「接口协议」决定。
> **部分取代 [ADR-0030](0030-model-request-policy-overlay.md) 第 4 条**（「Responses-only 不进清单」在 #110 反转）；
> 0030 的其余裁决（方言定基线、策略只能窄化、不按地址嗅探）不变——协议不是窄化，是同层正交的另一个选择。

## Context

ADR-0028 把「接口方言」定为**供应商级属性**：一个供应商说一种协议。ADR-0030 已在方言之上加了第二层「模型请求策略」，但那层只允许**窄化参数**（删掉该模型不接受的、抬高下限），装不下「换一套报文」这种量级。

OpenAI 官方打破了这个前提：同一家供应商同时提供 `POST /v1/chat/completions` 与 `POST /v1/responses`，**按模型**决定哪个可用（`gpt-5.5-pro` / `gpt-oss-*` / `gpt-5.6-cyber` 只有 Responses）。两边的差异不是参数：`messages` → `input`、`max_completion_tokens` → `max_output_tokens`、`choices[0].message.content` → `output[]`、`reasoning_effort` → `reasoning.effort`。把它塞进「模型请求策略」会让那张表同时管参数与报文，职责失焦；新增第三个方言值又与「方言是供应商级属性」直接冲突（同一预设里两种模型混用，用户切不了）。

## Decision

1. **新增「接口协议」层**：`WireProtocol = "chat-completions" | "responses"`，按（供应商 id, 模型 pattern）查内置表解析，**首个命中行生效，缺省 `chat-completions`**。纯函数、无用户配置面、只对内置 `openai` 预设开行。
2. **层位：方言是基线，协议是方言之内的报文选择。** 方言仍决定地址根、认证头、错误语义与清单拉取；协议只决定该模型的对话端点路径、请求体字段与响应读取。**协议不能跨方言混用**——Anthropic 方言永远走 Messages 形态，不查协议表。
3. **只在必需时走 Responses**：`*-pro`（后缀匹配）、`gpt-oss-*`、`gpt-5.6-cyber`。Chat Completions 可用的模型（`gpt-6.x` 及老非推理族）**请求形态逐字段不变**，不吃官方「推理模型建议用 Responses」的性能偏好。
4. **请求策略层不变**：预算下限、超时下限、温度规则仍由 `RequestPolicy` 窄化，协议层只消费。温度判定的「生效 effort」读法扩为两种携带形态（顶层 `reasoning_effort` 或嵌套 `reasoning.effort`）——规则本身不变。
5. **响应默认不保存**：Responses 请求显式 `store: false`（插件不需要会话状态，任务数据不该因缺省而被上游保留）。Chat 路径不受影响。
6. **清单过滤随协议能力放回**：`*-pro` / `gpt-oss-*` / `gpt-5.6-cyber` 重新进入「模型清单」；`gpt-rosalind-research`（端点无官方依据）与 `chat-latest`（官方不建议 API 使用）继续排除。清单仍是过滤后的完整快照，「已失效」语义不变。

## Considered Options

- **新增第三个方言值（`openai-responses`）**：方言是供应商级属性（ADR-0028），同一家 OpenAI 里两种模型混用，方言装不下按模型的分叉；用户还要为同一家供应商手动切协议——否。
- **把协议并进「模型请求策略」**：那张表的语义是「只能窄化参数」，协议换的是报文与读取面，两件事的失败模式与维护源都不同，合表会让策略表长出与窄化无关的字段——否。
- **在预设卡上暴露协议单选**：新增用户配置面，用户也无从判断某个模型该用哪套协议（`/v1/models` 不带端点字段）；#106 的「零新界面」裁决保持——否。
- **推理族（GPT-5.x / 6.x）一律切 Responses**：官方推荐对应的是性能（缓存与评测），当前用途是纯文本单轮；切过去要重做已验收的请求形态与读面，收益不抵风险——否，等有实测收益再按一行表迁移。
- **按地址或模型名嗅探端点**：地址可改、代理与自建网关会被误套；模型名匹配本来就是 #106 已采用的维护方式——否。

## Consequences

- **两张表同源漂移**：协议表（`src/core/wireProtocol.ts`）与清单排除表（`src/core/modelCatalogFilter.ts`）都要随新模型族更新，事实源是研究笔记，维护流程与思考能力表一致。
- **第二个请求构造与读取面**：客户端多一套 body 与 parse 分支；共享的温度判定、思考参数并键、额度与超时下限仍只有一处实现，避免策略规则在两条路径上分叉。
- **错误语义零新增**：Responses 的「只推理、无正文」仍归 `chat.empty`；`output[]` 形态不对归 `chat.parse`；其余沿用 `timeout` / `chat.http` / `chat.network` / `models.*`。
- **能力表不登记新族（但显式挡位）**：官方未给出 `*-pro` / `gpt-oss-*` 的 `none` 支持，按 ADR-0026「不登记＝未知」——开关置灰、思考测试可点，习得结论照旧盖过内置表。表是首个命中匹配，因此这些族必须排在 `gpt-5.2*` / `gpt-5.4*` / `gpt-5.6*` 前缀行之前，用显式「未知」行挡住，否则会在 Responses 上发出 Chat 专有的 `reasoning_effort`。
- **无界面变化**：协议从模型解析随配置带出，用户不可见、不可改；预设卡与思考卡外观不变。
