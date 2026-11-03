# OpenAI 与 Anthropic（Claude）接入配置调研

_调研日期：2026-10-24。上游版本锚点：Claude API `anthropic-version: 2026-10-21`；OpenAI API `v1`（Chat Completions 仍受支持，官方主推 Responses）。_

本文件回答一个问题：**若把 OpenAI 与 Claude 做成内置供应商预设，各自应该怎么配？现有客户端能不能直接跑？**

结论先行：两者的 base URL 与 Bearer 认证都能被现有客户端直接使用；**但现有请求体在两家最新模型上都会 400**——OpenAI 推理模型不接受 `max_tokens`、不接受非默认 `temperature`；Claude 在 `2026-10-21` 版本里直接移除了 `temperature`。因此「加预设」必然牵动请求方言（见文末）。

## 一、OpenAI

### 端点与认证

| 项目 | 值 |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| 认证 | `Authorization: Bearer <API key>` |
| 对话 | `POST /v1/chat/completions`（模型页 Endpoints 表标注 Supported） |
| 模型列表 | `GET /v1/models`，响应 `data[].id` |
| 额外头 | `OpenAI-Organization` / `OpenAI-Project` 仅多组织/旧版 key 需要，可省略；无版本头 |

### 与现有客户端的冲突

1. **`max_tokens` 不可用于推理模型。** 官方错误：`Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.` 现有客户端固定发 `max_tokens`。
2. **推理模型不接受非默认温度。** GPT-6 迁移文档写明：reasoning effort 不是 `none` 时，请求里要去掉 `temperature`、`top_p`；GPT-5 实测报 `Only the default (1) value is supported`。现有客户端固定发 `temperature: 0.7`（设置默认值）。
3. **推理 token 计入输出预算。** `max_completion_tokens` 同时限制推理 token 与可见输出；官方建议至少预留 25,000 token，否则可能只产出推理、无可见正文（插件此时会报「空回复」）。现有全局默认是 8192。
4. **`/v1/models` 混入大量非对话模型。** 列表含 `text-embedding-*`、`tts-1`、`whisper-1`、`gpt-image-*`、`gpt-realtime-*`、`omni-moderation-*` 等。直接展示会让「当前模型」下拉里大半是不可用项。
5. **超时。** 默认 effort 为 `medium` 的推理模型明显更慢；现有全局超时 60 秒可能不够。

### 当前在售模型（2026-10，摘自官方模型目录）

- 旗舰：`gpt-6-astra`
- 均衡：`gpt-6.1-sol`、`gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna`
- 上一代：`gpt-5.5`、`gpt-5.5-pro`、`gpt-5.4`、`gpt-4.1`
- 注意：`gpt-5.6` 起部分模型只支持 Responses API 的工具调用；纯文本一次性生成仍可用 Chat Completions。

## 二、Anthropic（Claude）

### 端点与认证

| 项目 | 值 |
| --- | --- |
| Base URL | `https://api.anthropic.com/v1` |
| 认证 | `Authorization: Bearer <API key>`（官方已把 Bearer 列为首选，`x-api-key` 为旧版兜底） |
| 版本头 | `anthropic-version: 2026-10-21`，**必需** |
| 对话（兼容层） | `POST /v1/chat/completions` |
| 对话（原生） | `POST /v1/messages` |
| 模型列表 | `GET /v1/models`，响应 `data[].id`，默认每页 20 条 |
| 特殊头 | `anthropic-workspace-id`：key 若未绑定 workspace（个人 / service account key）则必需，插件无法自动得知 |

### OpenAI SDK 兼容层（官方文档）

- 用 OpenAI SDK 时只需把 base URL 指到 `https://api.anthropic.com/v1/`，key 换成 Claude key，模型名换成 Claude 模型名。
- 支持字段：`max_tokens`、`max_completion_tokens`、`stream`、`top_p`、`temperature`、`stop`、`tools`、`functions`；`response_format`、`seed`、`logprobs`、`presence_penalty` 等被忽略。
- 行为差异：system / developer 消息会被提升并拼进顶层 `system`；`choices[]` 恒为 1 条；prompt caching、thinking 详情不可用。
- 官方定性：该兼容层「主要用来测试与比较模型能力，不算长期或生产级方案」，但承诺不做破坏性变更。

### 与现有客户端的冲突

1. **`temperature` 已被移除。** 版本 `2026-10-21` 的迁移说明：Messages API 的 `temperature`、`top_p`、`top_k` 参数被删除，请求带任一参数即 400（对所有模型生效）。兼容层文档仍写着「4.7 之后低于 1 会 400」（旧口径），但按版本说明，最稳妥的是**完全不发**。现有客户端固定发 `temperature: 0.7`。
2. **模型列表要版本头。** `/v1/models` 是原生端点，文档要求 `anthropic-version`；只带 Bearer 是否可用未在文档中保证。需要给该预设补一个固定请求头。
3. **workspace 头。** 未绑定 workspace 的 key 需要 `anthropic-workspace-id`，插件没有地方填。属于已知限制，需在文档里说明「请使用绑定到 workspace 的 key」。

## 三、对现有客户端的净影响

| 现有行为（`src/ai/client.ts` / `request.ts`） | OpenAI 最新模型 | Claude（2026-10-21） |
| --- | --- | --- |
| `Authorization: Bearer` | OK | OK |
| `temperature: 0.7` | 400（推理模型） | 400（参数已移除） |
| `max_tokens` | 400（推理模型） | OK |
| `GET /models` | OK，但列表噪声大 | 需要 `anthropic-version` |
| `stream: false` | OK | OK |

补充：插件走 Obsidian 的 `requestUrl`，官方文档明确「without any CORS restrictions」，因此两家的浏览器直连限制（CORS / 旧的 dangerous-direct-browser-access 头）都不适用。

## 四、可选方案（决策见议题）

- **请求方言**：在供应商上区分 `max_tokens` / `max_completion_tokens` 与「是否发送温度」。预设内置方言；自定义供应商可选，以支持代理地址。
- **Anthropic 接入**：兼容层（复用现有 `chat/completions` 与解析）或原生 Messages（多一套请求体与响应解析，但拿到官方「生产级」承诺）。
- **模型列表**：OpenAI 需要按 id 过滤；Anthropic 需要加版本头。
- **推理预算**：维持全局 8192 会踩「只推理、无正文」；需要在提示或默认值上给出办法。

## 来源

- OpenAI: Chat Completions overview — https://developers.openai.com/api/reference/chat-completions/overview
- OpenAI: Reasoning models（`max_completion_tokens`、温度、25k 预留）— https://developers.openai.com/api/docs/guides/reasoning
- OpenAI: Using GPT-6（迁移清单：移除 `temperature` / `top_p`）— https://developers.openai.com/api/docs/guides/latest-model
- OpenAI: List models — https://platform.openai.com/docs/api-reference/models/list
- OpenAI: Models catalog（模型 ID 与 Endpoints 支持表）— https://developers.openai.com/api/docs/models
- Claude: OpenAI SDK compatibility — https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk
- Claude: API overview（认证头、`anthropic-version` 必需、workspace 头）— https://platform.claude.com/docs/en/api/overview
- Claude: Versions（`2026-10-21` 移除 `temperature` / `top_p` / `top_k`）— https://platform.claude.com/docs/en/api/versioning
- Claude: List Models（`GET /v1/models`、`anthropic-version`、分页 20）— https://platform.claude.com/docs/en/api/models/list
- Obsidian: `requestUrl`（无 CORS 限制）— https://docs.obsidian.md/Reference/TypeScript+API/requestUrl
