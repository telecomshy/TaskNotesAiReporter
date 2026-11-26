# OpenAI Responses API 支持（`*-pro` / `gpt-oss-*` / `gpt-5.6-cyber`）

> 权威出处：GitHub issue [#110](https://github.com/telecomshy/TaskNotesAiReporter/issues/110)。本文是仓库内可被 `/code-review` 直接发现的规格副本。
> 出处：2026-11-26 由 #106 划出的单开待办，同日三项裁决定形（层位＝模型级协议选择 / 只在必需时走 Responses / 清单放回三类），架构决策见 [ADR-0031](../adr/0031-wire-protocol-per-model.md)，事实锚点 `docs/research/responses-api.md`（2026-11-26 官方文档核对）。

## Problem Statement

`/v1/models` 里有一批**只有 Responses API 可用**的对话模型，插件现在对它们只能做两件事之一：从清单里排除（#106 的做法），或放回清单但必然失败（Chat Completions 端点不收）。两类模型被挡在门外：

1. **`*-pro` 的顶配推理模型**（`gpt-5.5-pro`、`gpt-5.4-pro`、`gpt-5.2-pro`）——官方端点表 Chat Completions = Not supported。
2. **`gpt-oss-*`（open-weight）与 `gpt-5.6-cyber`**——同样只在 Responses 上可用。

用户选到这些模型时会得到一条普通 `ai-error`（400 或 404），既看不出原因，也没有可用的替代路径。

协议差异不是参数级差异，塞不进现有的「模型请求策略」（ADR-0030 只允许窄化参数）：

| Chat Completions | Responses |
| --- | --- |
| `messages` | `input` |
| `max_completion_tokens` | `max_output_tokens`（minimum 16） |
| `choices[0].message.content` | `output[]` 的 message 项与 `output_text` 块 |
| `reasoning_effort`（顶层） | `reasoning.effort`（嵌套） |
| `finish_reason: "length"` | `status: "incomplete"` + `incomplete_details.reason` |

同时 Responses 的 `store` **默认 `true`**：不显式关掉，任务数据会被上游保存。

## Solution

在「接口方言」与「模型请求策略」之间，插入一层**模型级「接口协议」选择**（ADR-0031）：

- 内置协议表按（供应商 id, 模型 pattern）解析 `chat-completions` / `responses`，首个命中生效，**缺省 chat-completions**；只对内置 `openai` 预设开行。
- 只在**必需**时走 Responses：`*-pro`、`gpt-oss-*`、`gpt-5.6-cyber`；Chat 可用的模型请求形态逐字段不变。
- 客户端为 Responses 增加一套请求构造（`input` / `max_output_tokens` / `reasoning` / `store:false`）与一套响应读取（`output[]` / `usage.output_tokens_details.reasoning_tokens`）。
- 温度判定、额度下限、超时下限、思考参数并键仍只有一处实现，协议层只消费（策略规则不在两条路径上分叉）。
- 清单过滤把三类模型放回；`gpt-rosalind-research` 与 `chat-latest` 继续排除。
- 无新界面、无新用户配置、无新错误码。

## User Stories

### 协议层位与解析

1. 作为维护者，我想要协议作为（供应商, 模型）级的解析结果随「当前模型」带出，以便执行层只消费、不各自判断供应商。
2. 作为四家国产预设与自定义供应商的用户，我想要我完全不受影响（不按地址或模型名嗅探官方端点），以便既有邮件/网关配置零变更。
3. 作为 Anthropic 方言用户，我想要协议层对我不存在（永远走 Messages 形态），以便两套协议不互相串门。
4. 作为用户，我想要 Chat Completions 可用的模型（`gpt-6.x` 等）请求逐字段不变，以便已验收的行为不因本轮改动漂移。

### 请求正确性

5. 作为 `*-pro` 用户，我想要请求发到 `/v1/responses`，以便不再因为端点不对而必然失败。
6. 作为 Responses 用户，我想要输出额度发 `max_output_tokens`（而不是 `max_completion_tokens` / `max_tokens`），以便字段被接受。
7. 作为 Responses 用户，我想要消息走 `input`（文本消息原样复用，含 `system` 角色），以便多轮语义不变。
8. 作为 Responses 用户，我想要思考开关发嵌套 `reasoning.effort`，以便开＝`high`、关＝`none` 的语义与 Chat 一致。
9. 作为 Responses 用户，我想要输出预算至少 25,000（仍 `max(配置, 下限)` 并钳制 384K），以便不出现「只推理、无正文」。
10. 作为 Responses 用户，我想要超时至少 120 秒（用户全局更大时优先），以便长推理不被假超时打断。
11. 作为 Responses 用户，我想要 `store: false`，以便任务数据不因缺省而被上游保存。
12. 作为 Responses 用户，我想要温度规则与 Chat 一致（按策略 × 本次生效 effort 判定），以便 `*-pro` 族不会因多余的 `temperature` 被拒。

### 响应读取与错误语义

13. 作为 Responses 用户，我想要正文从 `output[]` 的 message 项拼接，以便读面正确。
14. 作为 Responses 用户，我想要「只推理、无正文」（`status: "incomplete"` + `incomplete_details.reason: "max_output_tokens"`）归为**空回复**，以便与现有措辞一致、不新增错误码。
15. 作为 Responses 用户，我想要 `output` 不是数组时归为解析失败，以便错误体伪装成 200 的网关不被当成空回复。
16. 作为假关判定与思考测试的读者，我想要推理段读面按协议分开：Responses 认 `output[]` 的 reasoning 项或 `usage.output_tokens_details.reasoning_tokens > 0`，以便「以为关了其实没关」仍能被识别。

### 模型清单

17. 作为 `*-pro` / `gpt-oss-*` / `gpt-5.6-cyber` 用户，我想要它们重新出现在「模型清单」里，以便能被挑选与启用。
18. 作为用户，我想要 `gpt-rosalind-research`（端点无官方依据）与 `chat-latest`（官方不建议 API 使用）继续被排除，以便不点到必然失败的项。
19. 作为用户，我想要已失效语义不变（仍是过滤后的完整快照；拉回即消），以便清单集合变化不改变失效判定。

### 思考开关

20. 作为 `*-pro` / `gpt-oss-*` 用户，我想要思考开关呈现「未知」、测试入口可点，以便不擅自假定它们能不能关。
21. 作为跑过测试的用户，我想要 Responses 协议下的思考测试只探单字段 `reasoning: {effort: "none"}`，以便少发无谓的 400。
22. 作为跑过测试的用户，我想要习得结论优先于内置表（现有规则不变），以便模型拒绝时能被纠正。

### 零回归与维护

23. 作为读者，我想要研究笔记与规格记录事实来源，以便新模型族上市时知道该改哪张表。
24. 作为无密钥的维护者，我想要假响应测试覆盖全部行为，真实生成列入「待密钥验收清单」。

## Implementation Decisions

1. **协议类型与解析纯函数**：`WireProtocol = "chat-completions" | "responses"`；新增 `src/core/wireProtocol.ts`，行键 `(providerId, modelPattern)`，与策略表 / 能力表同构，首个命中行生效，未命中回落 `chat-completions`。读取侧提供 `protocolOf(config)`（缺省 chat-completions）。
2. **协议表内容（openai 预设）**：`*-pro`（**后缀匹配**，覆盖未来 pro 族）、`gpt-oss-*`、`gpt-5.6-cyber` ⇒ `responses`。其余模型与所有其它供应商 ⇒ 缺省。
3. **模型匹配扩展**：`matchModelPattern` 增加「以 `*` 开头＝后缀匹配」分支（现有表只用精确与前缀，语义零变更）；`*` 单独仍恒命中。
4. **层位**：方言仍定地址根、认证头、错误语义；协议只定端点路径、请求体、响应读取。Anthropic 方言不查协议表（永远 Messages）。
5. **端点**：`buildResponsesUrl(baseUrl)` 与 `buildChatCompletionsUrl` 同构的哑函数（去尾斜杠；已以 `/responses` 结尾则原样；**不**自动补 `/v1`）。
6. **请求体（Responses）**：`model`、`input`（复用现有 `ChatMessage[]`，`system` 角色留在原位——官方迁移指南认定纯文本消息可一一对应）、`max_output_tokens`、`stream: false`、`store: false`；温度按策略判定；思考参数并入顶层（`reasoning: { effort }`）；超时取策略下限。
7. **预算与超时**：与 Chat 共用 `effectiveMaxTokens` / `effectiveTimeoutSeconds`；Responses 的 minimum 16 远低于策略下限，不另加钳制。微型探测恒 256、不受下限影响（沿用 #106）。
8. **温度的生效 effort 读法**：`requestPolicy` 增加「从思考参数提取 effort」的纯函数，认识顶层 `reasoning_effort`（字符串）与嵌套 `reasoning.effort`（对象）两种形态；`shouldSendTemperature` 改用它。规则本身（`send` / `omit-unless-none` / `omit-always`）不变。
9. **能力表不登记新族**：官方未给出 `*-pro` / `gpt-oss-*` / `gpt-5.6-cyber` 的 `none` 支持，按 ADR-0026「不登记＝未知」——开关置灰、测试可点、习得结论盖过。生成期不发思考参数（官方缺省 `medium`）。
10. **思考测试候选**：协议为 `responses` 时用单字段候选 `{ name: "reasoning", value: { effort: "none" } }`；顶层 `reasoning_effort` 在 Responses 上是不存在的字段。状态机与四值判定不变。
11. **响应读取（Responses）**：`output` 不是数组 ⇒ `chat.parse`；遍历 `type:"message"` 的 `content[]`，拼接 `type:"output_text"` 的 `text`；正文为空（含 `incomplete` 的只推理态）⇒ `chat.empty`。推理段读面＝任一 `type:"reasoning"` 条目，或 `usage.output_tokens_details.reasoning_tokens > 0`。
12. **微型探测（Responses）**：同一请求构造，预算恒 256；`output` 不是数组 ⇒ `chat.parse`（不认 200）；否则按推理段读面判 `reasoning-present` / `reasoning-absent`；400 仍是探测信号，其它异常中断（沿用 #89）。
13. **清单放回**：排除表删去 `gpt-oss-*`、`*-pro`、`gpt-5.6-cyber` 三条；新增 `gpt-rosalind-research` 到排除表（端点无官方依据）。非对话族排除、`gpt-*` 粗白名单、顺序保留、空清单结局不变。
14. **解析结果带出**：`ActiveModelConfig` 增可选 `protocol`，`resolveActive` 按（供应商, 模型）解析填值；生成与思考测试把它透传进客户端配置（执行层只消费）。
15. **错误与状态语义零新增**：沿用 `timeout` / `chat.http` / `chat.network` / `chat.parse` / `chat.empty` / `models.*`。
16. **无界面**：预设卡、思考卡、挑选框外观不变；用户不可见、不可改协议。
17. **文档**：`CONTEXT.md` 新增「接口协议」词条并修订「接口方言」（端点与报文改由协议决定）；README 的「网络用途」补一句：走 Responses 的请求显式 `store: false`，上游不保存响应。研究笔记 `docs/research/responses-api.md` 为事实源。

## Testing Decisions

好测试只断言外部行为：从可注入请求函数抓「发了什么」（网址、方法、请求头、请求体），用伪造响应断言「读出了什么」（正文、推理段、错误码）。**沿用现有四个缝，不新增。**

- **主缝（沿用）：AI 客户端边界**。Responses 生成请求：URL 以 `/responses` 结尾、body 有 `input` 且无 `messages`、发 `max_output_tokens` 且无 `max_completion_tokens` / `max_tokens`、`store:false`、`stream:false`、温度按策略、思考嵌套形状、超时下限。Responses 读取：`output[]` 多 message / 多 `output_text` 块拼接；`incomplete` 空正文 ⇒ `chat.empty`；`output` 非数组 ⇒ `chat.parse`；reasoning 项与 `reasoning_tokens` 两种读面；探测同一策略但预算恒 256。Chat 路径逐字段回归。先例：`test/client.test.ts`。
- **纯函数缝（沿用）：协议表 / 匹配 / 温度读法 / 候选分派 / 过滤表**。协议表首个命中、`*-pro` 后缀、缺省 chat、其它供应商零命中；`matchModelPattern` 后缀分支（既有前缀语义不变）；`shouldSendTemperature` 认识嵌套 effort；`thinkingOffCandidates` 按协议分派；过滤表放回三类、继续排除 `gpt-rosalind-research` 与 `chat-latest`。先例：`test/requestPolicy.test.ts`、`test/thinking.test.ts`。
- **设置缝（沿用）：当前模型解析**。`resolveActive` 带出 protocol：`gpt-5.5-pro` ⇒ responses、`gpt-6.2-astra` ⇒ chat-completions、四家国产预设与自定义 ⇒ chat-completions、Anthropic ⇒ 不参与。先例：`test/providerSettings.test.ts`。
- **流程缝（沿用）：获取模型列表**。OpenAI 假响应含 `gpt-5.5-pro` / `gpt-oss-120b` ⇒ 清单保留它们、结局 fetched；`gpt-rosalind-research` 仍被过滤。先例：`test/fetchModelsFlow.test.ts`。
- **UI 人工验收**（无 DOM 视觉测试）：清单多出 pro / oss 条目；思考卡对它们显示「未知」且测试入口可点；Chat 模型外观不变。
- **不测**：真实网络与真实 Responses 调用（本机无密钥）；上游拒收的逐字错误文案。

**待有密钥后的验收清单**（本轮不作为验收依据，写进完成评论）：

1. 拉取模型列表：`gpt-5.5-pro` / `gpt-oss-120b` 出现。
2. 选用 `gpt-5.5-pro`（或任一 `*-pro`）生成短报告：正文非空、`status` 不是 `incomplete`。
3. 在 `gpt-oss-120b` 上跑一次思考测试：得到四值判定之一（「中断」也如实呈现）。
4. 换回 `gpt-6.2-astra`：行为与 #106 验收时一致（Chat 路径零变更）。

## Out of Scope

- 把 Chat Completions 可用的模型（GPT-5.x / 6.x）切到 Responses——性能偏好不是可用性要求（ADR-0031）。
- 会话状态：`previous_response_id`、`store: true`、Conversations API。
- 工具调用 / 内置工具（web search、file search、code interpreter、MCP）、结构化输出（`text.format`）、流式。
- Responses 的推理摘要（`summary` / `include: reasoning.encrypted_content`）在界面上呈现。
- 每模型可视的协议选择、按地址嗅探、用户可配置端点。
- `gpt-rosalind-research` 的支持（端点无官方依据）。
- 温度、最大输出、超时的设置界面。

## Further Notes

- **两项「无官方依据」的保守处理**：`*-pro` / `gpt-oss-*` 的 `none` 支持未写明 ⇒ 不登记能力行、靠思考测试学习；`*-pro` 的温度规则未单列 ⇒ 走 OpenAI 预设缺省 `omit-unless-none`（与 5.4 族的已知规则同向）。
- **`store: false` 的理由**：插件是纯文本单轮生成，不需要会话状态；Chat 路径无此字段，不影响既有行为（与研究笔记 §1 的「默认 true」对应）。
- **漂移**：新 `pro` 族若改变后缀命名，协议表与清单排除表要同时更新；事实源是 `docs/research/responses-api.md` 与 `docs/research/openai-official-preset.md`。
- **体积与安全**：不引 SDK；新增代码只有协议表、后缀匹配分支、第二个请求构造与读取面；密钥仍只以「密钥名」出现在设置里。
