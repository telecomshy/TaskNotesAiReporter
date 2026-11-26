# OpenAI Responses API 调研（`/v1/responses` 报文体核对）

_调研日期：2026-11-26。上游锚点：OpenAI API `v1`，Responses create 参考与「Migrate to the Responses API」指南当日线上版本。本文只记录官方文档可核实的事实，不替代 #110 的产品决策。_

## 摘要

- Responses 是**另一个端点**（`POST /v1/responses`），请求体与响应体都与 Chat Completions 不同：`input` 取代 `messages`，`max_output_tokens` 取代 `max_completion_tokens`，正文在 `output[]` 而不是 `choices[0]`。
- 纯文本消息数组在两边**可直接互用**：官方迁移指南明确「text-only message inputs are compatible from one API to the other」，`system` 角色可留在 `input` 数组里。
- `store` **默认 `true`**（响应默认被保存）；要无状态必须显式 `store: false`。Chat Completions 默认也会保存（新账号）。
- 正文读取：`output[]` 里 `type: "message"` 的 `content[]` 中 `type: "output_text"` 的 `text`；`output_text` 是 SDK 的便捷聚合，原始 JSON 里正文只在 `output[]`。
- 推理段读面：`output[]` 里的 `type: "reasoning"` 条目，或 `usage.output_tokens_details.reasoning_tokens > 0`。
- 截断：`status: "incomplete"` + `incomplete_details.reason: "max_output_tokens"`；可能**没有任何可见正文**（官方原文：可能发生在产出任何可见 token 之前）。
- `max_output_tokens` 的文档最小值是 **16**（无全局最大值）。
- 官方没有给出 `*-pro` / `gpt-oss-*` / `gpt-5.6-cyber` 逐族的温度规则与 `reasoning.effort: "none"` 支持情况。

## 1. 端点与请求体

`POST /v1/responses`。参考页（Create a model response）里与本插件相关、可核实的字段：

| 字段 | 类型 / 缺省 | 官方说明摘要 |
| --- | --- | --- |
| `model` | string（必填） | 模型 ID |
| `input` | string 或 input items 数组 | 字符串等价于 `role: "user"` 的一条文本输入；数组项可以是 `EasyInputMessage { role, content }`，`role` 取 `user` / `assistant` / `system` / `developer` |
| `instructions` | optional string | 单轮的系统级指引（与 `input` 里的 `developer` 消息并列的两种写法） |
| `max_output_tokens` | optional integer，**minimum 16** | 含 reasoning tokens 的输出预算 |
| `reasoning` | optional object `{ effort }` | `effort` 取 `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`，缺省 `medium` |
| `temperature` | optional number，default 1 | 与 Chat Completions 同义（0–2） |
| `store` | optional boolean，**default `true`** | 是否保存响应；`false` 即无状态 |
| `stream` | optional boolean，default `false` | 本插件不用流式 |

- 迁移指南把 Chat Completions 的 `messages[]` 映射为 `input`（字符串或 items 数组），并明确纯文本消息数组可以**原样复用**（含 `system` 角色）。
- 迁移指南把「系统级规则」映射为 `input` 里的 `developer` 消息（长期规则）或顶层 `instructions`（单轮）。
- Responses **没有** `max_completion_tokens`、`max_tokens`、`messages` 这些字段。

## 2. 响应结构

原始响应对象（`object: "response"`）与本插件相关的字段：

| 字段 | 形态 | 说明 |
| --- | --- | --- |
| `status` | `"in_progress"` / `"completed"` / `"incomplete"` / … | 完成态判定 |
| `error` | object 或 null | 失败详情 |
| `incomplete_details` | `{ reason }` 或 null | `reason` 取 `max_output_tokens` / `max_messages` / `content_filter` / `steered` |
| `output` | items 数组 | `type: "message"`（正文）、`type: "reasoning"`（推理段）等 |
| `usage` | object | `input_tokens` / `output_tokens` / `total_tokens` / `output_tokens_details.reasoning_tokens` |

- 正文项：`{ type: "message", role: "assistant", content: [ { type: "output_text", text } ] }`。多个 message 项、多个 `output_text` 块都合法。
- 推理项：`{ type: "reasoning", summary: [ { type: "summary_text", text } ], content: [] }`。`summary` 可能为空数组（官方示例里就没有内容）。
- 截断时：`status: "incomplete"`、`incomplete_details.reason: "max_output_tokens"`，正文可能为空。

## 3. Chat Completions ↔ Responses 对照（官方迁移指南）

| Chat Completions | Responses |
| --- | --- |
| `POST /v1/chat/completions` | `POST /v1/responses` |
| `messages[]` | `input`（字符串或 items 数组） |
| `system` 消息 | `input` 里的 `developer` 消息，或顶层 `instructions` |
| `max_completion_tokens` | `max_output_tokens` |
| `reasoning_effort`（顶层） | `reasoning.effort`（嵌套） |
| `choices[0].message.content` | `output[]` 里 message 项的 `content[].text` |
| `finish_reason: "length"` | `status: "incomplete"` + `incomplete_details.reason` |
| `usage.completion_tokens_details.reasoning_tokens` | `usage.output_tokens_details.reasoning_tokens` |

- 官方在同一页给出响应样例：`output` 里先 `type: "reasoning"`、后 `type: "message"`。
- 工具调用 / 结构化输出 / 会话状态（`previous_response_id`、Conversations API）都在 Responses 里有独立形态，本插件本轮不涉及。

## 4. 端点可用性（哪些模型必须走 Responses）

事实锚点沿用 `docs/research/openai-official-preset.md` § 2.2 / § 6（2026-11-26 同日核对）：

- Chat Completions = Not supported：`gpt-5.5-pro`、`gpt-5.4-pro`、`gpt-5.2-pro`、`gpt-oss-120b`、`gpt-oss-20b`、`gpt-5.6-cyber`。
- `gpt-rosalind-research` 只有目录 ID，无独立模型页可核对端点。
- 当前 GPT-6 文本模型（`gpt-6.2-astra` / `gpt-6.2-sol` 等）两边都可用，纯文本无强制 Responses 的理由。

## 未能核实 / not verifiable

1. `*-pro` 各族的 `temperature` 规则（5.4 的「仅 effort=none 合法」是否同样适用于 `gpt-5.4-pro`，文档未单列）。
2. `*-pro` 与 `gpt-oss-*` 是否接受 `reasoning.effort: "none"`（文档未给端点级或族级声明；`*-pro` 只给出「推理模型」的泛称）。
3. `gpt-5.6-cyber` 的思考档位细节。
4. `gpt-rosalind-research` 的端点。
5. 某个账号 `/v1/responses` 对上述模型的实际可用性（无密钥，无法实测）。

## 对本插件的影响（事实层，不含取舍）

- 走 Responses 时：请求体必须换成 `input` / `max_output_tokens` / `reasoning.effort`；固定发 `messages` 或 `max_completion_tokens` 都是错字段。
- `store` 默认为 `true`：插件把任务数据发给上游，若不显式 `store: false`，响应会被上游保存——这属于隐私默认，需要产品显式决定。
- 正文不能读 `choices[0]`；必须遍历 `output[]` 的 message 项，且要处理「只推理、无正文」的 `incomplete` 态。
- 推理段读面与 Chat Completions 不同源（`output[]` 的 reasoning 项 + `usage.output_tokens_details.reasoning_tokens`），假关判定与思考测试都要按协议分开读。
- 清单过滤沿用同一批排除名单：这批模型一旦支持，就要从排除表里放回，并同时给它们一条协议路由。

## 来源

- Create a model response（`input` / `instructions` / `max_output_tokens` / `reasoning` / `store` / `stream` / `temperature`；响应对象 `status` / `incomplete_details` / `output` / `usage`）— https://developers.openai.com/api/reference/resources/responses/methods/create
- Migrate to the Responses API（端点、messages→input、max_completion_tokens→max_output_tokens、reasoning_effort→reasoning.effort、响应样例、`store` 缺省）— https://developers.openai.com/api/docs/guides/migrate-to-responses
- 端点可用性 — 见 `docs/research/openai-official-preset.md` § 2.2 / § 6 与其所列模型页
