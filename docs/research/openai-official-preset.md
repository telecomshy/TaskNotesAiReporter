# OpenAI 官方预设调研（API 方言事实核对）

_调研日期：2026-11-26。上游锚点：OpenAI API `v1`；模型目录为当日线上版本，最新条目 GPT-6.2 Astra / Sol（2026-11-17 发布）；弃用页公告截至 2026-11-18。本文只记录官方文档可核实的事实，不替代 #106 的产品决策。_

## 摘要

- `GET /v1/models` 每项只有 `id`、`created`、`object`、`owned_by`、`shutdown_date`；**没有** modality、capabilities 或 supported-endpoints 字段，官方也没有返回这些信息的 API。
- 当前文本模型全部是推理模型（GPT-5.x / GPT-6.x），`max_completion_tokens` 是唯一在文档里被定义为「含推理 token 的输出预算」的参数；`max_tokens` 在 Chat Completions 参考中被标为 deprecated。
- `temperature` / `top_p` 的合法性按模型族不同：GPT-6.2 必须省略；GPT-6 Astra 明确「不支持自定义值」；GPT-5.2 / GPT-5.4 仅在 `reasoning_effort: "none"` 时合法，否则报错。
- Chat Completions 仍然受支持，纯文本单轮可用；`*-pro` 与 `gpt-oss-*` 只支持 Responses，`gpt-6.2-*` 只是「工具调用」需要 Responses。
- 官方文档没有任何「典型延迟秒数」或「建议超时下限」；60 秒是否够用无法从官方文档核实。

## 1. `GET /v1/models` 响应结构

官方参考（List models）定义每个 `Model`：

| 字段 | 类型 | 官方说明 |
| --- | --- | --- |
| `id` | string | "The model identifier, which can be referenced in the API endpoints." |
| `created` | integer (unixtime) | "The Unix timestamp (in seconds) when the model was created." |
| `object` | `"model"` | "The object type, which is always \"model\"." |
| `owned_by` | string | "The organization that owns the model." |
| `shutdown_date` | optional string/null (date) | "The date when the model will shut down, or null if not announced." |

- 顶层只有 `object: "list"` 与 `data: array of Model`；示例响应也只含上述五个字段。
- 端点说明："Lists the currently available models, and provides basic information about each one such as the owner and availability." 未提供过滤、分页或能力查询参数。
- `GET /v1/models/{model}` 返回同一 `Model` 对象（`id, created, object, owned_by, shutdown_date`），没有更多能力信息。
- 在 Models 参考全文里检索 `capabilit` / `modalit` 均无结果；**客户端无法从 API 判断某模型是否支持 chat**。
- 官方的「支持端点」信息只存在于**文档站每个模型页的 `## Endpoints` 表**（例：`gpt-6.2-astra` 的 Chat Completions = Supported；`gpt-image-2.6-sunburst` 的 Chat Completions = Not supported；`gpt-oss-120b` 的 Chat Completions = Not supported）。这不是 API，也没有机器可读聚合端点。
- 结论：要区分 chat / embedding / tts / image / realtime / moderation，只能靠硬编码清单、命名启发式，或抓文档页；`/v1/models` 本身不提供依据。

## 2. 当前模型目录（2026-11）

### 2.1 Chat Completions 可用的文本模型（可直接套用现有 `chat/completions` 请求）

- GPT-6.2：`gpt-6.2-astra`、`gpt-6.2-sol`（2026-11-17）
- GPT-6.1：`gpt-6.1-terra`（2026-10-26）、`gpt-6.1-sol`（2026-09-29）
- GPT-6：`gpt-6-astra`（2026-09-03）、`gpt-6-sol`、`gpt-6-luna`（2026-09-22）
- GPT-5.6：`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`（2026-07-09）
- GPT-5.x：`gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.2`
- 专用/受限：`gpt-6-cyber`；`chat-latest`（目录注明「Models used in ChatGPT, not recommended for API use」）
- 仍在目录但已弃用、将于 2026-12-11 / 2027-01-14 关停：`gpt-5`、`gpt-5-mini`、`gpt-5-nano`、`gpt-5.1`、`gpt-4.1`、`gpt-4o` 等

### 2.2 仅 Responses 的文本模型（Chat Completions = Not supported）

- `gpt-5.5-pro`、`gpt-5.4-pro`、`gpt-5.2-pro`
- `gpt-oss-120b`、`gpt-oss-20b`（open-weight，端点表仅 Responses）
- `gpt-5.6-cyber`
- `gpt-rosalind-research`（目录有 ID，无独立模型页可核对端点）

### 2.3 非 chat 家族（出现在目录中）

| 家族 | 当前 ID（示例） | 对应端点 |
| --- | --- | --- |
| Embedding | `text-embedding-3-large`、`text-embedding-3-small`、`text-embedding-ada-002` | `v1/embeddings` |
| Image | `gpt-image-2.6-sunburst`、`gpt-image-2.6-flare`、`gpt-image-2.5-sunburst`、`gpt-image-2.5-flare` | `v1/images/generations` / `edits` |
| Realtime | `gpt-realtime-2.1`、`gpt-realtime-2.1-mini`、`gpt-realtime-2`、`gpt-realtime-1.5`、`gpt-realtime-translate` | `v1/realtime` |
| Live（全双工语音） | `gpt-live-1.1`、`gpt-live-1` | `v1/live/sessions` |
| Audio in/out | `gpt-audio-1.5` | Chat Completions（但输出音频，不是纯文本） |
| Transcription | `gpt-transcribe`、`gpt-live-transcribe`、`gpt-realtime-whisper` | `v1/audio/transcriptions` / realtime |
| Moderation | `omni-moderation-latest`、`omni-moderation-csam-latest` | `v1/moderations` |
| 已弃用但未关停、仍可能出现在列表 | `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts`（2027-01-06 关停）、`whisper-1`、`gpt-4o-transcribe*`（2027-02-26 关停） | speech / transcriptions |

注意：官方从未公布某个账号 `/v1/models` 的完整返回集合；上表是目录事实，**不是** `/v1/models` 的实测输出。

## 3. `max_completion_tokens` vs `max_tokens`

Chat Completions 参考原文：

- `max_completion_tokens`："An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens."
- `max_tokens`："The maximum number of tokens that can be generated in the chat completion." … "This value is now deprecated in favor of `max_completion_tokens`, and is not compatible with o-series models."

| 问题 | 可核实结论 |
| --- | --- |
| 哪些模型必须用 `max_completion_tokens` | 文档只明确写了「`max_tokens` 与 o-series 不兼容」。当前 GPT-5.x / GPT-6.x 是否同样拒绝 `max_tokens`，**文档没有写**（旧笔记里的 400 原文在当前官方文档中检索不到）。 |
| 是否所有模型都弃用 `max_tokens` | 参数级别写的是 "now deprecated in favor of `max_completion_tokens`"，没有限定只对推理模型；但这是「弃用」，不是「已移除」。Responses API 根本没有 `max_tokens` 参数。 |
| 有无模型拒绝 `max_completion_tokens` | 没有任何模型族被文档标注为拒绝。唯一限制：Predicted Outputs 与 `max_completion_tokens` 不兼容（"`max_completion_tokens`: not supported"）。 |
| 合法范围（Chat Completions） | 参考只写 `integer or null`，**没有** minimum / maximum。 |
| 合法范围（Responses） | `max_output_tokens` 同样是「含 reasoning tokens」的预算，文档给出 `minimum: 16`，无全局 maximum。 |
| 实际上限 | 由每个模型页给出：当前 GPT-6 / GPT-5.6 / GPT-5.5 均为 "128,000 max output tokens"；同时不得超过 context window 减去输入的剩余空间。 |

## 4. `temperature` / `top_p` 规则

按模型族的官方口径：

| 模型族 | 规则 | 原文/依据 |
| --- | --- | --- |
| GPT-6.2 Astra / Sol | **总是省略** `temperature`、`top_p`、`logprobs`、`top_logprobs` | "When migrating Chat Completions requests, omit `temperature`, `top_p`, `logprobs`, and `top_logprobs`."（该族不支持 `none`，所以不存在「effort = none 时可传」的分支） |
| GPT-6 Astra | **总是**不支持自定义值 | "GPT-6 Astra does not support custom `temperature` or `top_p` values or log probabilities (`logprobs`)." |
| GPT-6.1 Sol | 省略（`none` 不受支持） | "GPT-6 Astra and GPT-6.1 Sol do not support the `none` reasoning effort" + "When reasoning effort is not `none`, remove `temperature`, `top_p`, and `top_logprobs`." |
| GPT-6.1 Terra / GPT-6 Sol / GPT-6 Luna | 仅当 `reasoning_effort` ≠ `none` 时省略；设为 `none` 时合法 | 同上；这三者支持 `none`。 |
| GPT-5.2 / GPT-5.4 | 仅在 `reasoning_effort: "none"` 时支持；否则报错 | "The following parameters are **only supported** when using GPT-5.4 with reasoning effort set to `none`: `temperature`, `top_p`, `logprobs`. Requests that include these fields will raise an error for GPT-5.4 or GPT-5.2 with any other reasoning effort setting" |
| GPT-5.6 Sol / Terra / Luna | 文档未单独写明温度规则 | 只写了 `reasoning.effort` 支持 `none…max`、默认 `medium`。 |
| GPT-4.1 / GPT-4o（非推理，弃用中） | 可传 | 参考中的通用 0–2 范围适用。 |

通用定义：`temperature` 0–2，默认 1；`top_p` 0–1，默认 1；"We generally recommend altering this or `top_p` but not both."

因此答案是**「当 reasoning effort 不是 none 时省略」**，不是「推理家族一律不能传」。例外是 GPT-6.2 / GPT-6 Astra：它们根本不允许 `none`，所以效果上等于「总是省略」。**官方文档没有给出这些 400 的逐字错误文本**。

## 5. 推理输出预算与默认 effort

- 预算覆盖范围："`max_completion_tokens` … including visible output tokens and reasoning tokens."；Responses 的 `max_output_tokens` 同理。
- 推理 token 计费与占用："While reasoning tokens are not visible via the API, they still occupy space in the model's context window and are billed as output tokens."
- 推荐预留："OpenAI recommends reserving at least 25,000 tokens for reasoning and outputs when you start experimenting with these models."
- 触顶后果：响应 `status: incomplete`、`incomplete_details.reason: max_output_tokens`，可能「只推理、无可见正文」（"This might occur before any visible output tokens are produced"）。Chat Completions 对应 `finish_reason: "length"`。
- 默认 effort：Chat Completions 参考写 `reasoning_effort` 默认 `"medium"`；推理指南写 GPT-5.6 默认 `medium`，GPT-6.1 Sol / GPT-6 Sol / GPT-6 Luna 也默认 `medium`。GPT-6.2 的默认值未被单独点名（参数级默认仍是 medium）。
- 延迟影响只有定性描述：`none` = "Latency-critical tasks…"；`low` = "Efficient reasoning with a modest latency increase"；`medium` = "a well-balanced point on the pareto curve of latency, performance and cost"；`high/xhigh/max` 依次更慢更贵。

## 6. Chat Completions vs Responses（2026-11）

- Chat Completions 仍是一等端点："While Chat Completions remains supported, Responses is recommended for all new projects."
- 纯文本单轮：GPT-6.2 Astra / Sol 的端点表 Chat Completions = Supported；官方 changelog 亦写 "Both models support the Responses API and Chat Completions. Tool calling requires the Responses API." 即**没有**任何当前 GPT-6 文本模型因「纯文本生成」而强制 Responses。
- 反例（纯文本也必须 Responses）：`gpt-5.5-pro`、`gpt-5.4-pro`、`gpt-5.2-pro`、`gpt-oss-120b`、`gpt-oss-20b`、`gpt-5.6-cyber` 的 Chat Completions 均为 Not supported。
- Responses 的参数名不同但语义对应：`max_output_tokens`（含 reasoning，minimum 16）、`reasoning.effort`、`temperature` 0–2 默认 1、`top_p` 0–1 默认 1；温度省略规则与 Chat Completions 相同。Responses **没有** `max_completion_tokens`。
- 官方对「推理模型」的偏好："Reasoning models work better with the Responses API. While the Chat Completions API is still supported…"；迁移指南称内部评测 SWE-bench 提升 3%、缓存利用率提升 40%–80%。
- 工具调用的额外限制（不涉及纯文本）："Starting with GPT-5.4, Chat Completions does not support tool calling with `reasoning_effort` values other than `none`."；GPT-6.2 Astra / Sol 与 GPT-6.1 Terra 的工具调用需要 Responses。

## 7. Chat Completions 上的思考开关

- 顶层 `reasoning_effort` 被接受：类型 `ReasoningEffort`，可选 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`，默认 `medium`；"Not all reasoning models support every value."
- Chat Completions 与 Responses 使用同一个枚举，只是路径不同：`reasoning_effort`（顶层） vs `reasoning.effort`（对象）。`none` 在 Chat Completions 上**是合法值**，但按模型而定。
- 支持 `none` 的当前族（文档明确）：GPT-5.6 全系、GPT-6.1 Terra、GPT-6 Sol、GPT-6 Luna、GPT-5.2、GPT-5.4。
- 明确拒绝 `none` 并返回 HTTP 400 的族："GPT-6 Astra does not support the `none` reasoning effort"；"The API rejects requests that set reasoning effort to `none`"（GPT-6.2 Astra / Sol）；GPT-6.1 Sol 的 `reasoning.effort` 只列 `low…max`。
- 关闭推理的**唯一**文档化方式：在支持该值的模型上设 `reasoning_effort: "none"`（Chat Completions）或 `reasoning.effort: "none"`（Responses）。不传 ≠ 关闭，不传等于 medium。

## 8. 延迟与超时

- 官方没有给出推理模型的典型延迟秒数、p50/p95 基线或「建议客户端超时」。
- 可核实的量化只有相对值：Fast mode "up to 2.5× faster speeds than standard processing at twice the price"。
- 其余均为定性建议（降低 effort、流式、减少输出、缓存、并行、后台模式）；延迟优化指南要求自行测量 p50/p95。
- 相关但不等价的限制：WebSocket 模式连接上限 60 分钟；后台模式支持 2/8 小时完成窗口。这些都不是「请求超时下限」。
- 结论：**「60 秒不够」无法用官方文档证实**，只能由实测决定。

## 未能核实 / not verifiable

1. `max_tokens` 在当前 GPT-5.x / GPT-6.x 上的逐字 400 文本（官方文档检索不到；旧笔记引用的 "Use 'max_completion_tokens' instead" 不在现文档中）。
2. 当前 GPT-5.x / GPT-6.x 是否**拒绝** `max_tokens`——文档只写「与 o-series 不兼容」。
3. `temperature` / `top_p` 被拒时的逐字错误文本（只写 "will raise an error" / "does not support custom values"）。
4. 是否有任何模型拒绝 `max_completion_tokens`（文档只列 Predicted Outputs 不兼容）。
5. GPT-5.6 家族的 `temperature` / `top_p` 兼容规则（其指南与模型页未提）。
6. Chat Completions `max_completion_tokens` 的 minimum / maximum（参考未给）。
7. GPT-6.2 的默认 reasoning effort 是否被单独定义（只知参数默认 medium）。
8. 某个账号 `/v1/models` 的实际返回集合，以及 `gpt-oss-*`、`tts-1`、`whisper-1` 等是否仍在该集合中。
9. 推理模型的典型/最坏延迟秒数，以及任何官方超时建议。
10. `gpt-rosalind-research` 的端点支持（无独立模型页）。

## 对本插件的影响（事实层，不含取舍）

- 请求体字段 `max_tokens`：官方已标 deprecated；含推理 token 的输出预算只有 `max_completion_tokens` 有定义。若目标模型是当前 GPT-5.x / GPT-6.x，应发 `max_completion_tokens`；`max_tokens` 对它们的实际行为无官方保证。
- 请求体字段 `temperature`：固定发 0.7 且不发 `reasoning_effort` 时，请求落在默认 effort = medium，因此对 GPT-6.2（总是）、GPT-6 Astra / 6.1 Sol（无 none）、GPT-5.2 / 5.4（非 none 即报错）都不合法；只有在显式 `reasoning_effort: "none"` 的 GPT-6.1 Terra / GPT-6 Sol / GPT-6 Luna / GPT-5.x 上才合法。
- 请求体字段 `top_p`：与 `temperature` 同规则；插件当前不发，无需处理。
- 全局 `maxTokens=8192`：低于官方 25,000 的起步建议，存在 `finish_reason: "length"` / `status: incomplete` 且无可见正文的文档化风险。
- 全局 `timeoutSeconds=60`：官方无任何秒数依据，无法用文档判断是否偏小；默认为 medium effort 的推理模型在定性上比 `none/low` 慢。
- 模型列表：`/v1/models` 不能区分 chat 与非 chat；可用字段只有 `id` 与 `shutdown_date`（后者可用于隐藏即将关停的条目）。官方能力真相只在每模型文档页的 Endpoints 表。
- 端点选择：GPT-6.2 纯文本可用 `chat/completions`；一旦预设面向 `*-pro` 或 `gpt-oss-*`，必须改走 `v1/responses`（请求体与解析都不同）。
- 关闭思考：仅 `reasoning_effort: "none"` 是文档化开关；对 GPT-6 Astra / 6.1 Sol / 6.2 发 `none` 会 400。

## 来源

- List models（字段与示例）— https://developers.openai.com/api/reference/resources/models/methods/list
- Retrieve model — https://developers.openai.com/api/reference/resources/models/methods/retrieve
- Models 参考索引 — https://developers.openai.com/api/reference/resources/models
- 模型目录 — https://developers.openai.com/api/docs/models
- 全部模型 — https://developers.openai.com/api/docs/models/all
- Chat Completions create（`max_tokens` / `max_completion_tokens` / `reasoning_effort` / `temperature` / `top_p`）— https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- Responses create（`max_output_tokens` minimum 16、`reasoning.effort`）— https://developers.openai.com/api/reference/resources/responses/methods/create
- Reasoning models（25,000 预留、effort 表、`none` 400）— https://developers.openai.com/api/docs/guides/reasoning
- Migrate to the Responses API — https://developers.openai.com/api/docs/guides/migrate-to-responses
- Using GPT-6.2 — https://developers.openai.com/api/docs/guides/latest-model/gpt-6.2-astra
- Using GPT-6（温度省略条件、`none` 支持矩阵）— https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra
- GPT-5.6 升级指南（默认 medium、`none`）— https://developers.openai.com/api/docs/guides/upgrading-to-gpt-5p6-sol
- GPT-5.4 参数兼容（温度仅 `none` 合法）— https://developers.openai.com/api/docs/guides/latest-model/gpt-5.4
- 模型页（Endpoints 表、128K max output）：GPT-6.2 Astra https://developers.openai.com/api/docs/models/gpt-6.2-astra；GPT-6.1 Terra https://developers.openai.com/api/docs/models/gpt-6.1-terra；GPT-6 Luna https://developers.openai.com/api/docs/models/gpt-6-luna；`gpt-oss-120b` https://developers.openai.com/api/docs/models/gpt-oss-120b；`gpt-image-2.6-sunburst` https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst；`omni-moderation-latest` https://developers.openai.com/api/docs/models/omni-moderation-latest
- API changelog（GPT-6 / 6.2 发布、温度声明）— https://developers.openai.com/api/docs/changelog
- Deprecations（TTS / Whisper 关停日期、无 Chat Completions 关停条目）— https://developers.openai.com/api/docs/deprecations
- Latency optimization（无秒数基线）— https://developers.openai.com/api/docs/guides/latency-optimization
- 延迟与 token 的一般说明 — https://developers.openai.com/api/docs/guides/production-best-practices
