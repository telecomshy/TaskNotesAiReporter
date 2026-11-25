/**
 * AI 接口 URL 构建工具。纯函数，无 Obsidian 依赖，可单元测试。
 */

/** 规范化 base URL，去掉末尾斜杠，并保证指向 /chat/completions 端点。 */
export function buildChatCompletionsUrl(baseUrl: string): string {
	let url = baseUrl.trim().replace(/\/+$/, "");
	if (url.endsWith("/chat/completions")) return url;
	return `${url}/chat/completions`;
}

/**
 * Anthropic 方言的对话端点：base + `/messages`。
 * 已以 `/messages` 结尾则原样使用；**不**为裸域名自动插 `/v1`——URL 构建保持哑函数性质
 * （`/v1` 由预设预填或用户自填，见 #105 裁决 5）。
 */
export function buildMessagesUrl(baseUrl: string): string {
	const url = baseUrl.trim().replace(/\/+$/, "");
	if (url.endsWith("/messages")) return url;
	return `${url}/messages`;
}

/** 规范化 base URL，去掉末尾斜杠，指向 /models 端点。 */
export function buildModelsUrl(baseUrl: string): string {
	let url = baseUrl.trim().replace(/\/+$/, "");
	if (url.endsWith("/models")) return url;
	return `${url}/models`;
}
