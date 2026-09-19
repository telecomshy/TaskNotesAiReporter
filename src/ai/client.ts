/**
 * OpenAI 兼容大模型客户端。
 *
 * 本模块（client.ts）不直接静态依赖 obsidian：底层 HTTP 传输通过可注入的
 * RequestFn 提供，默认实现位于 transport.ts（包装 obsidian 的 requestUrl）。
 * 两个操作共享的请求机制（认证头 / JSON 内容类型 / 超时 / 错误映射）由 ./request
 * 的 requestJson 统一承担，本模块只描述「请求什么」与「如何读取成功结果」。
 */

import { requestUrlTransport } from "./transport";
import { buildChatCompletionsUrl, buildModelsUrl } from "../core/aiUrl";
import { AIClientError } from "./errors";
import { requestJson, type RequestFn } from "./request";

export { AIClientError };
export type { AIClientErrorCode, AIClientErrorDetails } from "./errors";
export type { RequestFn, RequestParams, HttpResponse } from "./request";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface AIClientConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	temperature: number;
	maxTokens: number;
	timeoutSeconds: number;
}

const defaultRequest: RequestFn = requestUrlTransport;

/**
 * 动态获取供应商支持的模型列表（GET /models）。
 * 返回模型 ID 数组；失败时抛出 AIClientError。
 */
export async function listModels(
	baseUrl: string,
	apiKey: string,
	timeoutSeconds = 30,
	request: RequestFn = defaultRequest
): Promise<string[]> {
	return requestJson(
		{ op: "models", url: buildModelsUrl(baseUrl), method: "GET", apiKey, timeoutSeconds },
		(json) => {
			const data = json as {
				data?: Array<{ id?: string }>;
				models?: Array<{ id?: string }>;
			};
			const list = data.data ?? data.models ?? [];
			return list
				.map((m) => m.id)
				.filter((id): id is string => typeof id === "string" && id.length > 0);
		},
		request
	);
}

/**
 * 调用 OpenAI 兼容的 chat/completions 接口，返回模型生成文本。
 */
export async function chatCompletion(
	config: AIClientConfig,
	messages: ChatMessage[],
	request: RequestFn = defaultRequest
): Promise<string> {
	return requestJson(
		{
			op: "chat",
			url: buildChatCompletionsUrl(config.baseUrl),
			method: "POST",
			apiKey: config.apiKey,
			body: JSON.stringify({
				model: config.model,
				messages,
				temperature: config.temperature,
				max_tokens: clampMaxTokens(config.maxTokens),
				stream: false,
			}),
			timeoutSeconds: config.timeoutSeconds,
		},
		(json) => {
			const data = json as { choices?: Array<{ message?: { content?: string } }> };
			const content = data.choices?.[0]?.message?.content;
			if (!content) throw new AIClientError("chat.empty");
			return content;
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

/** 钳制 maxTokens 到安全范围（>0 且 ≤ 384K）。 */
function clampMaxTokens(maxTokens: number): number {
	const MAX_SAFE = 384 * 1024; // 384K，DeepSeek 等模型的最大输出上限
	if (!Number.isFinite(maxTokens) || maxTokens <= 0) return 8192;
	return Math.min(maxTokens, MAX_SAFE);
}
