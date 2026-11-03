# 关闭 / 控制「思考（reasoning）」的 API 参数调研

> 取证日期：**2026-11-03**。所有结论均来自各厂商官方 API 文档（primary source），每条给出 URL 与文档自身的版本/更新日期。
> 目标：为「OpenAI-compatible `/chat/completions`」插件设计一个可用的「思考开关」参数映射。
>
> 结论先行：**不存在跨厂商统一的开关**。参数名分成三族（`thinking` 对象 / `enable_thinking` 布尔 / `reasoning_effort` 字符串），
> 而且**同一个参数名在不同厂商、甚至同一厂商不同模型上语义不同**；聚合平台（SiliconFlow）只做到「参数名大致统一」，**能力仍然逐模型不同**。

---

## 0. 取证方法与版本锚点

| 厂商 | 读的页面 | 文档版本 / 更新日期 |
| --- | --- | --- |
| DeepSeek | <https://api-docs.deepseek.com/api/create-chat-completion>、<https://api-docs.deepseek.com/guides/thinking_mode>、<https://api-docs.deepseek.com/api/create-response>、<https://api-docs.deepseek.com/quick_start/pricing>、<https://api-docs.deepseek.com/updates> | 页面无 `last-modified`；更新日志最新条目 **2026-10-17**（DeepSeek-V4.1-Flash-1017），模型版本 `DeepSeek-V4.1-Flash-1017` / `DeepSeek-V4-Pro-0813` |
| 阿里云百炼 DashScope | <https://help.aliyun.com/zh/model-studio/deep-thinking>、<https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions> | `last-modified` = **2026-10-29**（deep-thinking）/ **2026-10-26**（OpenAI 兼容-Chat） |
| Moonshot / Kimi | <https://platform.kimi.com/docs/api/chat>、<https://platform.kimi.com/docs/guide/use-thinking-models>、<https://platform.kimi.com/docs/api/models-overview>、<https://platform.kimi.com/docs/models> | `.md` 端点不暴露日期；抓取日 2026-11-03。模型页明确记录了 `kimi-latest`（2026-01-28 下线）与 `moonshot-v1` 全系（2026-08-31 下线） |
| MiniMax | <https://platform.minimaxi.com/docs/api-reference/text-chat-openai>、<https://platform.minimaxi.com/docs/faq/models> | 抓取日 2026-11-03；可用语言模型仅 `MiniMax-M3.1-Flash`、`MiniMax-M3` |
| 硅基流动 SiliconFlow | <https://docs.siliconflow.cn/docs/api/chat-completions-post>、<https://docs.siliconflow.cn/docs/userguide/capabilities/reasoning>、<https://docs.siliconflow.cn/docs/release-notes/overview> | 抓取日 2026-11-03；release notes 最新条目 **2026-10-21** |
| OpenAI | <https://platform.openai.com/docs/api-reference/chat/create>、<https://platform.openai.com/docs/guides/reasoning> | 抓取日 2026-11-03（官方文档随模型滚动更新，无独立版本号） |

**术语澄清**：下文 `reasoning_content` 是响应字段（思维链正文），**不是**请求参数；`usage.completion_tokens_details.reasoning_tokens` 是计费/校验用的思考 token 数。

---

## 1. DeepSeek（`https://api.deepseek.com`）

### 1.1 参数

官方 Chat Completions 参考页明确写了两个开关，二者都合法：

| 参数 | 类型 / 取值 | 说明 |
| --- | --- | --- |
| `thinking` | object，`{"type": "enabled" \| "disabled"}`，`type` 必填 | **显式开关**。省略或 `null` 时跟随 `reasoning_effort`；一旦提供，`type` **优先于** `reasoning_effort` 决定模式 |
| `reasoning_effort` | string：`none` / `low` / `high` / `max` | **开关 + 强度**二合一。`none` 关闭思考；`low`/`high`/`max` 开启。默认 `high` |

兼容映射（官方原文）：

- `minimal` → `low`
- `medium` → `high`
- `xhigh` → `high`
- `ultra` → `max`（仅出现在「思考强度控制」映射表，不在 `reasoning_effort` 的 `Possible values` 列表里；按兼容别名处理）

来源：<https://api-docs.deepseek.com/api/create-chat-completion>（`thinking`、`reasoning_effort` 字段说明）。

### 1.2 默认行为（按模型）

`Models & Pricing` 页对 `deepseek-flash` 与 `deepseek-v4-pro` 的 `THINKING MODE` 一栏写的是同一句：
**"Supports both non-thinking and thinking (default) modes"** —— 即**两个模型都默认开启思考**，默认 effort = `high`。

`thinking_mode` 指南再次确认：「思考模式默认打开，且 effort 默认为 `high`」。

来源：<https://api-docs.deepseek.com/quick_start/pricing>、<https://api-docs.deepseek.com/guides/thinking_mode>。

> 历史语境：`deepseek-chat` / `deepseek-reasoner` **不是**两个不同模型，而是同一代模型的「非思考 / 思考」两个入口；
> 这两个名字在 2026-04-24 起指向 `deepseek-v4-flash` 的两种模式，并计划于 **2026-07-24 停用**。
> 也就是说：**「用模型名切换思考」是上一代做法**，当前 `deepseek-flash` / `deepseek-v4-pro` 用参数切换。
> 来源：<https://api-docs.deepseek.com/updates>（Date: 2026-04-24、2025-12-01 条目）。

### 1.3 逐模型还是统一？

**统一**。两个在售模型（`deepseek-flash`、`deepseek-v4-pro`）共用同一套 `thinking` / `reasoning_effort` 语义与默认值。
差异只出现在采样参数（`top_p` 在非思考模式下 `deepseek-flash` 恒为 1.0，而 `deepseek-v4-pro` 生效），与开关无关。

### 1.4 未知参数的行为（重要）

DeepSeek 文档**没有**承诺「未知字段返回 400」。相反，它明确示范了「静默忽略」的兼容策略：

- `temperature` / `presence_penalty` / `frequency_penalty` 在思考模式下「设置参数不会报错，但也不会生效」；
- `frequency_penalty` / `presence_penalty` 已标记 deprecated：「It will not take effect if you pass it to the API」。

因此「发错别名 → HTTP 200 → 照常思考、照常计费」是 DeepSeek 的合理预期行为（与本地实测一致，见 §7）。

会真正返回 400 的是**语义冲突**，例如思考模式下 `tool_choice: "required"` 或指定具体工具（官方原文：「`required` and named tool choices are not supported in thinking mode; the API returns a `400` error」）。

### 1.5 其他 API 形态（避免混淆）

- **Responses API**：开关在 `reasoning.effort`，取值 `none/low/high/max`，`none` 关闭；**没有** `reasoning.enabled` 这种字段。
- **Anthropic 格式**：用 Anthropic 自己的 `thinking` / `output_config.effort` 语义。

来源：<https://api-docs.deepseek.com/api/create-response>、<https://api-docs.deepseek.com/guides/thinking_mode>（三栏对照表）。

---

## 2. 阿里云百炼 / DashScope compatible-mode

### 2.1 参数

百炼的「深度思考」文档把模型分成两类：**混合思考模式**（可开可关）与**仅思考模式**（关不掉）。混合模式的开关参数**因模型而异**：

| 参数 | 类型 / 取值 | 适用 |
| --- | --- | --- |
| `enable_thinking` | boolean，`true` / `false` | Qwen3.8 / 3.7 / 3.6 / 3.5 / Qwen3 系列、Qwen3-VL、Qwen3.8-Omni-Flash，以及百炼上的 DeepSeek-V4 / V3.2 / V3.1、Kimi-K2.6/K2.5、GLM 系列 |
| `thinking` | object，`{"type": "adaptive" \| "disabled"}`，默认 `{"type":"adaptive"}` | **仅稀宇科技直供的 MiniMax**（`MiniMax/MiniMax-M3.1-Flash`、`MiniMax/MiniMax-M3`） |
| `thinking_budget` | integer，思考过程最大 token 数 | Qwen3.8、Qwen3.7/3.6/3.5、Qwen3-VL、Qwen3、GLM（阿里云直供）、Kimi（阿里云直供）；`kimi-k3` 不支持 |
| `reasoning_effort` | string，取值随模型 | MiniMax-M3.1-Flash（`low…max`，默认 `max`）、DeepSeek-V4/GLM（`high`/`max`，默认 `high`）、glm-5.3 系列与 kimi-k3（`low`/`high`/`max`，默认 `max`）、deepseek-v4-flash-0731 / v4-pro-0813（`low`/`high`/`max`，默认 `high`）、qwen3.8-omni-flash（`none…max`，默认 `xhigh`） |
| `preserve_thinking` | boolean，默认 `false` | 是否把历史 assistant 的 `reasoning_content` 拼回上下文（不影响本轮是否思考） |

来源：<https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions>（`enable_thinking` / `thinking` / `thinking_budget` / `reasoning_effort` / `preserve_thinking` 字段说明），<https://help.aliyun.com/zh/model-studio/deep-thinking>。

`enable_thinking` **不是** OpenAI 标准参数：Python SDK 走 `extra_body`，Node SDK 放顶层，HTTP 直接放 body 顶层。

### 2.2 默认行为（按模型，官方逐条列出）

**默认开启思考**（混合模式）：

- Qwen3.8 全系：`qwen3.8-max` / `qwen3.8-max-0902` / `qwen3.8-flash` / `qwen3.8-27b` / `qwen3.8-omni-flash`
- Qwen3.7 全系（`qwen3.7-max`、`qwen3.7-plus`、`qwen3.7-flash` 及快照）
- Qwen3.6 全系（`qwen3.6-plus`、`qwen3.6-flash`）
- Qwen3.5 Plus / Flash 及开源版
- 百炼部署的 `kimi-k3.1-pro`、`kimi-k3`、`kimi-k2.7-code`、`kimi-k2.6`（其中 k2.6/k2.5 在百炼部署下**默认关闭**，见下条）
- 百炼直供的 `deepseek-v4.1-flash`、`deepseek-v4-pro`
- GLM `glm-5.2` / `glm-5.2-fast-preview` / `glm-5.1` / `glm-5`
- `antdigital/Ling-3.1-flash`

**默认不开启思考**：

- Qwen3 Plus：`qwen-plus`、`qwen-plus-latest`、`qwen-plus-2025-04-28` 及之后的快照
- Qwen3 Flash：`qwen-flash`、`qwen-flash-2025-07-28` 及之后的快照
- 百炼部署的 `kimi-k2.6`、`kimi-k2.5`
- 硅基流动直供的 `siliconflow/deepseek-v3.2`、`siliconflow/deepseek-v3.1-terminus`
- 快手万擎直供的 `vanchin/deepseek-v3.2-think`、`vanchin/deepseek-v3.1-terminus`

**仅思考模式（关不掉）**：`qwen3.8-2.4t-a95b`、`qwen3.7-max-preview`、`qwen3.7-max-2026-05-17`、`glm-5.3`、`MiniMax-M2.5`（百炼部署）、`MiniMax/MiniMax-M3.1-Flash`（稀宇直供）、`MiniMax/MiniMax-M2.7/M2.5/M2.1`、`kimi-k3.1-pro`、`kimi-k3`、`kimi-k2.7-code`、`deepseek-r1` 蒸馏模型、Stepfun / Ling 的指定型号。

来源：<https://help.aliyun.com/zh/model-studio/deep-thinking>（「支持的模型」小节，逐条标注默认开/默认关/仅思考）。

### 2.3 关于 `qwen-max` / `qwen-plus` / `qwen-turbo` / `qwen-long`

任务里给的这一组是**旧命名**。当前文档的支持清单里：

- `qwen-plus` / `qwen-plus-latest` **在列**（属 Qwen3 Plus 系列，默认不思考，可 `enable_thinking`）；
- `qwen-flash` / `qwen-flash-latest` 同理；
- `qwen-max`、`qwen-turbo`、`qwen-long` **没有出现在深度思考支持清单中**，当前主推的 Max 档叫 `qwen3.8-max`。
  按文档口径，这三者**没有**可用的 `enable_thinking` 开关；是否仍作为兼容别名存在，官方文档未承诺（模型广场才是权威列表）。

来源：同上 + <https://help.aliyun.com/zh/model-studio/models>（「选择模型」页，当前展示 `qwen3.8-max` / `qwen3.7-plus` / `qwen3.8-flash`）。

### 2.4 逐模型还是统一？

**强逐模型**，而且是本文所有厂商里差异最大的：

1. 开关参数名不同：Qwen 系用 `enable_thinking`，稀宇直供 MiniMax 用 `thinking`。
2. 默认值不同：同为 Qwen，`qwen3.8-*` 默认开，`qwen-plus` / `qwen-flash` 默认关。
3. 有的模型根本关不掉（「仅思考模式」）。
4. `reasoning_effort` 的合法取值与默认值逐模型不同（见 2.1 表）。
5. `qwen3.8-max` / `qwen3.8-max-0902` / `qwen3.8-flash` / `qwen3.8-2.4t-a95b` / `qwen3.8-27b`：**`reasoning_effort` 与 `thinking_budget` 不允许同时设置，同时设置会报错**；两者可互转（`low`↔4096、`medium`↔16384、`xhigh`↔262144）。

### 2.5 未知参数 / 非法值的行为

- **非法取值会报错**：`reasoning_effort` 一节明确「设置上述可选值及映射值以外的值将会报错」。
- **关不掉的模型强行关会报错**：`glm-5.3` 系列「`enable_thinking` 仅支持 `true`，传入 `false` 会导致 API 请求失败」；`MiniMax/MiniMax-M3.1-Flash` 设置 `thinking.type = disabled` 返回 **400**。
- **未知字段名**（例如给 Qwen 发 `thinking`、给 M3.1-Flash 发 `enable_thinking`）文档未规定；文档只说明了「非 OpenAI 标准参数」怎么传，没有承诺严格校验。**不要假设会 400**。

---

## 3. Moonshot / Kimi（`https://api.moonshot.cn`）

### 3.1 参数（按代际分裂）

Kimi 的开关**按模型代际完全不同**，官方甚至专门写了一张「请求字段 × 模型」对照表：

| 模型 | 关闭思考 | 调节强度 | 备注 |
| --- | --- | --- | --- |
| `kimi-k3.1-pro` / `kimi-k3.1-pro-highspeed` / `kimi-k3` | **不能关** | `reasoning_effort`: `low` / `high` / `max`，默认 `max` | 始终思考 + Preserved Thinking 始终开；**不支持 `thinking` 参数** |
| `kimi-k2.7-code` / `-highspeed` | **不能关** | 不支持 | `thinking.type` 只接受 `"enabled"`，传 `"disabled"` **报错**；`thinking.keep` 只接受 `"all"` |
| `kimi-k2.6` | `thinking: {"type": "disabled"}` | 不支持 | 默认 `{"type":"enabled"}`；`thinking.keep` 默认 `null`，可设 `"all"` |

来源：<https://platform.kimi.com/docs/api/models-overview>、<https://platform.kimi.com/docs/guide/use-thinking-models>、<https://platform.kimi.com/docs/api/chat>（OpenAPI schema 里 `KimiK26ChatRequest` / `KimiK27CodeChatRequest` / `KimiK3ChatRequestBase` 分别定义）。

### 3.2 默认行为

- K3 系列：始终思考，默认 `max`。
- `kimi-k2.7-code`：始终思考。
- `kimi-k2.6`：**默认思考**（`{"type":"enabled"}`），可关。

### 3.3 关于 `kimi-latest` / `moonshot-v1-*`

**都已下线，不应再作为映射目标**：

- `kimi-latest`：**2026-01-28 下线**
- `moonshot-v1` 全系（含 `moonshot-v1-auto`、`-vision-preview`）：**2026-08-31 下线**
- `kimi-k2` 系列：2026-05-25 下线；`kimi-k2.5`：2026-08-31 下线；`kimi-k2` 系列计划 2026-12 月底全量下线

来源：<https://platform.kimi.com/docs/models>。

### 3.4 逐模型还是统一？

**强逐模型**，且同一参数在不同代际上「能不能关」相反：
K3 用 `reasoning_effort` 且**没有**关闭档；K2.6 用 `thinking.type=disabled`；K2.7 两者都不给关。

### 3.5 未知参数 / 非法值的行为

Kimi 是本文里**校验最严格**的一家，文档多处明写「报错」：

- `kimi-k2.7-code` 传 `thinking.type = "disabled"` → 报错；
- `thinking.keep` 传 `"all"` 以外的值 → 报错；
- `temperature` / `top_p` / `n` / penalty 在 K3、K2.7 上是「固定值」，「传入其他值会报错」；
- `tool_choice: "required"` 在 K2.6 / K2.7 上 → 报错。

但「完全未知的顶层字段」是否 400，文档没有正面说明；只能确认**已知字段的非法取值**会硬失败。

---

## 4. MiniMax（`https://api.minimax.chat` / `https://api.minimax.cn`）

### 4.1 参数

官方 OpenAI 兼容「对话补全」页的 schema：

| 参数 | 类型 / 取值 | 说明 |
| --- | --- | --- |
| `thinking` | object，`{"type": "adaptive" \| "disabled"}`，默认 `adaptive` | `adaptive` = 开启自适应思考；`disabled` = 关闭（**仅 M3 支持**） |
| `reasoning_effort` | string：`low` / `medium` / `high` / `xhigh` / `max` | **仅 `MiniMax-M3.1-Flash` 真正支持**，默认 `max`；其他模型忽略该字段 |
| `reasoning_split` | boolean | 只控制思考内容放 `reasoning_content` 还是 `<think>` 标签，**不开关思考** |

### 4.2 默认行为（逐模型）

- `MiniMax-M3.1-Flash`：思考**强制开启**，传 `thinking.type = "disabled"` → **HTTP 400**；传 `reasoning_effort: "none"` 也 → **HTTP 400**。
- `MiniMax-M3`：默认 `adaptive` 思考；可 `thinking.type = "disabled"` 跳过思考直接回答。
- 已下线的 M2.x：思考无法关闭，「传入 `disabled` 会被接收但不生效」（官方原文，属历史兼容行为）。

来源：<https://platform.minimaxi.com/docs/api-reference/text-chat-openai>（`ChatCompletionReq.thinking` / `reasoning_effort` 的 `description`）。

### 4.3 关于 `abab6.5s-chat` / `MiniMax-Text-01`

**都已不在可用模型列表**。官方模型页「可用模型 → 语言模型」只有 `MiniMax-M3.1-Flash` 和 `MiniMax-M3`；
历史模型表里也没有 `abab6.5s-chat` / `MiniMax-Text-01`（它们早于该表维护范围）。
结论：这两个型号**没有**当前的 `thinking` / `reasoning_effort` 文档可依，不应作为映射目标。

来源：<https://platform.minimaxi.com/docs/faq/models>。

### 4.4 逐模型还是统一？

**强逐模型**：同名 `thinking.type=disabled` 在 M3 上生效、在 M3.1-Flash 上 400、在 M2.x 上被静默忽略（三种行为）。
`reasoning_effort` 也只对一个模型有真实效果。

### 4.5 未知参数 / 非法值的行为

- `thinking.type = disabled` 对 M3.1-Flash → **400**；
- `reasoning_effort: "none"` 对 M3.1-Flash → **400**；
- `temperature` / `top_p`：官方明确「暂不支持指定，传入的值不会生效」（静默忽略，M3 系固定 1 / 0.95）；
- 完全未知字段：文档未规定。

---

## 5. 硅基流动 SiliconFlow（`https://api.siliconflow.cn/v1`）—— 关键问题

### 5.1 文档化的参数面

`POST /chat/completions` 的请求体只列了三个与思考相关的字段：

| 参数 | 类型 / 取值 | 文档原话（关键限定） |
| --- | --- | --- |
| `enable_thinking` | boolean | "Switches between thinking and non-thinking modes. **This field applies to most reasoning models**." |
| `thinking_budget` | integer，`128 ≤ value ≤ 32768` | "Maximum number of tokens for chain-of-thought output. **This field applies to most reasoning models**." |
| `reasoning_effort` | string，`"high" \| "max"` | "This field applies to **Pro/deepseek-ai/DeepSeek-V4, deepseek-ai/DeepSeek-V4-Flash, and Pro/zai-org/GLM-5.2**." |

`reasoning_effort` 的补充语义（官方原文）：思考模式下普通请求默认 `high`；某些复杂 agent 请求（如 Claude Code、OpenCode）自动设为 `max`；
为兼容起见 `low` / `medium` 映射为 `high`，`xhigh` 映射为 `max`。**没有 `none`**。

来源：<https://docs.siliconflow.cn/docs/api/chat-completions-post>。

### 5.2 是统一还是逐模型？——**参数名近似统一，能力严格逐模型**

这是本次调研最关键的结论，官方文档自己给了三处证据：

1. **`enable_thinking` / `thinking_budget` 的措辞是 "applies to most reasoning models"**，不是 "all"。
   哪算 "most"、哪些不算，文档不给静态清单，只让你去模型广场按 `Reasoning` 标签查：
   <https://cloud.siliconflow.cn/me/models?tags=Reasoning>（需登录，非稳定文档源）。
2. **`reasoning_effort` 明确点名只有 3 个模型**（`Pro/deepseek-ai/DeepSeek-V4`、`deepseek-ai/DeepSeek-V4-Flash`、`Pro/zai-org/GLM-5.2`）。
   注意 `Pro/` 前缀也算模型身份的一部分。
3. **`thinking_budget` 的语义逐模型不同**，官方 Reasoning 指南原文：
   「If the number of tokens generated during the 'thinking phase' reaches the `thinking_budget`, the **Qwen3 series** reasoning model, which natively supports this parameter, will forcibly stop the chain-of-thought reasoning. **Other reasoning models might continue to output the thinking content.**」
   —— 即同一个 `thinking_budget`，对 Qwen3 是硬截断，对其他模型可能只是建议值。

来源：<https://docs.siliconflow.cn/docs/userguide/capabilities/reasoning>。

### 5.3 是否透传上游参数？

**官方文档没有承诺任何「任意上游参数透传」。** 文档描述的是平台自己的一套归一化字段
（`enable_thinking` / `thinking_budget` / `reasoning_effort`），并逐字段声明适用范围；
没有出现 "pass-through"、"passthrough"、厂商原生字段（如 Qwen 的 `enable_thinking` 之外的 `thinking`、Kimi 的 `thinking.keep`）的说明。

因此对插件的正确理解是：**SiliconFlow 是一个「有自己参数子集」的网关，不是透明代理**。
你在 Kimi 官方能用的 `thinking:{type:...,keep:...}`、在 MiniMax 官方能用的 `thinking.type=adaptive`，
在 SiliconFlow 上都**没有文档依据**。

### 5.4 默认行为

API 参考**没有给** `enable_thinking` 的默认值。文档只在 Reasoning 指南的示例里显式传 `true`：

```python
extra_body={"enable_thinking": True, "thinking_budget": 1024}
```

含义：**默认值取决于模型/上游，插件必须显式传值**，不能依赖平台默认。

### 5.5 未知参数 / 非法值的行为

- 不支持的**字段**：文档未规定（"applies to most reasoning models" 的措辞暗示会被忽略，但无明文）。
- 不支持的**取值**：`reasoning_effort` 只列 `high` / `max`；`none` 不在枚举内，行为未文档化（不要依赖）。
- 可确认的相邻事实：平台会静默忽略某些参数，例如 2026-09-15 起 `repetition_penalty` 被忽略并按固定值 1 处理
  （<https://docs.siliconflow.cn/docs/release-notes/overview>，2026-09-09 条目）。

---

## 6. OpenAI 的标准位（作为「OpenAI-compatible」的参照）

| API | 参数 | 取值 | 默认 |
| --- | --- | --- | --- |
| Chat Completions | `reasoning_effort` | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` | `medium` |
| Responses | `reasoning.effort` | 同上（逐模型子集） | 逐模型（GPT-5.6 / GPT-6 系默认 `medium`） |
| Responses | `reasoning.mode` | `standard` / `pro` | `standard` |
| Responses | `reasoning.summary` | 如 `auto` / `concise` / `detailed` | 不返回摘要 |
| Responses | `reasoning.context` | `auto` / `current_turn` / `all_turns` | 逐模型 |

关键限定（官方原文）：

- "Not all reasoning models support every value." / "Supported values are model-dependent"。
- **`reasoning` 对象是 Responses API 的字段**；Chat Completions 只有顶层 `reasoning_effort`。
- 有的模型**不支持 `none`**：`gpt-6-astra` 传 `none` 返回 **HTTP 400**；`gpt-6.1-sol` 不支持 `none` 与 `minimal`，默认 `medium`。
- 默认值也逐模型，不是全局常量。

来源：<https://platform.openai.com/docs/api-reference/chat/create>、<https://platform.openai.com/docs/guides/reasoning>。

---

## 7. 与本地实测（DeepSeek 直连，2026-11-03，`deepseek-flash`，约 15k 输入）的对照

| 发送的请求 | 实测结果 | 与文档是否一致 | 解释 |
| --- | --- | --- | --- |
| `reasoning_effort: "none"` | 无 reasoning 段，~3.6s | ✅ 一致 | 官方枚举包含 `none`，且明写 "`none` disables thinking mode" |
| `thinking: {"type": "disabled"}` | 无 reasoning 段，~3.3s | ✅ 一致 | 官方文档化的显式开关；且优先于 `reasoning_effort` |
| `enable_thinking: false` | 被忽略，仍约 3.8k reasoning tokens | ✅ 一致（但**不是**「文档说会忽略」） | `enable_thinking` **从来不是 DeepSeek 的参数**（它是 Qwen/DashScope/SiliconFlow 的字段）。DeepSeek 对未知字段不报错，所以静默照常思考 |
| `reasoning: {"enabled": false}` | 被忽略 | ✅ 一致 | `reasoning` 是 **Responses API** 的字段，且其关闭方式是 `reasoning.effort: "none"`，**不存在** `reasoning.enabled`。在 `/chat/completions` 上整个对象都是未知字段 |

### 「到底哪个才是文档化的参数？」

两个都是，但职责不同：

- **要硬开关** → `thinking: {"type": "disabled"}`。它是显式开关，且官方写明**优先于** `reasoning_effort`；
  同时传两者也安全（官方示例就是 `reasoning_effort="high"` + `thinking={"type":"enabled"}` 一起发）。
- **要分档** → `reasoning_effort`（`none/low/high/max`）。`none` 兼顾关闭，但语义是「强度档位的最低档」，不是专用开关。
- **不要用** `enable_thinking` / `reasoning.enabled`：前者是别家字段，后者根本不存在。

### 文档行为 vs 实测行为：一致，但有一处「文档没说」

文档没有一句「未知字段会被忽略」。实测之所以「不报错但无效」，是因为 DeepSeek 的校验策略是宽松的兼容策略
（文档里对 deprecated 的 `frequency_penalty` / `presence_penalty` 明确写了 "will not take effect"）。
**这属于「文档未禁止 + 实测确认」的推断，不是明文承诺** —— 插件不应把「HTTP 200」当作「参数生效」的证据。

---

## 8. 对比总表

### 8.1 provider × param × 作用范围

| Provider | 参数 | 类型 / 取值 | 默认 | 逐模型 or 统一 | 不支持时 |
| --- | --- | --- | --- | --- | --- |
| **DeepSeek** | `thinking` | `{"type":"enabled"\|"disabled"}` | 省略→跟随 effort；effort 省略→开 | **统一**（两个在售模型同语义） | 未知字段静默忽略（实测 + 文档未禁止） |
| **DeepSeek** | `reasoning_effort` | `none/low/high/max`（+ `minimal/medium/xhigh/ultra` 兼容映射） | `high` | **统一** | 未知取值：文档未规定 |
| **DashScope** | `enable_thinking` | boolean | 逐模型：Qwen3.8/3.7/3.6/3.5 默认开；qwen-plus/flash 默认关 | **逐模型** | 关不掉的模型传 `false` 可能失败（glm-5.3 明示失败） |
| **DashScope** | `thinking` | `{"type":"adaptive"\|"disabled"}` | `adaptive` | **仅稀宇直供 MiniMax** | M3.1-Flash 传 `disabled` → **400** |
| **DashScope** | `thinking_budget` | integer | 逐模型（默认=模型最大 CoT 长度） | **逐模型**（qwen3.8 系与 `reasoning_effort` 互斥，同设报错） | 不支持的模型：未文档化 |
| **DashScope** | `reasoning_effort` | 逐模型（`high/max`；`low/high/max`；`low…max`；`none…max`） | 逐模型 | **逐模型** | 非法取值 → **报错** |
| **Kimi** | `thinking` | `{"type":"enabled"\|"disabled","keep":null\|"all"}` | K2.6 默认 `enabled` | **仅 K2.x**；K3 不支持该参数 | K2.7 传 `disabled` → **报错** |
| **Kimi** | `reasoning_effort` | `low/high/max` | `max` | **仅 K3 系列** | K2.x 不支持 |
| **MiniMax** | `thinking` | `{"type":"adaptive"\|"disabled"}` | `adaptive` | **逐模型**：M3 可关；M3.1-Flash 强制开；M2.x 忽略 `disabled` | M3.1-Flash → **400** |
| **MiniMax** | `reasoning_effort` | `low/medium/high/xhigh/max` | `max`（仅 M3.1-Flash 有效） | **仅 M3.1-Flash** | `none` → **400**；其他模型忽略 |
| **SiliconFlow** | `enable_thinking` | boolean | **未文档化** | **逐模型**（"most reasoning models"） | 未文档化（疑似静默忽略） |
| **SiliconFlow** | `thinking_budget` | `128…32768` | 未文档化 | **逐模型**；语义也不同（Qwen3 硬截断，其他可能继续思考） | 未文档化 |
| **SiliconFlow** | `reasoning_effort` | `high/max`（`low/medium`→`high`，`xhigh`→`max`） | 普通 `high`；agent 请求 `max` | **仅 3 个模型**（`Pro/deepseek-ai/DeepSeek-V4`、`deepseek-ai/DeepSeek-V4-Flash`、`Pro/zai-org/GLM-5.2`） | `none` 不在枚举内，未文档化 |
| **OpenAI** | `reasoning_effort`（Chat） | `none/minimal/low/medium/high/xhigh/max` | `medium` | **逐模型**（取值子集与默认值都不同） | 不支持的档位 → **400**（如 gpt-6-astra 的 `none`） |
| **OpenAI** | `reasoning.effort`（Responses） | 同上 | 逐模型 | **逐模型** | 同上 |

### 8.2 一句话记忆

- **DeepSeek**：`thinking` 管开关，`reasoning_effort` 管档位，两者都统一、都安全。
- **DashScope**：`enable_thinking` 是主开关，但「能不能关」和「默认开不开」逐模型；MiniMax 直供改用 `thinking`。
- **Kimi**：K3 只有 `reasoning_effort` 且**关不掉**；K2.6 才有 `thinking.type=disabled`；K2.7 也关不掉。
- **MiniMax**：M3 能关，M3.1-Flash 关不掉且强行关会 400。
- **SiliconFlow**：三个参数名齐了，但每个都只覆盖「一部分模型」，`thinking_budget` 连语义都不统一。
- **OpenAI**：只有 `reasoning_effort`；`reasoning` 是 Responses API 的，不要发到 Chat Completions。

---

## 9. 为插件设计参数映射的建议

### 9.1 先定义两种语义，不要混成一个布尔

1. **Hard off（真正不思考）** —— 用于「省时间/省钱」的开关。
2. **Effort（思考多深）** —— 用于 `low/medium/high/max` 的质量旋钮。

很多模型的 hard off 和 effort 最低档**不是一回事**：Kimi K3 / MiniMax M3.1-Flash / glm-5.3 根本没有 hard off，
最低只能到 `low` 或 `max`。UI 上应显示「该模型不支持关闭思考」，而不是假装关掉了。

### 9.2 映射按 `base_url` 分派，不要按模型名猜厂商

同一模型名会出现在多家网关上（`deepseek-v4-pro` 同时存在于 DeepSeek 直连、百炼、SiliconFlow），
而**同一模型的开关参数会随网关变化**（百炼上的 DeepSeek-V4 用 `enable_thinking`，DeepSeek 直连用 `thinking`）。

建议的 hard-off 优先级（每家只发一个，避免冲突）：

| 网关 | hard off 发什么 | 备注 |
| --- | --- | --- |
| `api.deepseek.com` | `thinking: {"type":"disabled"}`；可**同时**保留 `reasoning_effort` | `thinking` 优先，二者同发安全 |
| `*.maas.aliyuncs.com/compatible-mode` / `dashscope*.aliyuncs.com` | Qwen/Kimi/GLM/DeepSeek 系 → `enable_thinking: false`；稀宇直供 MiniMax → `thinking: {"type":"disabled"}` | **不要**同时发 `reasoning_effort` 与 `thinking_budget`（qwen3.8 系会报错） |
| `api.moonshot.cn` / `api.kimi.com` | K2.6 → `thinking: {"type":"disabled"}`；K3 / K2.7 → **无解**，只能 `reasoning_effort: "low"` 或直接提示不支持 | K2.7 传 `disabled` 会硬失败 |
| `api.minimax.chat` / `api.minimax.cn` | M3 → `thinking: {"type":"disabled"}`；M3.1-Flash → **无解**，只能 `reasoning_effort: "low"` | 强行关会 400 |
| `api.siliconflow.cn` | `enable_thinking: false` | **不要**用 `reasoning_effort: "none"` 代替（不在枚举内，且只覆盖 3 个模型） |
| `api.openai.com` | `reasoning_effort: "none"` | 先按模型白名单校验；`gpt-6-astra` 会 400 |

### 9.3 聚合平台（SiliconFlow）的三条硬规则

1. **能力表必须按「模型 ID 全串」存**，`Pro/` 前缀不能省：`Pro/deepseek-ai/DeepSeek-V4` 支持 `reasoning_effort`，
   而 `deepseek-ai/DeepSeek-V4-Flash` 也支持，但 `Pro/zai-org/GLM-5.2` 才是 GLM 里被点名的那个。
2. **不要假设透传**：Kimi 的 `thinking.keep`、MiniMax 的 `adaptive`、DashScope 的 `preserve_thinking`，
   在 SiliconFlow 上都无文档依据。插件只发 SiliconFlow 文档列出的三个字段。
3. **默认值不可依赖**：`enable_thinking` 的默认值文档没写。开关状态必须**显式**发送（开也发 `true`，关也发 `false`），
   否则「关掉思考」在默认开启的模型上会静默失效。

### 9.4 校验「是否真的关掉了」——不要看 HTTP 200

本次实测最有价值的教训：**错误的参数名会得到 200 + 正常思考 + 正常计费**。
插件应在响应侧做一次轻量校验，并把结果缓存成「(provider, model) → 已验证的开关参数」：

- 响应里是否出现 `choices[0].message.reasoning_content`（非流式）或 `delta.reasoning_content`（流式）；
- `usage.completion_tokens_details.reasoning_tokens` 是否为 0 / 缺失；
- 首 token 延迟是否从「思考档」的 ~20s 掉到 ~3.5s（仅作辅助信号，不作判据）。

校验失败时不要重试式地乱发多个别名（DeepSeek 会因为 `thinking` 优先而掩盖问题，百炼会因为互斥参数而 400）。

### 9.5 配置模型的最小字段集

建议每个模型条目存：

```jsonc
{
  "provider": "siliconflow",
  "base_url": "https://api.siliconflow.cn/v1",
  "model": "Pro/deepseek-ai/DeepSeek-V4",
  "thinking": {
    "off_param": { "enable_thinking": false },   // null 表示不支持关闭
    "effort_param": "reasoning_effort",          // null 表示不支持分档
    "effort_values": ["high", "max"],
    "default_state": "on",                        // 文档化的默认
    "verified_at": "2026-11-03",
    "verified_by": "reasoning_tokens==0"
  }
}
```

这样插件的 toggle 只需做一件事：**查表 → 发那一个参数 → 用响应校验**。
新增模型时只改表，不改代码路径。

### 9.6 还要注意的坑

- **互斥**：DashScope 的 `qwen3.8-max/flash` 上 `reasoning_effort` 与 `thinking_budget` 同时设置会报错；
  OpenAI SDK 用户记得非标准参数走 `extra_body`（Python）或顶层（Node）。
- **多轮上下文**：关掉思考后，历史里的 `reasoning_content` 是否回传，各家规则不同
  （DeepSeek 带 `tools` 时必须回传、否则不能回传；Kimi K3/K2.7 必须回传；DashScope 有 `preserve_thinking`）。
  插件切开关时不要顺手删历史字段，否则可能 400。
- **模型下线速度**：本文写到的 `kimi-latest`、`moonshot-v1`、`abab6.5s-chat`、`MiniMax-Text-01` 全部已下线；
  `kimi-k2` 系列也计划 2026-12 月底下线。能力表必须带 `verified_at`，并在启动时对未知模型降级为「不发思考参数 + UI 标注未知」。

---

## 10. 智谱 GLM（bigmodel.cn）

> 取证日期：**2026-11-03**。本节的 `dateModified` 取自页面 JSON-LD（Mintlify 自动生成）：
> 《深度思考》与《思考模式》均为 **2026-11-02**，《对话补全》API 参考为 **2026-11-02**。
> 官方站点有两个品牌域名：国内开放平台 `docs.bigmodel.cn` / `open.bigmodel.cn`（本节依据），国际站为 `z.ai`（未纳入本节结论）。

### 10.1 端点与鉴权

| 项 | 值 |
| --- | --- |
| Base URL（OpenAI SDK） | `https://open.bigmodel.cn/api/paas/v4/` |
| Chat Completions（HTTP） | `POST https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| 鉴权头 | `Authorization: Bearer <API_KEY>` |
| Content-Type | `application/json` |
| OpenAPI `servers` | `https://open.bigmodel.cn/api/`（路径再拼 `/paas/v4/chat/completions`） |

官方《OpenAI API 兼容》页给的迁移方式就是「只改两处」：`api_key` 换成智谱 Key、`base_url` 换成上面的地址；其余 OpenAI SDK 代码不变。

`thinking` **不是** OpenAI 标准参数，Python SDK 必须放 `extra_body`（官方示例：`extra_body={"thinking": {"type": "enabled"}}`）；HTTP 直连则与 `model`、`messages` 同级放请求体顶层（官方 cURL 示例即如此）。

来源：
- <https://docs.bigmodel.cn/cn/guide/develop/openai/introduction>（抓取日 2026-11-03）
- <https://docs.bigmodel.cn/api-reference/模型-api/对话补全>（API 参考，dateModified 2026-11-02）

### 10.2 当前模型清单（给预设下拉用）

API 参考的 `ChatCompletionTextRequest.model` 枚举是**权威的可用文本模型清单**（比市场页更可靠，因为它就是请求校验用的 schema）：

```text
glm-5.3, glm-5.2, glm-5.1, glm-5-turbo, glm-5,
glm-4.7, glm-4.7-flash, glm-4.7-flashx, glm-4.6,
glm-4.5-air, glm-4.5-airx, glm-4.5-flash,
glm-4-flash-250414, glm-4-flashx-250414
```

视觉/多模态走 `ChatCompletionVisionRequest`：

```text
glm-5.3-flash, glm-5.3-flashx, glm-5.3-flashx-legal,
glm-5v-turbo, glm-4.6v, glm-4.6v-flash, glm-4.6v-flashx,
glm-4v-flash, glm-4.1v-thinking-flash, glm-4.1v-thinking-flashx,
autoglm-phone
```

注意：**模型代码是小写**（`glm-5.3-flashx`），文档正文里的大写 `GLM-5.3-FLASH` 只是展示名；插件要存小写 code。

按「预设下拉」的推荐分组（定位来自《模型概览》）：

| 分组 | 模型 code | 定位 | 默认思考？ |
| --- | --- | --- | --- |
| 旗舰 | `glm-5.3` | 旗舰模型，1M 上下文 / 128K 输出 | **默认开，且不能关** |
| 多模态主力 | `glm-5.3-flash` / `glm-5.3-flashx` | 原生多模态，低成本；FlashX 约 200 tok/s | **默认开，且不能关** |
| 法律专向 | `glm-5.3-flashx-legal` | 法律检索/合同审查/文书起草 | 同 FlashX 家族（页面未单列，按同族处理） |
| 上一代旗舰 | `glm-5.2` / `glm-5.1` / `glm-5` | 长程任务、Coding | **默认开，可关** |
| 长任务优化 | `glm-5-turbo` | 「龙虾任务」专项优化 | 支持思考；`enabled` 时由模型自动判断（未列入「默认强制开启」清单） |
| 高智能 | `glm-4.7` / `glm-4.7-flashx` / `glm-4.7-flash` | Agentic Coding；Flash 为免费档 | **默认开，可关**（GLM-4.7 引入「轮级思考」，可按轮关） |
| 上一代 | `glm-4.6` | 高级编码/复杂推理 | 「混合 thinking（自动开启）」 |
| 轻量 | `glm-4.5-air` / `glm-4.5-airx` / `glm-4.5-flash` | 轻量/极速/免费 | 支持思考；`enabled` 时自动判断 |
| 超长文本 | `glm-4-long` | 1M 上下文、4K 输出 | **不支持 `thinking` 参数**（低于 GLM-4.5） |
| 老免费档 | `glm-4-flash-250414` / `glm-4-flashx-250414` | 128K / 16K | **不支持 `thinking` 参数** |

「默认思考」的官方原话（《思考模式》）：

> 「GLM-5.3 GLM-5.3-FLASH GLM-5.2 GLM-5.1 GLM-5 GLM-4.7 系列默认开启 Thinking，这一点不同于 GLM-4.6 的默认『混合 thinking（自动开启）』。」

来源：
- <https://docs.bigmodel.cn/api-reference/模型-api/对话补全>（dateModified 2026-11-02）
- <https://docs.bigmodel.cn/cn/guide/start/model-overview>（抓取日 2026-11-03）
- <https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode>（dateModified 2026-11-02）

### 10.3 关闭 / 控制思考的参数

GLM 只有一套参数名，但**能力逐模型**。两个字段都在 `/chat/completions` 请求体顶层：

| 参数 | 类型 / 取值 | 默认 | 作用 |
| --- | --- | --- | --- |
| `thinking` | object：`{"type": "enabled" \| "disabled"}` | `{"type": "enabled"}` | 硬开关。`disabled` = 不思考直接回答 |
| `thinking.clear_thinking` | boolean | `true` | **不是开关**：只控制是否丢弃历史轮次的 `reasoning_content`；`false` 才启用 Preserved Thinking |
| `reasoning_effort` | string：`max` / `xhigh` / `high` / `medium` / `low` / `minimal` / `none` | `max` | **强度档位**；仅在 `thinking` 开启时生效；仅 GLM-5.2 及以上支持 |

关键语义（官方原文 / 归纳）：

- `thinking.type` 的 `enabled` 有**两种含义**：
  - `GLM-5.2` / `5.1` / `5` / `5-Turbo` / `5V-Turbo` / `4.6` / `4.6V` / `4.5`：模型**自动判断**本轮是否需要思考（动态思考）；
  - `GLM-5.3` / `5.3-FLASH` / `4.7` / `4.5V`：**强制思考**（开了就一定想）。
- `GLM-5.3` / `5.3-FLASH` 系列：`thinking.type` **只接受 `enabled`**，传 `disabled` **会报错**。
- `GLM-5.2` 有一个额外的「硬关」路径：`reasoning_effort` 传 `none` 或 `minimal` 表示**放弃思考**。
  `GLM-5.3` 系列**没有**这个路径：只支持 `low` / `high` / `max`，传 `none` 等其余值会报错。
- `GLM-5.3-FlashX` 与 `GLM-5.3-Flash` 共用同一模型页，页面对该系列的参数说明是：
  「`thinking.type` 仅支持 `enabled`，不支持关闭思考」。`-Legal` 是 FlashX 的法律专向版本，按同族处理。

来源：
- <https://docs.bigmodel.cn/cn/guide/capabilities/thinking>（dateModified 2026-11-02）
- <https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode>（dateModified 2026-11-02）
- <https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash>（抓取日 2026-11-03）
- <https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7>（轮级思考，抓取日 2026-11-03）

### 10.4 逐模型还是统一？

**参数名统一，能力逐模型。** 这一点和 SiliconFlow 的结构相同、和 DeepSeek 的整体统一不同：

| 模型 | `thinking.type=disabled` | `reasoning_effort` 可用档位 |
| --- | --- | --- |
| `glm-5.3` / `glm-5.3-flash` / `glm-5.3-flashx`（含 `-legal`） | ❌ **报错** | `low` / `high` / `max`（默认 `max`），`none` 等报错 |
| `glm-5.2` | ✅ 可关 | `max` / `xhigh` / `high` / `medium` / `low` / `minimal` / `none`（`none`、`minimal` = 放弃思考；`low`/`medium`→`high`，`xhigh`→`max`） |
| `glm-5.1` / `glm-5` | ✅ 可关 | 文档只承诺「GLM-5.2 及以上」支持 `reasoning_effort`，5.1/5 的具体档位未单列 |
| `glm-5-turbo` | ✅ 可关 | 同上，未单列 |
| `glm-4.7` / `4.7-flashx` / `4.7-flash` | ✅ 可关（轮级） | 不支持（`reasoning_effort` 仅 5.2+） |
| `glm-4.6` / `glm-4.5-*` | ✅ 可关 | 不支持 |
| `glm-4-long` / `glm-4-flash-250414` / `glm-4-flashx-250414` | 参数本身不支持 | 不支持 |

> 一句话：**除了 GLM-5.3 家族，其余支持思考的 GLM 都能关；GLM-5.3 家族只能调 `reasoning_effort` 的 `low/high/max`。**

### 10.5 不支持时会发生什么？（400 还是忽略）

智谱是「已知字段、非法取值 → 报错」的风格，但「**给不支持的模型发这个字段**」大多没有明文：

- **确定会报错（文档明写）**：
  - `glm-5.3` / `glm-5.3-flash` 传 `thinking.type = "disabled"`；
  - `glm-5.3` / `glm-5.3-flash` 传 `reasoning_effort` 的 `none` / `minimal` / `medium` / `xhigh` 等非 `low|high|max` 值；
  - 迁移文档再次强调 GLM-5.3「强制开启，关闭报错」。
- **文档未规定**：
  - 给 `glm-4-long` / `glm-4-flash-250414` 这类 **GLM-4.5 以下**模型发 `thinking`（`ChatThinking` 的说明只写「仅 GLM-4.5 及以上模型支持此参数配置」，没有说低版本是忽略还是 400）；
  - 给 `glm-4.7` / `glm-4.6` 发 `reasoning_effort`（文档只说「仅 GLM-5.2 及其以上支持」）；
  - 完全未知的顶层字段。
- OpenAI 兼容页本身也提醒：「某些场景下智谱与 OpenAI 接口仍存在差异」，因此**不要假设未知字段一定被忽略**；对低版本模型最安全的做法是根本不发。

来源：
- <https://docs.bigmodel.cn/cn/guide/capabilities/thinking>（2026-11-02）
- <https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-new>（抓取日 2026-11-03）
- <https://docs.bigmodel.cn/api-reference/模型-api/对话补全>（`ChatThinking`，2026-11-02）

### 10.6 给插件的 GLM 预设映射建议

1. **关闭开关只发一个字段**：`thinking: {"type": "disabled"}`。这是 GLM 唯一文档化的 hard-off，不要用 `reasoning_effort` 去模拟关闭（除 `glm-5.2` 的 `none` 外都不成立）。
2. **`glm-5.3*` 家族不要提供「关闭」选项**：UI 上把 toggle 置灰，只给 `reasoning_effort` 的 `low` / `high` / `max`（默认 `max`）。强行发 `disabled` 会 400，属于「用户点了开关反而报错」的最差体验。
3. **`glm-5.2` 用 `thinking.disabled` 即可**，不要同时发 `reasoning_effort: "none"`；两者语义重复，且同时发会让「档位」和「开关」互相打架。若产品要「最省」，`glm-5.2` 上 `none` 也可用，但保持单一映射更好维护。
4. **`glm-4-long` / `glm-4-flash-*`（< 4.5）直接不发 `thinking`**，UI 标注「该模型不支持思考」。
5. **不要用 `clear_thinking` 当开关**：默认 `true`（丢弃历史 reasoning_content）；关闭思考时保持默认即可，开启 Preserved Thinking 才设 `false`。
6. **校验只能看 `reasoning_content`**：智谱的 `usage` schema 只文档化了 `prompt_tokens` / `completion_tokens` / `total_tokens`（没有 `reasoning_tokens`），所以不能像 DeepSeek 那样用 token 数判断；非流式看 `choices[0].message.reasoning_content` 是否存在，流式看 `delta.reasoning_content` 是否出现。
7. **模型 code 用小写**，并把 `glm-5.3-flashx-legal` 与 `glm-5.3-flashx` 分开存——它们的关闭能力同族，但计费与场景不同。

### 10.7 本节速查

| 项 | 结论 |
| --- | --- |
| 端点 | `https://open.bigmodel.cn/api/paas/v4/chat/completions`，`Authorization: Bearer <KEY>` |
| 关闭参数 | `thinking: {"type": "disabled"}` |
| 强度参数 | `reasoning_effort`：`max`/`xhigh`/`high`/`medium`/`low`/`minimal`/`none`（逐模型子集，默认 `max`） |
| 统一还是逐模型 | 参数名统一，**能力逐模型** |
| 关不掉 | `glm-5.3`、`glm-5.3-flash`、`glm-5.3-flashx`（含 `-legal` 同族） |
| 不能发 `thinking` | `glm-4-long`、`glm-4-flash-250414`、`glm-4-flashx-250414`（GLM-4.5 以下） |
| 默认开 | 5.3 / 5.2 / 5.1 / 5 / 4.7 系列；4.6 为混合自动 |
