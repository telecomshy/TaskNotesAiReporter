# 接口方言是供应商属性，协议层自写而不引官方 SDK

> **另有部分修订（[ADR-0031](0031-wire-protocol-per-model.md)，#110）**：本 ADR 第 2 条里「方言只决定
> 地址、认证头、请求体与响应读取」的**端点路径、请求体与响应读取**已改由「接口协议」按（供应商, 模型）
> 决定（Chat Completions / Responses）；地址根、认证头与错误语义仍归方言。其余裁决不变。

> **部分被 [ADR-0030](0030-model-request-policy-overlay.md) 取代**：本 ADR 里「请求体参数策略由方言固定」
> 一句已修订为「方言定基线，模型请求策略只能在其上窄化」（#106）。其余裁决不变。

> 规格见 issue #105。与 [ADR-0002](0002-ai-transport-decoupled-from-obsidian.md)（AI 传输与 Obsidian 解耦）、
> [ADR-0024](0024-thinking-off-by-default.md)（思考默认关、一次只发一个开关参数）、
> [ADR-0026](0026-thinking-test-learned-capability-model-catalog.md)（习得能力盖过能力表）衔接；
> 本 ADR 不改它们的裁决，只在其上增加「请求方言」这一维。

## Context

2026-11-25 之前，插件只认一种「说话方式」：OpenAI 兼容的 `chat/completions`。这带来两个用户可见的缺口：

1. **自定义供应商只能接 OpenAI 兼容端点。** Anthropic 兼容的网关（`/v1/messages` 形态）无论怎么填地址都连不通：地址被拼成 `/chat/completions`，认证头、请求体、响应读取全都不对。
2. **没有 Anthropic 官方预设。** Claude 自 `anthropic-version: 2026-10-21` 起删除了 `temperature` / `top_p` / `top_k`（带即 400），`max_tokens` 必填，`system` 是顶层字段，`/v1/models` 需要版本头且默认只回 20 条。现有客户端没有任何概念承接这些差异。

规格逼问（2026-11-25，三轮）定下的边界：方言是**供应商属性**、协议层**自写**、OpenAI 方言**本轮零变更**、Anthropic 走原生 Messages 而非兼容层。

## Decision

1. **方言是供应商级属性，不是供应商类型。** 新增 `ApiStyle = "openai" | "anthropic"`，`ModelProvider` 增加可选 `apiStyle`；读取侧经单一取值函数归一（缺省 OpenAI 兼容），支持两套方言的供应商不在类型上分叉。存量数据缺该字段时按 OpenAI 读，**载入不写缺省值**——只有用户主动切换方言才落盘（延续「载入不改写用户既有数据」的既有约束）。
2. **协议层自写并保持单缝。** 不引入 `openai` / `@anthropic-ai/sdk` / Vercel AI SDK。共享 HTTP 机制（内容类型、超时、非 2xx → 结构化错误、错误详情提取）继续由 `src/ai/request.ts` 承担；方言只决定**地址、认证头、请求体与响应读取**。
3. **Anthropic 方言按原生 Messages。** `x-api-key` + 固定 `anthropic-version`（不发 `Authorization`）；`max_tokens` 必发且沿用全局上限钳制；system 消息提升为顶层 `system`；**不发** `temperature` / `top_p` / `top_k`；正文＝`content[]` 所有 `text` 块拼接；思考开关 `{type:"adaptive"}` 开 / `{type:"disabled"}` 关；清单按 `after_id` + `has_more` 翻页拉全（任一分页失败、触到 50 页上限仍喊「还有下一页」、或说「还有下一页」却不给游标，一律按整次失败——清单语义始终是完整快照，不做半截清单）。
4. **OpenAI 方言本轮零变更。** 四家国产预设的地址、Bearer、温度、`max_tokens`、`choices[0].message.content` 与错误映射逐字段保持现状。
5. **方言入口与预设。** 自定义卡在 API 地址上方新增方言单选（切换只写方言，模型行 / 启用集 / 当前模型全部保留）；认证行文案随方言（`Bearer Token` / `x-api-key`）。`PRESET_PROVIDERS` 新增 Anthropic 官方预设（地址预填、方言 Anthropic），载入时按 id 补齐缺失的内置预设（只追加、不覆盖、不移动顺序、不因补齐落盘）。

## Considered Options

- **引入官方 SDK（`@anthropic-ai/sdk` / `openai` / Vercel AI SDK）**：仍需把请求接回 Obsidian 的 `requestUrl`（渲染进程 `fetch` 受 CORS 限制、移动端不可用 Node HTTP），**收益被抵消**；却带来约 900 KB 体积、与现有超时/错误语义相反的默认重试（2 次、10 分钟），以及为非标准思考参数做类型逃逸的额外工作——否。
- **走 Anthropic 的 OpenAI SDK 兼容层（`/v1/chat/completions`）**：能复用现有请求体与解析，但官方明说该层「主要用来测试与比较模型能力，不算长期或生产级方案」，且 thinking 详情不可用（假关判定失去读面）——否。
- **把方言拆成两种供应商类型（`type: "openai" | "anthropic"`）**：预设 / 自定义这一既有分类与方言正交，类型分叉会让每个判定谓词都长出两套分支——否。
- **Anthropic 地址自动补 `/v1`**：URL 构建会从哑函数变成会猜路径的智能函数，非 `/v1` 网关就被误改——否（预设已预填含 `/v1` 的地址，自定义卡给提示）。
- **开放「自定义请求头」文本框 / `anthropic-workspace-id` 字段**：方言参数策略由方言固定更简单可靠；多 workspace 凭据改用绑定单一 workspace 的密钥——否。
- **保留 OpenAI 兼容层做 Anthropic 对话、仅新增预设**：自定义 Anthropic 网关的方言需求仍在，且 `temperature` 已删除的问题无法按网关区分——否。

## Consequences

- **体积**：不引 SDK，`main.js` 维持百 KB 量级；新增代码只多方言构造与解析两个小分支。
- **版本头是随插件维护的常量**（`ANTHROPIC_VERSION = "2026-10-21"`）：Anthropic 升版时由插件更新；三方网关可忽略该头。
- **模型清单翻页是 Anthropic 方言独占**：OpenAI 方言仍单页拉取；空清单仍是正常状态（`#92`），与「从未拉取」区分对待不变。
- **思考测试候选按方言取**：Anthropic 只试 `thinking: {type:"disabled"}`，状态机（基线 → 逐字段 → 四值判定）与判定规则不变；Claude 的思考是请求级 opt-in，基线「未检出思考」是诚实结论而非缺陷。内置能力表新增 `claude-*` 可关行；自定义 Anthropic 网关初始未知、靠习得能力学习（习得 ＞ 内置 ＞ 未知，ADR-0026 不变）。
- **错误与状态语义零新增**：沿用 `timeout` / `chat.*` / `models.*` 现有词表；不新增「因 `stop_reason=max_tokens` 而空」的专用提示。
- **OpenAI 官方预设仍是单独议题**（`max_completion_tokens`、推理模型不发温度、`/models` 噪声过滤、Responses API 选型），不受本 ADR 影响。
