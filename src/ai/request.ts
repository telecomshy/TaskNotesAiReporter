/**
 * AI 请求模块：拥有两个操作共享的 HTTP 机制——合并可选 Bearer、有请求体时补 JSON
 * 内容类型、加超时、把非 2xx 映射为结构化错误、提取错误详情——成功解析交给调用方。
 *
 * 不静态依赖 obsidian（与 ADR-0002 同一纯度原则）：请求函数由调用方注入，
 * 默认实现留在 client.ts 边界（transport.ts 是唯一触到 obsidian 的地方）。
 */

import { AIClientError } from "./errors";

/** HTTP 响应的最小形态（兼容 obsidian requestUrl 响应） */
export interface HttpResponse {
	status: number;
	json: unknown;
	text: string;
}

/** 请求参数（兼容 obsidian requestUrl 参数） */
export interface RequestParams {
	url: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
	body?: string;
	throw: boolean;
}

/** 可注入的请求函数，便于测试 mock；默认走 obsidian requestUrl（见 transport.ts） */
export type RequestFn = (params: RequestParams) => Promise<HttpResponse>;

/** 一次 JSON 请求的描述。 */
export interface JsonRequest {
	/** 操作种类，用于派生错误码（`models.*` / `chat.*`）。 */
	op: "models" | "chat";
	url: string;
	method: "GET" | "POST";
	/** 空串表示无认证，不附带 Authorization。 */
	apiKey: string;
	/** 有请求体时补 `Content-Type: application/json`。 */
	body?: string;
	timeoutSeconds: number;
}

/** 错误详情最多携带的字符数。 */
const ERROR_DETAIL_MAX_LENGTH = 300;

/**
 * 发起一次 JSON 请求。
 * - 认证：apiKey 非空才附带 `Authorization: Bearer`；
 * - 有请求体才补 `Content-Type: application/json`；
 * - 超时抛 `AIClientError("timeout")`；
 * - 网络异常抛 `${op}.network`（已是 AIClientError 则原样上抛）；
 * - 非 2xx 抛 `${op}.http`，带状态码与服务端详情；
 * - 成功则交给 `parse`；`parse` 抛出的 AIClientError 原样上抛（如 `chat.empty`），
 *   其它异常包成 `${op}.parse`。
 */
export async function requestJson<T>(
	req: JsonRequest,
	parse: (json: unknown) => T,
	request: RequestFn
): Promise<T> {
	const headers: Record<string, string> = {};
	if (req.body !== undefined) headers["Content-Type"] = "application/json";
	if (req.apiKey.trim() !== "") headers.Authorization = `Bearer ${req.apiKey}`;

	let response: HttpResponse;
	try {
		response = await withTimeout(
			request({ url: req.url, method: req.method, headers, body: req.body, throw: false }),
			req.timeoutSeconds * 1000
		);
	} catch (error) {
		if (error instanceof AIClientError) throw error;
		throw new AIClientError(`${req.op}.network`, { detail: messageOf(error) });
	}

	if (response.status < 200 || response.status >= 300) {
		let detail = "";
		try {
			detail = extractErrorDetail(response.json, ERROR_DETAIL_MAX_LENGTH);
		} catch {
			detail = response.text?.slice(0, ERROR_DETAIL_MAX_LENGTH) ?? "";
		}
		throw new AIClientError(`${req.op}.http`, { status: response.status, detail });
	}

	try {
		return parse(response.json);
	} catch (error) {
		if (error instanceof AIClientError) throw error;
		throw new AIClientError(`${req.op}.parse`);
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** 从 OpenAI 兼容错误响应里取可读信息，取不到则回退到截断的 JSON。 */
function extractErrorDetail(json: unknown, maxLength: number): string {
	const body = json as { error?: { message?: string }; message?: string } | null;
	return body?.error?.message ?? body?.message ?? JSON.stringify(body).slice(0, maxLength);
}

/** 给 Promise 加超时：超时则抛出 AIClientError。用全局定时器以便在 Node 环境运行。 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new AIClientError("timeout", { ms })), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
