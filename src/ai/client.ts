/**
 * 模型客户端：按「接口方言」与「接口协议」描述请求的「请求什么」与「如何读取成功结果」。
 *
 * 本模块（client.ts）不直接静态依赖 obsidian：底层 HTTP 传输通过可注入的
 * RequestFn 提供，默认实现位于 transport.ts（包装 obsidian 的 requestUrl）。
 * 两个操作共享的请求机制（认证头 / JSON 内容类型 / 超时 / 错误映射）由 ./request
 * 的 requestJson 统一承担（#105：共享机制不因方言复制；方言只决定地址根与认证头，
 * 对话端点与报文形态由「接口协议」决定，#110）。
 *
 * #111（ADR-0032）起本模块是**纯执行层**：入参是装配层（./modelRequest）定案后的
 * `ModelRequest`（额度、温度、思考参数都已是最终值），这里只把它们放进报文、发出去、
 * 读解析结果——不再 import 请求策略，不再做温度判定 / 下限 / 钳制。
 */

import { requestUrlTransport } from "./transport";
import {
	buildChatCompletionsUrl,
	buildMessagesUrl,
	buildModelsUrl,
	buildResponsesUrl,
} from "../core/aiUrl";
import { probeOutcomeOfError, type ThinkingProbeOutcome } from "../core/thinking";
import { AIClientError } from "./errors";
import { requestJson, type RequestFn } from "./request";
import type { ApiStyle, ChatMessage, ModelRequest, ThinkingParam } from "../types";

export { AIClientError };
export type { AIClientErrorCode, AIClientErrorDetails } from "./errors";
export type { RequestFn, RequestParams, HttpResponse } from "./request";
export type { ChatMessage } from "../types";

/** 一次对话的结果：正文 + 是否残留推理段（假关判定读面，见 ADR-0024）。 */
export interface ChatResult {
	content: string;
	hasReasoning: boolean;
}

/**
 * Anthropic 方言固定版本头（#105）：随插件版本维护的常量。
 * 事实锚点：`2026-10-21` 起 Messages API 已删除 `temperature` / `top_p` / `top_k`。
 */
export const ANTHROPIC_VERSION = "2026-10-21";

/** Anthropic 清单每页条数（官方范围 1–1000，默认 20）。 */
const ANTHROPIC_MODELS_PAGE_LIMIT = 100;

/** Anthropic 清单翻页上限（坏网关说「还有下一页」也不卡死）。 */
const ANTHROPIC_MODELS_MAX_PAGES = 50;

const defaultRequest: RequestFn = requestUrlTransport;

/** 「获取模型列表」的请求描述（#93：超时必填，漏传即编译错误）。 */
export interface ListModelsConfig {
	baseUrl: string;
	apiKey: string;
	timeoutSeconds: number;
	/** 「接口方言」（#105）：缺省 OpenAI 兼容。 */
	apiStyle?: ApiStyle;
}

/**
 * 动态获取供应商支持的模型列表，返回模型 ID 数组；失败时抛出 AIClientError。
 *
 * - OpenAI 兼容：`GET /models`，读 `data[].id`（兼容 `models[].id`）。
 * - Anthropic 兼容：`GET /models?limit=100`，按 `after_id` 翻页拉全（#105）：
 *   任一分页失败即整次失败（不写半截清单），页数上限兜底坏网关。
 */
export async function listModels(
	config: ListModelsConfig,
	request: RequestFn = defaultRequest
): Promise<string[]> {
	if (config.apiStyle === "anthropic") return listAnthropicModels(config, request);
	return requestJson(
		{
			op: "models",
			url: buildModelsUrl(config.baseUrl),
			method: "GET",
			apiKey: config.apiKey,
			timeoutSeconds: config.timeoutSeconds,
		},
		parseOpenAIModels,
		request
	);
}

/** OpenAI 兼容清单解析：`data[]` / `models[]` 的 `id`，空值剔除。 */
function parseOpenAIModels(json: unknown): string[] {
	const data = json as {
		data?: Array<{ id?: string }>;
		models?: Array<{ id?: string }>;
	};
	const list = data.data ?? data.models ?? [];
	return list
		.map((m) => m.id)
		.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Anthropic 方言的清单请求头（认证头之外只多一个固定版本头）。 */
function anthropicHeaders(): Record<string, string> {
	return { "anthropic-version": ANTHROPIC_VERSION };
}

/** Anthropic 清单的一页（`has_more` / `last_id` 是续页游标）。 */
interface AnthropicModelsPage {
	ids: string[];
	hasMore: boolean;
	lastId: string;
}

/** 一页清单的地址：base + `/models`，带每页条数与游标。 */
function anthropicModelsPageUrl(baseUrl: string, afterId: string | undefined): string {
	const base = buildModelsUrl(baseUrl);
	const params = [`limit=${ANTHROPIC_MODELS_PAGE_LIMIT}`];
	if (afterId) params.push(`after_id=${encodeURIComponent(afterId)}`);
	return `${base}?${params.join("&")}`;
}

/** Anthropic 清单解析：`data[].id` 原样保留顺序；响应体不是对象即解析失败。 */
function parseAnthropicModelsPage(json: unknown): AnthropicModelsPage {
	if (typeof json !== "object" || json === null) throw new AIClientError("models.parse");
	const body = json as { data?: unknown; has_more?: unknown; last_id?: unknown };
	const list = Array.isArray(body.data) ? (body.data as Array<{ id?: string }>) : [];
	return {
		ids: list
			.map((m) => m.id)
			.filter((id): id is string => typeof id === "string" && id.length > 0),
		hasMore: body.has_more === true,
		lastId: typeof body.last_id === "string" ? body.last_id : "",
	};
}

/** Anthropic 方言的清单拉取：逐页拼接，`has_more=false` 停止，页数上限兜底。 */
async function listAnthropicModels(
	config: ListModelsConfig,
	request: RequestFn
): Promise<string[]> {
	const ids: string[] = [];
	let afterId: string | undefined;
	for (let page = 0; page < ANTHROPIC_MODELS_MAX_PAGES; page++) {
		const result = await requestJson(
			{
				op: "models",
				url: anthropicModelsPageUrl(config.baseUrl, afterId),
				method: "GET",
				apiKey: config.apiKey,
				authHeader: "x-api-key",
				extraHeaders: anthropicHeaders(),
				timeoutSeconds: config.timeoutSeconds,
			},
			parseAnthropicModelsPage,
			request
		);
		ids.push(...result.ids);
		if (!result.hasMore) return ids;
		// 说「还有下一页」却给不出游标：清单必不完整，按失败结局收尾，
		// 不把半截清单当「完整快照」（US16）——否则已启用模型会被误标「已失效」（US14）。
		if (result.lastId === "") {
			throw new AIClientError("models.parse", {
				detail: "model list pagination returned has_more without last_id",
			});
		}
		afterId = result.lastId;
	}
	// 触到页数上限仍在翻页：同样无法自证完整，按失败结局（US15 的兜底是「不卡死」，不是「半截清单」）。
	throw new AIClientError("models.parse", {
		detail: `model list pagination exceeded ${ANTHROPIC_MODELS_MAX_PAGES} pages`,
	});
}

// ===== 报文构造（生成与微型探测共用同一套；装配已定案数值，这里只放字段） =====

/** Chat Completions 变体（`dialect: openai` × `protocol: chat-completions`）。 */
type ChatCompletionsRequest = Extract<
	ModelRequest,
	{ dialect: "openai"; protocol: "chat-completions" }
>;
/** Responses 变体（`dialect: openai` × `protocol: responses`）。 */
type ResponsesRequest = Extract<ModelRequest, { dialect: "openai"; protocol: "responses" }>;
/** Anthropic Messages 变体（无 protocol / 无温度）。 */
type AnthropicRequest = Extract<ModelRequest, { dialect: "anthropic" }>;

/** 报文里温度与思考参数的并入字段（两条 OpenAI 报文共用）。 */
interface TemperatureAndThinking {
	/** 缺席＝不发（装配已判死）。 */
	temperature?: number;
	thinking: ThinkingParam | null;
}

/**
 * 温度与思考参数的并入（两条 OpenAI 报文共用）：温度缺席＝装配已判死（不发）；
 * 思考参数按类型表的单键并入顶层（一次只发一个，ADR-0024）。
 */
function applyTemperatureAndThinking(
	body: Record<string, unknown>,
	req: TemperatureAndThinking
): void {
	if (req.temperature !== undefined) body.temperature = req.temperature;
	if (req.thinking) body[req.thinking.name] = req.thinking.value;
}

/** Chat Completions 报文：额度字段名由装配定案（`outputField`）。 */
function chatCompletionsBody(req: ChatCompletionsRequest): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: req.model,
		messages: req.messages,
		[req.outputField]: req.maxTokens,
		stream: false,
	};
	applyTemperatureAndThinking(body, req);
	return body;
}

/**
 * Responses 报文（#110，ADR-0031）：`input` 取代 `messages`、`max_output_tokens` 取代
 * `max_completion_tokens`；温度与思考参数由装配后的请求字段决定。
 *
 * - `input` 复用 `ChatMessage[]`：官方迁移指南认定纯文本消息可一一对应（`system` 角色留在原位）；
 * - `store: false`：纯文本单轮不需要会话状态，任务数据不因缺省而被上游保存；
 * - 思考参数并入顶层后即 `reasoning: { effort }`（能力的 Responses 行以该形状给出）。
 */
function responsesBody(req: ResponsesRequest): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: req.model,
		input: req.messages,
		max_output_tokens: req.maxTokens,
		stream: false,
		store: false,
	};
	applyTemperatureAndThinking(body, req);
	return body;
}

/**
 * Anthropic 兼容报文（原生 Messages）：
 * - `max_tokens` 必发、`messages` 只收 user/assistant、system 提升为顶层、`stream:false`；
 * - **不发** `temperature` / `top_p` / `top_k`（`2026-10-21` 起已删除）；变体上没有该字段；
 * - 思考开关参数并入请求体顶层（`thinking: {type:…}`，一次只发一个，见 ADR-0024）。
 */
function anthropicBody(req: AnthropicRequest): Record<string, unknown> {
	const { system, turns } = splitSystemMessages(req.messages);
	return {
		model: req.model,
		max_tokens: req.maxTokens,
		messages: turns,
		stream: false,
		...(system !== "" ? { system } : {}),
		...(req.thinking ? { [req.thinking.name]: req.thinking.value } : {}),
	};
}

/** 把 system 消息合并为顶层 `system`（Anthropic 不接受 system 角色）。 */
function splitSystemMessages(messages: ChatMessage[]): {
	system: string;
	turns: Array<{ role: "user" | "assistant"; content: string }>;
} {
	const system = messages
		.filter((m) => m.role === "system")
		.map((m) => m.content)
		.join("\n\n");
	const turns = messages
		.filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role !== "system")
		.map((m) => ({ role: m.role, content: m.content }));
	return { system, turns };
}

// ===== 变体分派（生成与探测共用） =====

/**
 * 按 `dialect` × `protocol` 三变体分派（#105 / #110 / #111 复查）：分支决策只有这一处，
 * 生成与探测各自传自己的三个实现；实现仍收窄到各自的请求类型。
 */
function dispatchRequest<T>(
	req: ModelRequest,
	handlers: {
		anthropic: (req: AnthropicRequest) => T;
		responses: (req: ResponsesRequest) => T;
		chatCompletions: (req: ChatCompletionsRequest) => T;
	}
): T {
	if (req.dialect === "anthropic") return handlers.anthropic(req);
	if (req.protocol === "responses") return handlers.responses(req);
	return handlers.chatCompletions(req);
}

// ===== 对话（生成） =====

/**
 * 调用模型接口，返回生成正文与推理段读面。按 `ModelRequest` 的 `dialect` × `protocol`
 * 分派（#105 / #110）：报文构造只放字段，不判断策略。
 */
export async function chatCompletion(
	req: ModelRequest,
	request: RequestFn = defaultRequest
): Promise<ChatResult> {
	return dispatchRequest(req, {
		anthropic: (r) => anthropicChatCompletion(r, request),
		responses: (r) => responsesChatCompletion(r, request),
		chatCompletions: (r) => chatCompletionsChatCompletion(r, request),
	});
}

/** Chat Completions 的对话：正文＝`choices[0].message.content`，空值即空回复。 */
function chatCompletionsChatCompletion(
	req: ChatCompletionsRequest,
	request: RequestFn
): Promise<ChatResult> {
	return requestJson(
		{
			op: "chat",
			url: buildChatCompletionsUrl(req.baseUrl),
			method: "POST",
			apiKey: req.apiKey,
			body: JSON.stringify(chatCompletionsBody(req)),
			timeoutSeconds: req.timeoutSeconds,
		},
		(json) => {
			const data = json as {
				choices?: Array<{ message?: { content?: string; reasoning_content?: unknown } }>;
				usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } };
			};
			const content = data.choices?.[0]?.message?.content;
			if (!content) throw new AIClientError("chat.empty");
			return { content, hasReasoning: detectChatCompletionsReasoning(data) };
		},
		request
	);
}

/**
 * Responses 协议的对话（#110）：端点 `/responses`、请求体见 `responsesBody`；
 * 正文＝`output[]` 里 message 项的 `output_text` 块拼接，`output` 不是数组 ⇒ 解析失败，
 * 正文为空（含「只推理、无正文」的 incomplete 态）⇒ 空回复。
 */
function responsesChatCompletion(req: ResponsesRequest, request: RequestFn): Promise<ChatResult> {
	return requestJson(
		{
			op: "chat",
			url: buildResponsesUrl(req.baseUrl),
			method: "POST",
			apiKey: req.apiKey,
			body: JSON.stringify(responsesBody(req)),
			timeoutSeconds: req.timeoutSeconds,
		},
		(json) => {
			const content = responsesTextOf((json as { output?: unknown } | null)?.output);
			if (content === null) throw new AIClientError("chat.parse");
			if (content === "") throw new AIClientError("chat.empty");
			return { content, hasReasoning: detectResponsesReasoning(json) };
		},
		request
	);
}

/** Anthropic 方言的对话：认证 `x-api-key` + 固定版本头，报文见 `anthropicBody`。 */
function anthropicChatCompletion(req: AnthropicRequest, request: RequestFn): Promise<ChatResult> {
	return requestJson(
		{
			op: "chat",
			url: buildMessagesUrl(req.baseUrl),
			method: "POST",
			apiKey: req.apiKey,
			authHeader: "x-api-key",
			extraHeaders: anthropicHeaders(),
			body: JSON.stringify(anthropicBody(req)),
			timeoutSeconds: req.timeoutSeconds,
		},
		(json) => {
			const body = json as { content?: unknown } | null;
			const content = anthropicTextOf(body?.content);
			if (content === null) throw new AIClientError("chat.parse");
			if (content === "") throw new AIClientError("chat.empty");
			return { content, hasReasoning: detectAnthropicReasoning(body) };
		},
		request
	);
}

/**
 * Responses `output[]` 的正文读面：message 项的 `output_text` 块拼接（多个消息项以换行分隔）。
 * `output` 不是数组返回 `null`（＝非对话补全形态，解析失败）；没有正文返回 `""`（＝空回复）。
 */
function responsesTextOf(output: unknown): string | null {
	if (!Array.isArray(output)) return null;
	const parts: string[] = [];
	for (const item of output) {
		const it = item as { type?: unknown; content?: unknown } | null;
		if (it?.type !== "message" || !Array.isArray(it.content)) continue;
		const text = it.content
			.map((block) => {
				const b = block as { type?: unknown; text?: unknown } | null;
				return b?.type === "output_text" && typeof b.text === "string" ? b.text : "";
			})
			.join("");
		if (text !== "") parts.push(text);
	}
	return parts.join("\n");
}

/**
 * Responses 的推理段读面（#110）：任一 `type:"reasoning"` 输出项，或
 * `usage.output_tokens_details.reasoning_tokens > 0`。假关判定与思考测试用它。
 */
function detectResponsesReasoning(data: unknown): boolean {
	const body = data as {
		output?: unknown;
		usage?: { output_tokens_details?: { reasoning_tokens?: unknown } };
	} | null;
	if (Array.isArray(body?.output)) {
		for (const item of body.output) {
			if ((item as { type?: unknown } | null)?.type === "reasoning") return true;
		}
	}
	const reasoningTokens = body?.usage?.output_tokens_details?.reasoning_tokens;
	return typeof reasoningTokens === "number" && reasoningTokens > 0;
}

/**
 * Anthropic `content[]` 的正文读面：所有 `text` 块拼接；`content` 不是数组返回 `null`
 * （＝非对话补全形态，解析失败），空数组或全空文本返回 `""`（＝空回复）。
 */
function anthropicTextOf(content: unknown): string | null {
	if (!Array.isArray(content)) return null;
	return content
		.map((block) => {
			const b = block as { type?: unknown; text?: unknown } | null;
			return b?.type === "text" && typeof b.text === "string" ? b.text : "";
		})
		.join("");
}

/**
 * Anthropic 的推理段读面：任意非空思考块（含 `redacted_thinking`）或
 * `usage.output_tokens_details.thinking_tokens > 0`。假关判定用它（#105）。
 */
function detectAnthropicReasoning(data: unknown): boolean {
	const body = data as {
		content?: unknown;
		usage?: { output_tokens_details?: { thinking_tokens?: unknown } };
	} | null;
	if (Array.isArray(body?.content)) {
		for (const block of body.content) {
			const b = block as { type?: unknown; thinking?: unknown } | null;
			if (typeof b?.thinking === "string" && b.thinking.trim() !== "") return true;
			if (b?.type === "redacted_thinking") return true;
		}
	}
	const thinkingTokens = body?.usage?.output_tokens_details?.thinking_tokens;
	return typeof thinkingTokens === "number" && thinkingTokens > 0;
}

/**
 * Chat Completions 的推理段读面：`reasoning_content` 非空或 `reasoning_tokens` 计量大于零。
 * 假关判定的唯一读面——不看 HTTP 200（错误参数名会得到 200＋正常思考）。
 */
function detectChatCompletionsReasoning(data: unknown): boolean {
	const body = data as {
		choices?: Array<{ message?: { reasoning_content?: unknown } }>;
		usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } };
	};
	const reasoningContent = body.choices?.[0]?.message?.reasoning_content;
	if (typeof reasoningContent === "string" && reasoningContent.trim() !== "") return true;
	const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens;
	return typeof reasoningTokens === "number" && reasoningTokens > 0;
}

// ===== 微型探测（思考测试） =====

/**
 * 思考测试微型请求（#89）：只读「响应推理段读面」（唯一证据，不认 HTTP 200）。
 * 空正文不算失败（思考模型可能把输出额度花在推理段上）；
 * 错误按 `probeOutcomeOfError` 归类——测试内 400＝字段不适用（探测信号），其余异常＝中断。
 * 请求本身由装配层逐步给出（预算恒 256、参数逐字段变化）。
 */
export async function thinkingProbe(
	req: ModelRequest,
	request: RequestFn = defaultRequest
): Promise<ThinkingProbeOutcome> {
	try {
		const hasReasoning = await probeHasReasoning(req, request);
		return hasReasoning ? "reasoning-present" : "reasoning-absent";
	} catch (error) {
		const status =
			error instanceof AIClientError && error.code === "chat.http"
				? error.details.status
				: undefined;
		return probeOutcomeOfError(status);
	}
}

/** 探测请求按方言 / 协议分派（#105 / #110）：Anthropic 的读面与两种 OpenAI 形态各自独立。 */
function probeHasReasoning(req: ModelRequest, request: RequestFn): Promise<boolean> {
	return dispatchRequest(req, {
		anthropic: (r) => anthropicThinkingProbe(r, request),
		responses: (r) => responsesThinkingProbe(r, request),
		chatCompletions: (r) => openaiThinkingProbe(r, request),
	});
}

/**
 * OpenAI 方言的微型请求：与生成请求共用同一个报文构造（温度 / 额度字段），预算已由装配定为 256。
 */
function openaiThinkingProbe(
	req: ChatCompletionsRequest,
	request: RequestFn
): Promise<boolean> {
	return requestJson(
		{
			op: "chat",
			url: buildChatCompletionsUrl(req.baseUrl),
			method: "POST",
			apiKey: req.apiKey,
			body: JSON.stringify(chatCompletionsBody(req)),
			timeoutSeconds: req.timeoutSeconds,
		},
		(json) => {
			// 200 不算证据（AC2）：响应体不是对话补全体（如错误体回 200）时读面不可信，
			// 抛出后按中断归类，不落结论。
			const payload = json as { choices?: unknown };
			if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
				throw new AIClientError("chat.parse");
			}
			return detectChatCompletionsReasoning(json);
		},
		request
	);
}

/**
 * Responses 协议的微型请求（#110）：与生成共用同一报文构造（温度 / 额度 / store:false），
 * 预算已由装配定为 256；`output` 不是数组 ⇒ 解析失败（200 不是证据），
 * 否则按 reasoning 项 / usage 读面判定。
 */
function responsesThinkingProbe(req: ResponsesRequest, request: RequestFn): Promise<boolean> {
	return requestJson(
		{
			op: "chat",
			url: buildResponsesUrl(req.baseUrl),
			method: "POST",
			apiKey: req.apiKey,
			body: JSON.stringify(responsesBody(req)),
			timeoutSeconds: req.timeoutSeconds,
		},
		(json) => {
			const payload = json as { output?: unknown } | null;
			if (!Array.isArray(payload?.output)) throw new AIClientError("chat.parse");
			return detectResponsesReasoning(json);
		},
		request
	);
}

/** Anthropic 方言的微型请求：不发温度（已删除），`max_tokens` 必发，读面 = content[] / thinking_tokens。 */
function anthropicThinkingProbe(req: AnthropicRequest, request: RequestFn): Promise<boolean> {
	return requestJson(
		{
			op: "chat",
			url: buildMessagesUrl(req.baseUrl),
			method: "POST",
			apiKey: req.apiKey,
			authHeader: "x-api-key",
			extraHeaders: anthropicHeaders(),
			body: JSON.stringify(anthropicBody(req)),
			timeoutSeconds: req.timeoutSeconds,
		},
		(json) => {
			const content = (json as { content?: unknown } | null)?.content;
			if (!Array.isArray(content)) throw new AIClientError("chat.parse");
			return detectAnthropicReasoning(json);
		},
		request
	);
}
