/**
 * AI 客户端错误：结构化错误种类 + 外部详情。
 * 纯类型/类，不依赖 Obsidian（transport 层才依赖），便于展示层与测试直接引用。
 */

/** AI 客户端错误种类（供展示层按界面语言翻译）。 */
export type AIClientErrorCode =
	| "models.network"
	| "models.http"
	| "models.parse"
	| "chat.network"
	| "chat.http"
	| "chat.empty"
	| "chat.parse"
	| "timeout";

export interface AIClientErrorDetails {
	/** 服务端或底层返回的原始信息（外部数据，不翻译）。 */
	detail?: string;
	/** HTTP 状态码。 */
	status?: number;
	/** 超时毫秒数。 */
	ms?: number;
}

export class AIClientError extends Error {
	constructor(
		readonly code: AIClientErrorCode,
		readonly details: AIClientErrorDetails = {}
	) {
		super(details.detail ?? code);
		this.name = "AIClientError";
	}
}
