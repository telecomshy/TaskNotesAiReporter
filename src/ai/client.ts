/**
 * 模型客户端：按「接口方言」描述两套协议的「请求什么」与「如何读取成功结果」。
 *
 * 本模块（client.ts）不直接静态依赖 obsidian：底层 HTTP 传输通过可注入的
 * RequestFn 提供，默认实现位于 transport.ts（包装 obsidian 的 requestUrl）。
 * 两个操作共享的请求机制（认证头 / JSON 内容类型 / 超时 / 错误映射）由 ./request
 * 的 requestJson 统一承担（#105：共享机制不因方言复制，方言只决定地址 / 认证头 /
 * 请求体 / 响应读取）。OpenAI 兼容为缺省方言，存量行为零变更。
 */

import { requestUrlTransport } from "./transport";
import { buildChatCompletionsUrl, buildMessagesUrl, buildModelsUrl } from "../core/aiUrl";
import { isAnthropic } from "../core/apiStyle";
import {
	EMPTY_REQUEST_POLICY,
	effectiveMaxTokens,
	effectiveTimeoutSeconds,
	shouldSendTemperature,
} from "../core/requestPolicy";
import { probeOutcomeOfError, type ThinkingProbeOutcome } from "../core/thinking";
import { AIClientError } from "./errors";
import { requestJson, type RequestFn } from "./request";
import type { ApiStyle, RequestPolicy, ThinkingParam } from "../types";

export { AIClientError };
export type { AIClientErrorCode, AIClientErrorDetails } from "./errors";
export type { RequestFn, RequestParams, HttpResponse } from "./request";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface AIClientConfig {
	/** 「接口方言」（#105）：缺省 OpenAI 兼容（存量行为零变更）。 */
	apiStyle?: ApiStyle;
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature: number;
	maxTokens: number;
	timeoutSeconds: number;
	/** 思考开关参数（单键，一次只发一个，见 ADR-0024）；缺省不发思考参数。 */
	thinking?: ThinkingParam;
	/**
	 * 「模型请求策略」（#106）：由当前模型解析带出，执行层只消费（ADR-0030）。
	 * 缺省＝空策略（现状：`max_tokens` + 温度恒发 + 无下限）——自定义卡的「测试」不传策略。
	 */
	requestPolicy?: RequestPolicy;
}

/** 一次对话的结果：正文 + 是否残留推理段（假关判定读面，见 ADR-0024）。 */
export interface ChatResult {
	content: string;
	hasReasoning: boolean;
}

/** 思考测试微型请求的目标（#89）：微型请求自带提示与输出上限，不需要温度/上限配置。 */
export interface ThinkingProbeConfig {
	/** 「接口方言」（#105）：探测请求与基线同样按方言构造。 */
	apiStyle?: ApiStyle;
	/** 供应商 id（#106）：思考测试候选按它分派（内置 OpenAI 预设只探 reasoning_effort）。 */
	providerId?: string;
	baseUrl: string;
	apiKey: string;
	model: string;
	timeoutSeconds: number;
	/**
	 * 「模型请求策略」（#106）：基线 / 逐字段探测与生成请求同一套构造规则
	 * （不该发的温度不发、输出额度字段与超时下限生效）；预算恒 256、不受下限影响。
	 */
	requestPolicy?: RequestPolicy;
}

/** 思考测试微型请求的提示与输出上限（#89）：越小越省，够读出推理段读面即可。 */
const THINKING_PROBE_PROMPT = "1+1=? Reply with the number only.";
const THINKING_PROBE_MAX_TOKENS = 256;

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
	if (isAnthropic(config.apiStyle)) return listAnthropicModels(config, request);
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

/**
 * 调用模型接口，返回生成正文与推理段读面。按「接口方言」分派（#105）。
 */
export async function chatCompletion(
	config: AIClientConfig,
	messages: ChatMessage[],
	request: RequestFn = defaultRequest
): Promise<ChatResult> {
	if (isAnthropic(config.apiStyle)) {
		return anthropicChatCompletion(config, messages, request);
	}
	return requestJson(
		{
			op: "chat",
			url: buildChatCompletionsUrl(config.baseUrl),
			method: "POST",
			apiKey: config.apiKey,
			body: JSON.stringify(
				openAIRequestBody({
					model: config.model,
					messages,
					policy: policyOf(config),
					thinking: config.thinking ?? null,
					temperature: config.temperature,
					// 额度字段名与预算下限随策略：OpenAI 预设发 max_completion_tokens。
					maxTokens: effectiveMaxTokens(policyOf(config), config.maxTokens),
				})
			),
			timeoutSeconds: effectiveTimeoutSeconds(policyOf(config), config.timeoutSeconds),
		},
		(json) => {
			const data = json as {
				choices?: Array<{ message?: { content?: string; reasoning_content?: unknown } }>;
				usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } };
			};
			const content = data.choices?.[0]?.message?.content;
			if (!content) throw new AIClientError("chat.empty");
			return { content, hasReasoning: detectReasoning(data) };
		},
		request
	);
}

/**
 * OpenAI 兼容方言请求体的**唯一构造处**（#106，生成与微型探测共用）：
 * 输出额度字段名、温度可发条件与思考参数的单键并入都在这里（ADR-0024 / ADR-0030）。
 */
interface OpenAIRequestBody {
	model: string;
	messages: ChatMessage[];
	policy: RequestPolicy;
	/** 本次要发的思考参数；null＝不发（生成取能力的解析结果，探测取候选 / 基线）。 */
	thinking: ThinkingParam | null;
	/** 温度值（仅在策略允许时发出）。 */
	temperature: number;
	/** 已定好的输出额度（生成走下限与钳制，探测恒 256、不受下限影响）。 */
	maxTokens: number;
}

function openAIRequestBody(input: OpenAIRequestBody): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: input.model,
		messages: input.messages,
		[input.policy.outputField]: input.maxTokens,
		stream: false,
	};
	// 温度判定输入是「策略 × 本次生效 effort」，不是用户的思考开关（ADR-0030）。
	if (shouldSendTemperature(input.policy, input.thinking)) body.temperature = input.temperature;
	// 思考开关参数并入请求体顶层（一次只发一个，见 ADR-0024）
	if (input.thinking) body[input.thinking.name] = input.thinking.value;
	return body;
}

/** 请求策略的读取侧缺省：未带策略＝空策略（现状零变更，#106 裁决 4）。 */
function policyOf(config: { requestPolicy?: RequestPolicy }): RequestPolicy {
	return config.requestPolicy ?? EMPTY_REQUEST_POLICY;
}

/**
 * Anthropic 兼容（原生 Messages，`POST /messages`）：
 * - 认证 `x-api-key` + 固定版本头，不发 `Authorization`；
 * - 请求体发 `model` / `max_tokens` / `messages`（仅 user/assistant）/ 顶层 `system` /
 *   `stream:false`，**不发** `temperature` / `top_p` / `top_k`（`2026-10-21` 起已删除）；
 * - 正文＝`content[]` 中所有 `text` 块拼接；非补全形态 ⇒ 解析失败；正文为空 ⇒ 空回复。
 */
function anthropicChatCompletion(
	config: AIClientConfig,
	messages: ChatMessage[],
	request: RequestFn
): Promise<ChatResult> {
	const { system, turns } = splitSystemMessages(messages);
	return requestJson(
		{
			op: "chat",
			url: buildMessagesUrl(config.baseUrl),
			method: "POST",
			apiKey: config.apiKey,
			authHeader: "x-api-key",
			extraHeaders: anthropicHeaders(),
			body: JSON.stringify({
				model: config.model,
				// 输出额度随策略（当前 Anthropic 无策略行＝空策略，行为与现状一致）；
				// 温度不随策略加回——`2026-10-21` 起 Anthropic 已删除该参数（ADR-0030 分层）。
				max_tokens: effectiveMaxTokens(policyOf(config), config.maxTokens),
				messages: turns,
				stream: false,
				...(system !== "" ? { system } : {}),
				// 思考开关参数并入请求体顶层（`thinking: {type:…}`，一次只发一个，见 ADR-0024）
				...(config.thinking ? { [config.thinking.name]: config.thinking.value } : {}),
			}),
			timeoutSeconds: effectiveTimeoutSeconds(policyOf(config), config.timeoutSeconds),
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
 * 响应是否残留推理段：`reasoning_content` 非空或 `reasoning_tokens` 计量大于零。
 * 假关判定的唯一读面——不看 HTTP 200（错误参数名会得到 200＋正常思考）。
 */
function detectReasoning(data: unknown): boolean {
	const body = data as {
		choices?: Array<{ message?: { reasoning_content?: unknown } }>;
		usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } };
	};
	const reasoningContent = body.choices?.[0]?.message?.reasoning_content;
	if (typeof reasoningContent === "string" && reasoningContent.trim() !== "") return true;
	const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens;
	return typeof reasoningTokens === "number" && reasoningTokens > 0;
}

/**
 * 思考测试微型请求（#89）：只读「响应推理段读面」（唯一证据，不认 HTTP 200）。
 * 空正文不算失败（思考模型可能把输出额度花在推理段上）；
 * 错误按 `probeOutcomeOfError` 归类——测试内 400＝字段不适用（探测信号），其余异常＝中断。
 */
export async function thinkingProbe(
	config: ThinkingProbeConfig,
	param: ThinkingParam | null,
	request: RequestFn = defaultRequest
): Promise<ThinkingProbeOutcome> {
	try {
		const hasReasoning = isAnthropic(config.apiStyle)
			? await anthropicThinkingProbe(config, param, request)
			: await openaiThinkingProbe(config, param, request);
		return hasReasoning ? "reasoning-present" : "reasoning-absent";
	} catch (error) {
		const status =
			error instanceof AIClientError && error.code === "chat.http"
				? error.details.status
				: undefined;
		return probeOutcomeOfError(status);
	}
}

/** OpenAI 方言的微型请求：与生成请求共用同一个请求体构造（温度规则 / 额度字段），预算恒 256。 */
function openaiThinkingProbe(
	config: ThinkingProbeConfig,
	param: ThinkingParam | null,
	request: RequestFn
): Promise<boolean> {
	const policy = policyOf(config);
	return requestJson(
		{
			op: "chat",
			url: buildChatCompletionsUrl(config.baseUrl),
			method: "POST",
			apiKey: config.apiKey,
			body: JSON.stringify(
				openAIRequestBody({
					model: config.model,
					messages: [{ role: "user", content: THINKING_PROBE_PROMPT }],
					policy,
					thinking: param,
					temperature: 0,
					// 探测预算恒定 256，不受 25k 下限影响（不烧钱，#106 裁决 7）。
					maxTokens: THINKING_PROBE_MAX_TOKENS,
				})
			),
			timeoutSeconds: effectiveTimeoutSeconds(policy, config.timeoutSeconds),
		},
		(json) => {
			// 200 不算证据（AC2）：响应体不是对话补全体（如错误体回 200）时读面不可信，
			// 抛出后按中断归类，不落结论。
			const payload = json as { choices?: unknown };
			if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
				throw new AIClientError("chat.parse");
			}
			return detectReasoning(json);
		},
		request
	);
}

/** Anthropic 方言的微型请求：不发温度（已删除），`max_tokens` 必发，读面 = content[] / thinking_tokens。 */
function anthropicThinkingProbe(
	config: ThinkingProbeConfig,
	param: ThinkingParam | null,
	request: RequestFn
): Promise<boolean> {
	return requestJson(
		{
			op: "chat",
			url: buildMessagesUrl(config.baseUrl),
			method: "POST",
			apiKey: config.apiKey,
			authHeader: "x-api-key",
			extraHeaders: anthropicHeaders(),
			body: JSON.stringify({
				model: config.model,
				max_tokens: THINKING_PROBE_MAX_TOKENS,
				messages: [{ role: "user", content: THINKING_PROBE_PROMPT }],
				stream: false,
				...(param ? { [param.name]: param.value } : {}),
			}),
			timeoutSeconds: effectiveTimeoutSeconds(policyOf(config), config.timeoutSeconds),
		},
		(json) => {
			const content = (json as { content?: unknown } | null)?.content;
			if (!Array.isArray(content)) throw new AIClientError("chat.parse");
			return detectAnthropicReasoning(json);
		},
		request
	);
}

/** 测试连接：发送一条极简请求以校验配置是否可用。 */
export async function testConnection(
	config: AIClientConfig,
	request: RequestFn = defaultRequest
): Promise<void> {
	await chatCompletion(config, [{ role: "user", content: "ping" }], request);
}
