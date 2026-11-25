# 接口方言：自定义供应商支持 OpenAI / Anthropic 两种方言，并新增 Anthropic 官方预设（方言化思考开关）

> 权威出处：GitHub issue [#105](https://github.com/telecomshy/TaskNotesAiReporter/issues/105)（`ready-for-agent`）。本文件是仓库内可被 `/code-review` 直接发现的副本，内容取自 issue #105。

> 出处：2026-11-25 经 **`/grill-with-docs`** 三轮逼问定形（Q1–Q6、第二轮、第三轮全按推荐）：方言是供应商属性、协议层自写而非官方 SDK｜自定义接口按 Anthropic **原生 Messages** 协议｜参数策略由方言固定｜思考开关方言化（能力表 + 方言候选 + 方言读面）｜Anthropic 官方预设本轮做、OpenAI 官方预设单开｜现有四家国产预设行为零变更。测试接缝已经用户确认：主缝沿用 AI 客户端的可注入请求函数（捕获请求 + 伪造响应），不新增缝。

## Problem Statement

插件目前只认一种「说话方式」：OpenAI 兼容的 `chat/completions`。这带来两个用户可见的缺口：

1. **自定义供应商只能接 OpenAI 兼容端点**。用户手上如果是 Anthropic 兼容的网关（Claude 官方或国内三方网关的 `/v1/messages` 形态），无论怎么填地址都连不通：地址会拼成 `/chat/completions`，认证头、请求体、响应读取全都不对。
2. **没有 Anthropic 官方预设**。想用 Claude 的用户必须手动拼地址、且大概率踩到参数雷区：Anthropic `2026-10-21` 起已删除 `temperature`/`top_p`/`top_k`（带了即 400），`max_tokens` 必填，`/v1/models` 需要版本头且默认每页 20 条。插件完全没有这些概念。

## Solution

给「供应商」引入**接口方言**概念，取值 OpenAI 兼容 / Anthropic 兼容，作为供应商级属性：

- **自定义供应商**可在卡片上选择方言，从而同时支持两套协议；存量自定义供应商缺省 OpenAI 兼容，升级零变更。
- **新增 Anthropic 官方内置预设**（地址预填、只需密钥），与现有预设共用同一套「获取模型列表 → 挑选 → 启用」流程；老用户升级后自动看到这张卡，既有配置与当前模型不受影响。
- **Anthropic 方言**按原生 Messages 协议发送：`x-api-key`、固定版本头、`max_tokens`、顶层 `system`、不发温度/`top_p`；响应按 `content[]` 文本块读取。
- **思考开关方言化**：Anthropic 开＝`thinking: {type:"adaptive"}`、关＝`thinking: {type:"disabled"}`；「假关」判定读 `content[]` 的思考块与 `thinking_tokens`；思考测试的候选字段按方言取。
- **模型清单翻页**：Anthropic 清单按 `after_id` + `has_more` 拉全，避免误标「已失效」。

协议层继续走现有可注入请求函数的自写实现，不引入官方 SDK（见 ADR-0028）。

## User Stories

### 自定义供应商与方言

1. 作为使用 Anthropic 兼容网关的用户，我想要给自定义供应商选「Anthropic 兼容」，以便这类端点能真正连上，而不是被拼成 `/chat/completions`。
2. 作为使用 OpenAI 兼容端点的用户，我想要存量自定义供应商无需任何操作就继续工作，以便升级不破坏现有配置。
3. 作为新添加自定义供应商的用户，我想要方言默认是 OpenAI 兼容，以便最常见的情况零点击。
4. 作为用户，我想要「接口方言」单选紧挨 API 地址，以便我知道这个地址该按哪套规矩填。
5. 作为用户，我想要选 Anthropic 时看到「地址需包含 `/v1`」的提示，以便不会因为少了路径段得到莫名其妙的 404。
6. 作为用户，我想要插件自动发送 `x-api-key` 与 `anthropic-version`，以便我不用手工拼请求头。
7. 作为使用本地无认证代理的用户，我想要两种方言下都保留「无认证」选项，以便代理场景不被迫填密钥。
8. 作为用户，我想要认证按钮的文案随方言变化（OpenAI 兼容显示 `Bearer Token`、Anthropic 兼容显示 `x-api-key`），以便我知道该贴哪种形式的密钥。
9. 作为用户，我想要切换方言时已有的模型行、模型参数、启用集与思考开关全部保留，以便误点不会清空我的配置。
10. 作为用户，我想要切换方言不清空「当前模型」，以便生成不会因为一次切换突然失效。
11. 作为用户，我想要自定义卡上的「测试」按钮按当前方言发请求，以便测试通过就意味着真实的生成路径可用。
12. 作为用户，我想要 Anthropic 网关即使没实现 `/v1/models` 也能手动填模型 ID，以便拉取失败不阻塞使用。
13. 作为用户，我想要 Anthropic 方言的「获取模型列表」带上版本头，以便网关不因缺少版本而拒绝。
14. 作为模型很多的用户，我想要清单自动翻页拉全，以便已启用的模型不会被误标「已失效」。
15. 作为用户，我想要翻页有页数上限兜底，以便坏网关说「还有下一页」时插件不会卡死。
16. 作为用户，我想要任一分页失败时整次拉取按失败处理（不做半截清单），以便「清单」语义始终是完整快照。
17. 作为用户，我想要 Anthropic 清单里的模型 ID 原样进入「模型清单」，以便挑选、启用、已失效判定与现有流程一致。

### Anthropic 官方预设

18. 作为 Claude API 用户，我想要一个内置 Anthropic 预设且地址已预填，以便我只需要选择密钥。
19. 作为老用户，我想要升级后自动出现这张预设卡，且我原有的供应商、启用集、当前模型一个都不变，以便我可以从容采用。
20. 作为老用户，我想要「补卡」不在载入时强制写盘，以便升级本身不改我的设置文件。
21. 作为用户，我想要 Anthropic 预设与其他预设行为一致（不可删除、同样的拉取/挑选/已失效/未配置清理规则），以便不用重新学一套交互。
22. 作为用户，我想要 Anthropic 预设的密钥走 SecretStorage（设置里只存密钥名），以便密钥不落进 `data.json`。
23. 作为用户，我想要清空 Anthropic 预设的密钥名后同样回到「未配置 ⇒ 无启用模型」，以便预设之间规则一致。

### 协议正确性（两种方言）

24. 作为 Anthropic 用户，我想要插件从不发送 `temperature`/`top_p`/`top_k`，以便请求不会因已删除参数被 400。
25. 作为 Anthropic 用户，我想要 `max_tokens` 始终发送且沿用全局输出上限，以便请求合法且符合我的设置。
26. 作为 Anthropic 用户，我想要 system 消息被提升为顶层 `system` 字段，以便模板指令照常生效。
27. 作为 Anthropic 用户，我想要响应正文由 `content[]` 中所有 `text` 块拼成，以便报告内容完整。
28. 作为 Anthropic 用户，我想要正文为空时仍报「空回复」，以便我不会得到一份静默的空报告。
29. 作为 Anthropic 用户，我想要非对话补全形态的响应按解析失败报错，以便区分「网关回错东西」与「模型没说话」。
30. 作为 Anthropic 用户，我想要服务端错误信息原样带出，以便我能定位密钥、版本或地址问题。
31. 作为用户，我想要两种方言共用同一个超时设置与同一套错误码，以便界面文案与排查方式不分裂。
32. 作为 OpenAI 兼容用户，我想要现有请求形态（Bearer、温度、`max_tokens`、`choices[0].message.content`）完全不变，以便四家国产预设零回归。

### 思考开关与思考测试

33. 作为 Anthropic 用户，我想要「思考」开时发送 `thinking: {type:"adaptive"}`、关时发送 `thinking: {type:"disabled"}`，以便我能控制推理开销。
34. 作为 Anthropic 用户，我想要「假关」判定读取思考块与 `thinking_tokens`，以便「以为关了其实没关」会被如实告警。
35. 作为 Anthropic 用户，我想要思考测试探测 Claude 自己的关字段，以便不会因为试了 OpenAI 字段而错误落成「未能关闭」。
36. 作为自定义 Anthropic 网关用户，我想要思考能力初始为「未知」并由思考测试学习，以便非标准网关不被擅自假定。
37. 作为使用旧版 Claude 模型的用户，我想要思考测试的习得结论优先于内置能力表，以便模型拒绝 adaptive 时能被纠正。
38. 作为用户，我想要思考测试的基线请求同样按方言发送，以便「会不会思考」的判断在 Claude 上有效。
39. 作为用户，我想要思考测试的 400 仍解释为「该字段不适用」、其它异常仍解释为「中断」，以便四值判定语义不变。
40. 作为用户，我想要两种方言的思考开关仍只有开/关两态、不额外增加「思考深度」档位，以便设置面不膨胀。

### 文档与术语

41. 作为读者，我想要 `CONTEXT.md` 的「供应商」按方言定义、并新增「接口方言」词条，以便词汇表与实现一致。
42. 作为社区目录读者，我想要 README 的网络用途披露写明「OpenAI 兼容或 Anthropic 兼容端点」，以便披露准确。
43. 作为用户，我想要插件与包的描述不再只说 OpenAI 兼容，以便安装前的预期正确。
44. 作为维护者，我想要 OpenAI 官方预设单独登记为待办，以便它的模型级参数策略不阻塞本轮。
45. 作为维护者，我想要研究笔记补上 2026-11-25 的事实更正（思考语义、workspace 头、清单翻页），以便下次不必重新踩坑。

## Implementation Decisions

1. **接口方言是供应商级属性**。新增类型 `ApiStyle = "openai" | "anthropic"`；`ModelProvider` 增加可选字段 `apiStyle`。读取侧经单一取值函数（缺省 `openai`）归一，支持方言的供应商也不在类型上分叉。
2. **存量不落盘缺省值**。老数据缺 `apiStyle` 时按 `openai` 读取；只有用户主动切换方言才写入，遵守「载入不改写用户既有数据」的既有约束。
3. **协议层自写并保持单缝**。不引入 `openai` / `@anthropic-ai/sdk` / Vercel AI SDK。理由与取舍见 ADR-0028：官方 SDK 仍需把请求接回 Obsidian 的 `requestUrl`（渲染进程 `fetch` 受 CORS 限制、移动端不可用 Node HTTP），却带来约 900 KB 体积、与现有超时/错误语义相反的默认重试（2 次、10 分钟）、以及为非标准思考参数做类型逃逸的额外工作。
4. **共享 HTTP 机制，分方言描述「请求什么」**。现有请求模块继续承担内容类型、超时、非 2xx → 结构化错误、错误详情提取；方言只决定地址、认证头、请求体与响应读取，避免复制超时/错误处理（ADR-0002 / #30 的收敛成果不倒退）。
5. **URL 约定**。Anthropic 方言的 base URL 必须包含 `/v1`（预设已预填 `https://api.anthropic.com/v1`，自定义卡提示写明）；对话端点 = base + `/messages`，清单 = base + `/models`；若地址已以 `/messages` 结尾则原样使用。插件**不**为裸域名自动插 `/v1`，保持 URL 构建的哑函数性质。OpenAI 方言的地址规则完全不变。
6. **认证头方言化**。Anthropic 方言：有密钥且认证方式为「密钥」时发 `x-api-key`，始终发固定 `anthropic-version`（常量随插件版本维护），不发 `Authorization`；「无认证」时不发 `x-api-key`。OpenAI 方言保持 `Authorization: Bearer`。不提供自定义请求头自由文本框；`anthropic-workspace-id` 不设字段，文档写明「多 workspace 凭据需使用绑定单一 workspace 的密钥」。
7. **请求体参数策略由方言固定，不开放用户开关**。Anthropic 方言发 `model`、`max_tokens`（沿用全局输出上限并沿用现有上限钳制）、`messages`（`user`/`assistant` 文本）、顶层 `system`（由 system 消息合并）、`stream:false`、按需合并思考参数；**不发** `temperature`/`top_p`/`top_k`。OpenAI 方言的请求体逐字段保持现状。
8. **响应读取方言化**：Anthropic 正文 = `content[]` 中所有 `type:"text"` 块的 `text` 拼接；非补全形态（`content` 不是数组）→ 解析失败；正文为空 → 空回复（不新增错误码）；推理段读面 = 任意非空思考块（含 `redacted_thinking`）或 `usage.output_tokens_details.thinking_tokens > 0`。错误详情继续走 `error.message`（Anthropic 错误体同形，现有提取器已覆盖）。
9. **思考能力表按（供应商, 模型）扩展**：新增 Anthropic 预设行，`claude-*` 视为可关——关 `{type:"disabled"}`、开 `{type:"adaptive"}`；旧模型若拒绝 adaptive，由思考测试的习得结论盖过内置表。自定义 Anthropic 供应商不在表内，初始为「未知」，靠测试学习。
10. **思考测试候选按方言取**：OpenAI 方言候选保持现状三字段；Anthropic 方言候选为单字段 `thinking: {type:"disabled"}`。状态机（基线 → 逐字段 → 四值判定）的语义与判定规则不变，候选清单作为输入注入；「中断」「400＝字段不适用」的归类不变。
11. **生成期思考参数合并机制不变**：习得或能力表给出的关参数仍以「单键值对、一次只发一个」的形式并入请求体顶层；Anthropic 的 `thinking` 对象沿用同一机制，不需要第二套写入路径。
12. **模型清单翻页（仅 Anthropic 方言）**：请求带 `limit=100`（官方范围 1–1000、默认 20）；以 `after_id=<上一页 last_id>` 续页，直到 `has_more=false`；页数上限 50 页；任一分页失败即整次失败、不写半截清单；首屏空 → 空清单（沿用现有「空表是正常状态」语义）；模型 ID 取 `data[].id`，原样保留顺序。
13. **内置预设补齐**。`PRESET_PROVIDERS` 新增 Anthropic 条目（`id:"anthropic"`，名称按界面语言本地化，`baseUrl` 固定，方言 Anthropic，认证「密钥」）。载入归一化时按 id 补齐缺失的内置预设（只追加、不覆盖、不移动既有顺序、追加到列表末尾），**不因补齐强制落盘**；补齐幂等。全新安装直接由默认设置获得该预设。既有「未配置 ⇒ 无启用模型」清理规则对预设通用，自动覆盖新预设。
14. **当前模型解析带出方言**：解析结果（供应商 + 模型 + 地址 + 密钥 + 参数 + 思考解析）增加 `apiStyle`；生成、测试连接、思考测试、拉取清单全部按它分派，调用方不再各自判断供应商类型。
15. **界面**。自定义供应商卡在 API 地址上方新增一行「接口方言」单选（两个按钮，沿用现有认证单选按钮的视觉惯例），高亮当前值；切换只写方言，不清模型、不清启用集、不清当前模型。认证行的 `bearer` 选项文案随方言呈现（`Bearer Token` / `x-api-key`）。预设卡不显示方言选择（方言内置固定）。预制卡与自定义卡的其余结构不变。
16. **文案**。新增键双语登记：接口方言标题、两种方言名、地址含 `/v1` 提示、`x-api-key` 认证名；Anthropic 预设名双语。文案键登记测试（现有 i18n 键测试）必须继续通过。
17. **文档**。`CONTEXT.md` 已按本规格更新「供应商」定义并新增「接口方言」词条（「思考测试」补「按方言取字段」）；README 网络用途披露、`manifest.json` 与 `package.json` 描述改为「OpenAI 兼容或 Anthropic 兼容」；研究笔记追加 2026-11-25 更正段。
18. **ADR-0028**：记录「方言是供应商属性 + 协议层自写而非官方 SDK + OpenAI 方言本轮零变更」这一组难以逆转、且未来读者会追问「为什么不用官方 SDK」的决策，含备选方案与取舍。
19. **错误与状态语义零新增**：不新增错误码、不新增「因 stop_reason=max_tokens 而空」的专用提示；沿用 `timeout` / `chat.http` / `chat.network` / `chat.parse` / `chat.empty` / `models.*` 现有词表。

## Testing Decisions

好测试只断言外部行为：从可注入的请求函数上抓「发了什么」（网址、方法、请求头、请求体），再用伪造响应断言「读出了什么」（正文、推理段、模型清单、错误码），不断言内部函数调用或模块结构。

- **主缝（沿用）：AI 客户端边界**。以捕获请求 + 伪造响应覆盖：两种方言的 URL、认证头、版本头、请求体差异；Anthropic 的 system 提升、无温度、`max_tokens` 必发；响应文本块拼接、思考块/`thinking_tokens` 读面、非补全形态报解析失败、空正文报空回复；两种方言共用同一错误映射与超时。先例：`test/client.test.ts`。
- **纯函数缝（沿用）：URL 构建、思考解析与状态机**。Messages 地址拼接（含已以 `/messages` 结尾、已含 `/v1` 的形态）；能力表 `claude-*` 行的开/关参数；按方言注入候选清单后状态机转移与四值判定不变（含基线无推理段 → 未检出、候选全败 → 未能关闭、400 → 换字段、其它异常 → 中断）。先例：`test/client.test.ts` 的 URL 段、`test/thinking.test.ts`。
- **设置缝（沿用）：归一化与命令门面**。老数据缺 `apiStyle` 读为 OpenAI；切换方言的命令只写方言、不动模型/启用集/当前模型；内置预设补齐幂等、只追加、不改既有项、不因补齐落盘（载入测试断言返回对象与写盘调用次数）；Anthropic 预设进入「未配置 ⇒ 无启用模型」清理路径。先例：`test/loadSettings.test.ts`、`test/providerSettings.test.ts`。
- **流程缝（沿用）：获取模型列表**。方言透传；Anthropic 分页多页拼接、`after_id`/`limit` 参数、`has_more=false` 停止、页数上限、中途失败按失败结局、空页按空清单。先例：`test/fetchModelsFlow.test.ts`。
- **思考测试流程缝（沿用）**：探测请求按方言构造；Claude 上基线 + `disabled` 候选可落「可关」习得条目；400 语义不回归。先例：`test/thinkingFlow.test.ts`。
- **UI 手工验收**（无 DOM 测试）：自定义卡方言单选的位置、高亮、切换后模型行与参数保留；认证文案随方言切换；设置刷新后方言与模型行仍在；Anthropic 预设卡形态与其它预设一致；思考开关在「未知/内置可关/习得」三态的置灰与徽标；键盘焦点可见。依据 `CODING_STANDARDS.md` § UI。
- **不测**：真实网络调用（无凭据、不联网）；官方 SDK（不引入）；文案逐字符内容（由键登记测试间接覆盖）。

## Out of Scope

- **OpenAI 官方预设**（单独登记 issue）：`max_completion_tokens`、推理模型不发温度、`/models` 噪声过滤、推理预算默认值、Chat Completions 与 Responses API 选型。
- 现有 OpenAI 方言的参数行为改动（四家国产预设零变更）。
- Responses API、流式、工具调用、结构化输出。
- 官方 SDK / Vercel AI SDK 的引入（ADR-0028 记录取舍）。
- 思考深度档位（`output_config.effort` 的 low/medium/high/xhigh/max）。
- 自定义请求头自由文本框、`anthropic-workspace-id` 字段。
- 裸域名自动补 `/v1`；非 `/v1` 路径的网关适配。
- Anthropic 的 OAuth / Claude Code 凭据、Agents/Managed Agents 等其它端点。
- 多 workspace 凭据支持。

## Further Notes

- **事实锚点（2026-11-25 官方文档核对）**：Anthropic API 版本 `2026-10-21` 已删除 `temperature`/`top_p`/`top_k`；`thinking` 为 adaptive 时代——`{type:"adaptive"}` 开、`{type:"disabled"}` 关，旧 `{type:"enabled", budget_tokens}` 已废弃且 4.7+ 直接 400；清单 `limit` 范围 1–1000、默认 20，游标 `after_id`/`before_id`、`has_more`、`last_id`，默认只返回 active/deprecated；`anthropic-workspace-id` 仅多 workspace 凭据需要。
- **研究笔记更正**：`docs/research/openai-anthropic-provider-config.md` 原写「Claude 默认思考」「workspace 头对未绑定 key 必需」，分别应更正为「adaptive 是按请求 opt-in」「单 workspace 凭据可省略」；原「清单默认每页 20 条」补充分页细节。
- **三方网关宽容策略**：版本头发了但网关可忽略；`/v1/models` 未实现 → 拉取失败、手动模型行兜底；思考字段非标准 → 初始未知、由思考测试学习；失败一律按现有错误码呈现，不静默降级。
- **决策溯源**：第一轮 Q1–Q6（端点类型 / 方言建模 / 参数策略 / 认证头 / 思考开关 / 清单翻页）、第二轮 Q1–Q6（换包目的 / 实现层选型 / 体积红线 / 预设范围 / 思考覆盖 / OpenAI 方言不动）、第三轮 Q1–Q4（思考收尾 / 方言入口 / 预设补齐 / 翻页参数）全部按推荐落定，无遗留分歧。
- **体积影响**：不引 SDK，`main.js` 维持百 KB 量级；新增代码只增方言构造与解析两个小分支。
- **安全**：密钥仍只以「密钥名」出现在设置里，值存 Obsidian SecretStorage；方言切换不触发任何额外取值或日志。
