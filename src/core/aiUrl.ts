/**
 * AI 接口 URL 构建工具。纯函数，无 Obsidian 依赖，可单元测试。
 */

/** 规范化 base URL，去掉末尾斜杠，并保证指向 /chat/completions 端点。 */
export function buildChatCompletionsUrl(baseUrl: string): string {
	let url = baseUrl.trim().replace(/\/+$/, "");
	if (url.endsWith("/chat/completions")) return url;
	return `${url}/chat/completions`;
}

/** 规范化 base URL，去掉末尾斜杠，指向 /models 端点。 */
export function buildModelsUrl(baseUrl: string): string {
	let url = baseUrl.trim().replace(/\/+$/, "");
	if (url.endsWith("/models")) return url;
	return `${url}/models`;
}
