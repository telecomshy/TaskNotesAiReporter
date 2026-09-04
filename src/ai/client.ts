/**
 * OpenAI 兼容大模型客户端，基于 Obsidian 的 requestUrl 实现。
 */

import { requestUrl } from "obsidian";
import { buildChatCompletionsUrl, buildModelsUrl } from "../core/aiUrl";

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

export class AIClientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AIClientError";
	}
}

/**
 * 动态获取供应商支持的模型列表（GET /models）。
 * 返回模型 ID 数组；失败时抛出 AIClientError。
 */
export async function listModels(baseUrl: string, apiKey: string, timeoutSeconds = 30): Promise<string[]> {
	const url = buildModelsUrl(baseUrl);

	// 认证头：apiKey 为空即无认证，此时不附带 Authorization
	const headers: Record<string, string> = {};
	if (apiKey.trim() !== "") {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	let response;
	try {
		response = await withTimeout(
			requestUrl({
				url,
				method: "GET",
				headers,
				throw: false,
			}),
			timeoutSeconds * 1000
		);
	} catch (error) {
		throw new AIClientError(`获取模型列表失败：${error instanceof Error ? error.message : String(error)}`);
	}

	if (response.status < 200 || response.status >= 300) {
		let detail = "";
		try {
			const body = response.json;
			detail =
				(body?.error?.message as string) ||
				(body?.message as string) ||
				JSON.stringify(body).slice(0, 200);
		} catch {
			detail = response.text?.slice(0, 200) ?? "";
		}
		throw new AIClientError(`获取模型列表返回错误（HTTP ${response.status}）：${detail}`);
	}

	try {
		const data = response.json as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
		const list = data.data ?? data.models ?? [];
		const ids = list
			.map((m) => m.id)
			.filter((id): id is string => typeof id === "string" && id.length > 0);
		return ids;
	} catch {
		throw new AIClientError("解析模型列表响应失败");
	}
}

/**
 * 调用 OpenAI 兼容的 chat/completions 接口，返回模型生成文本。
 */
export async function chatCompletion(
	config: AIClientConfig,
	messages: ChatMessage[]
): Promise<string> {
	const url = buildChatCompletionsUrl(config.baseUrl);

	// 保护：若 maxTokens 超出常见上限（如 DeepSeek 最大 384K），钳制到安全值，
	// 避免直接请求导致 400 报错。
	const safeMaxTokens = clampMaxTokens(config.maxTokens);

	let response;
	try {
		// 认证头：apiKey 为空即无认证，此时不附带 Authorization
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (config.apiKey.trim() !== "") {
			headers.Authorization = `Bearer ${config.apiKey}`;
		}
		response = await withTimeout(
			requestUrl({
				url,
				method: "POST",
				headers,
				body: JSON.stringify({
					model: config.model,
					messages,
					temperature: config.temperature,
					max_tokens: safeMaxTokens,
					stream: false,
				}),
				throw: false,
			}),
			config.timeoutSeconds * 1000
		);
	} catch (error) {
		throw new AIClientError(`网络请求失败：${error instanceof Error ? error.message : String(error)}`);
	}

	if (response.status < 200 || response.status >= 300) {
		let detail = "";
		try {
			const body = response.json;
			detail =
				(body?.error?.message as string) ||
				(body?.message as string) ||
				JSON.stringify(body).slice(0, 300);
		} catch {
			detail = response.text?.slice(0, 300) ?? "";
		}
		throw new AIClientError(`模型接口返回错误（HTTP ${response.status}）：${detail}`);
	}

	try {
		const data = response.json as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			throw new AIClientError("模型返回内容为空");
		}
		return content;
	} catch (error) {
		if (error instanceof AIClientError) throw error;
		throw new AIClientError("解析模型响应失败");
	}
}

/** 测试连接：发送一条极简请求以校验配置是否可用。 */
export async function testConnection(config: AIClientConfig): Promise<void> {
	await chatCompletion(config, [{ role: "user", content: "ping" }]);
}

/** 钳制 maxTokens 到安全范围（>0 且 ≤ 384K）。 */
function clampMaxTokens(maxTokens: number): number {
	const MAX_SAFE = 384 * 1024; // 384K，DeepSeek 等模型的最大输出上限
	if (!Number.isFinite(maxTokens) || maxTokens <= 0) return 8192;
	return Math.min(maxTokens, MAX_SAFE);
}

/** 给 Promise 加超时：超时则抛出 AIClientError。 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new AIClientError(`请求超时（${ms}ms）`)), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
