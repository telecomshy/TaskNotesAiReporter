import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { buildChatCompletionsUrl, buildMessagesUrl, buildModelsUrl, buildResponsesUrl } from "../src/core/aiUrl";
import { EMPTY_REQUEST_POLICY, OPENAI_REQUEST_POLICY } from "../src/core/requestPolicy";

// ===== URL 拼接（纯函数，原有用例保留） =====

test("buildChatCompletionsUrl 拼接端点", () => {
	assert.equal(
		buildChatCompletionsUrl("https://api.deepseek.com"),
		"https://api.deepseek.com/chat/completions"
	);
	assert.equal(
		buildChatCompletionsUrl("https://api.deepseek.com/v1"),
		"https://api.deepseek.com/v1/chat/completions"
	);
	assert.equal(
		buildChatCompletionsUrl("https://api.deepseek.com/chat/completions"),
		"https://api.deepseek.com/chat/completions"
	);
});

test("buildModelsUrl 拼接端点", () => {
	assert.equal(buildModelsUrl("https://api.deepseek.com"), "https://api.deepseek.com/models");
	assert.equal(
		buildModelsUrl("https://api.deepseek.com/v1/"),
		"https://api.deepseek.com/v1/models"
	);
	assert.equal(
		buildModelsUrl("https://api.deepseek.com/models"),
		"https://api.deepseek.com/models"
	);
});

test("buildMessagesUrl 拼接 Anthropic Messages 端点：不自动补 /v1（哑函数）", () => {
	assert.equal(buildMessagesUrl("https://api.anthropic.com/v1"), "https://api.anthropic.com/v1/messages");
	assert.equal(
		buildMessagesUrl("https://api.anthropic.com/v1/"),
		"https://api.anthropic.com/v1/messages"
	);
	// 已以 /messages 结尾：原样使用（不重复拼接）
	assert.equal(
		buildMessagesUrl("https://api.anthropic.com/v1/messages"),
		"https://api.anthropic.com/v1/messages"
	);
	// 裸域名不自动插 /v1（地址由用户负责，见 #105 裁决 5）
	assert.equal(buildMessagesUrl("https://gateway.example.com"), "https://gateway.example.com/messages");
});

test("buildResponsesUrl 拼接 Responses 端点：同样不自动补 /v1（哑函数）", () => {
	assert.equal(buildResponsesUrl("https://api.openai.com/v1"), "https://api.openai.com/v1/responses");
	assert.equal(buildResponsesUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1/responses");
	assert.equal(
		buildResponsesUrl("https://api.openai.com/v1/responses"),
		"https://api.openai.com/v1/responses"
	);
	assert.equal(buildResponsesUrl("https://gateway.example.com"), "https://gateway.example.com/responses");
});

// ===== chatCompletion / listModels（通过 mock transport） =====

interface CapturedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

const transportPath = new URL("../src/ai/transport.ts", import.meta.url).href;

type Client = typeof import("../src/ai/client");
let client: Client;
let captured: CapturedRequest[] = [];
let respond: (req: CapturedRequest) => unknown;

before(async () => {
	mock.module(transportPath, {
		defaultExport: {
			requestUrlTransport: async (req: CapturedRequest) => {
				captured.push(req);
				const body: any = respond(req) ?? {};
				return {
					status: (body?.status as number) ?? 200,
					json: body?.json ?? {},
					text: typeof body?.text === "string" ? body.text : "",
				};
			},
		},
	});
	client = await import("../src/ai/client");
});

/** 重置捕获与默认响应（每个 test 开头调用） */
async function capture(): Promise<void> {
	captured = [];
	respond = () => ({});
}

const config = {
	baseUrl: "https://api.deepseek.com",
	apiKey: "sk-test",
	model: "deepseek-v4-flash",
	temperature: 0.7,
	maxTokens: 8192,
	timeoutSeconds: 30,
};

/** 断言 rejection 是给定 code 的 AIClientError。 */
function assertErrorCode(code: string) {
	return (e: unknown): boolean => {
		assert.ok(e instanceof client.AIClientError);
		assert.equal((e as { code: string }).code, code);
		return true;
	};
}

test("listModels 正常返回模型 ID 列表", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [{ id: "a" }, { id: "b" }, { id: "" }] } });
	const models = await client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 });
	assert.deepEqual(models, ["a", "b"]);
	assert.equal(captured[0].url, "https://x.com/models");
	assert.equal(captured[0].method, "GET");
	assert.equal(captured[0].headers.Authorization, "Bearer sk");
});

test("listModels 兼容 models 字段", async () => {
	await capture();
	respond = () => ({ status: 200, json: { models: [{ id: "m1" }] } });
	const models = await client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 });
	assert.deepEqual(models, ["m1"]);
});

test("listModels 无 apiKey 时不带 Authorization 头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [{ id: "m1" }] } });
	await client.listModels({ baseUrl: "https://x.com", apiKey: "   ", timeoutSeconds: 30 });
	assert.equal(captured[0].headers.Authorization, undefined);
});

test("listModels 非 2xx 抛出 AIClientError 并含服务端错误信息", async () => {
	await capture();
	respond = () => ({ status: 401, json: { error: { message: "invalid key" } } });
	await assert.rejects(() => client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 }), (e: unknown) => {
		assert.ok(e instanceof client.AIClientError);
		assert.ok((e as Error).message.includes("invalid key"));
		return true;
	});
});

test("listModels 响应无 data/models 时返回空数组", async () => {
	await capture();
	respond = () => ({ status: 200, json: { unexpected: [] } });
	const models = await client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 });
	assert.deepEqual(models, []);
});

test("chatCompletion 正常返回模型内容", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "你好" } }] } });
	const result = await client.chatCompletion(config, [{ role: "user", content: "hi" }]);
	assert.equal(result.content, "你好");
	const { url, method, body } = captured[0];
	assert.equal(url, "https://api.deepseek.com/chat/completions");
	assert.equal(method, "POST");
	const payload = JSON.parse(body!);
	assert.equal(payload.model, "deepseek-v4-flash");
	assert.equal(payload.messages[0].content, "hi");
	assert.equal(payload.stream, false);
	assert.equal(payload.max_tokens, 8192);
	assert.equal(captured[0].headers.Authorization, "Bearer sk-test");
});

test("chatCompletion 携带思考开关参数：单键并入请求体（一次只发一个）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		{ ...config, thinking: { name: "thinking", value: { type: "disabled" } } },
		[{ role: "user", content: "hi" }]
	);
	const payload = JSON.parse(captured[0].body!);
	assert.deepEqual(payload.thinking, { type: "disabled" });
	const known = ["model", "messages", "temperature", "max_tokens", "stream", "thinking"];
	assert.deepEqual(
		Object.keys(payload).filter((k) => !known.includes(k)),
		[],
		"思考参数之外不再夹带其它开关字段"
	);
});

test("chatCompletion 未带思考参数：请求体不含任何思考字段", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(config, [{ role: "user", content: "hi" }]);
	const payload = JSON.parse(captured[0].body!);
	assert.equal("thinking" in payload, false);
	assert.equal("enable_thinking" in payload, false);
});

test("假关读面：reasoning_content 残留 → hasReasoning", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: { choices: [{ message: { content: "ok", reasoning_content: "想了一堆" } }] },
	});
	const result = await client.chatCompletion(config, [{ role: "user", content: "hi" }]);
	assert.equal(result.hasReasoning, true);
});

test("假关读面：reasoning_tokens 计量残留 → hasReasoning；两者皆无 → false", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			choices: [{ message: { content: "ok" } }],
			usage: { completion_tokens_details: { reasoning_tokens: 12 } },
		},
	});
	assert.equal(
		(await client.chatCompletion(config, [{ role: "user", content: "hi" }])).hasReasoning,
		true
	);
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	assert.equal(
		(await client.chatCompletion(config, [{ role: "user", content: "hi" }])).hasReasoning,
		false
	);
});

test("chatCompletion 无 apiKey 时不带 Authorization 头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion({ ...config, apiKey: "" }, [{ role: "user", content: "hi" }]);
	assert.equal(captured[0].headers.Authorization, undefined);
});

test("chatCompletion maxTokens 超上限被钳制到 384K", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion({ ...config, maxTokens: 999999 }, [{ role: "user", content: "hi" }]);
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.max_tokens, 384 * 1024);
});

test("chatCompletion 非 2xx 抛出 AIClientError 并含服务端错误信息", async () => {
	await capture();
	respond = () => ({ status: 400, json: { error: { message: "context too long" } } });
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }]),
		(e: unknown) => {
			assert.ok(e instanceof client.AIClientError);
			assert.ok((e as Error).message.includes("context too long"));
			return true;
		}
	);
});

test("chatCompletion 空 choices 抛出 AIClientError", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [] } });
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }]),
		client.AIClientError
	);
});

test("chatCompletion 带 JSON 内容类型头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(config, [{ role: "user", content: "hi" }]);
	assert.equal(captured[0].headers["Content-Type"], "application/json");
});

// ===== 接口方言（#105）：Anthropic 原生 Messages =====

const anthropicConfig = {
	...config,
	apiStyle: "anthropic" as const,
	baseUrl: "https://api.anthropic.com/v1",
	model: "claude-sonnet-4-6",
};

test("Anthropic 方言：对话走 /messages，x-api-key + 固定版本头，不发 Authorization", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	await client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }]);
	const { url, method, headers } = captured[0];
	assert.equal(url, "https://api.anthropic.com/v1/messages");
	assert.equal(method, "POST");
	assert.equal(headers["x-api-key"], "sk-test");
	assert.equal(headers["anthropic-version"], "2026-10-21");
	assert.equal(headers.Authorization, undefined, "Anthropic 方言不发 Bearer");
});

test("Anthropic 方言：请求体不发温度、max_tokens 必发、system 提升为顶层", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	await client.chatCompletion(anthropicConfig, [
		{ role: "system", content: "be terse" },
		{ role: "user", content: "hi" },
	]);
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.system, "be terse", "system 消息提升为顶层字段");
	assert.deepEqual(payload.messages, [{ role: "user", content: "hi" }]);
	assert.equal("temperature" in payload, false, "temperature 已从 Anthropic API 删除，不发");
	assert.equal("top_p" in payload, false);
	assert.equal(payload.max_tokens, 8192);
	assert.equal(payload.stream, false);
	assert.equal(payload.model, "claude-sonnet-4-6");
});

test("Anthropic 方言：无认证时不发 x-api-key（版本头仍在）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	await client.chatCompletion({ ...anthropicConfig, apiKey: "" }, [{ role: "user", content: "hi" }]);
	assert.equal(captured[0].headers["x-api-key"], undefined);
	assert.equal(captured[0].headers["anthropic-version"], "2026-10-21");
});

test("Anthropic 方言：正文由 content[] 所有 text 块拼成；思考块 → hasReasoning", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			content: [
				{ type: "thinking", thinking: "想了一堆" },
				{ type: "text", text: "第一段" },
				{ type: "text", text: "第二段" },
			],
		},
	});
	const result = await client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }]);
	assert.equal(result.content, "第一段第二段");
	assert.equal(result.hasReasoning, true, "非空思考块即推理段读面");
});

test("Anthropic 方言：thinking_tokens 计量 → hasReasoning；无思考块且无计量 → false", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			content: [{ type: "text", text: "ok" }],
			usage: { output_tokens_details: { thinking_tokens: 12 } },
		},
	});
	assert.equal(
		(await client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }])).hasReasoning,
		true
	);
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	assert.equal(
		(await client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }])).hasReasoning,
		false
	);
});

test("Anthropic 方言：正文为空 → chat.empty（不静默空报告）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "" }] } });
	await assert.rejects(
		() => client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }]),
		assertErrorCode("chat.empty")
	);
});

test("Anthropic 方言：content 不是数组（非补全形态）→ chat.parse", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "wrong shape" } }] } });
	await assert.rejects(
		() => client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }]),
		assertErrorCode("chat.parse")
	);
});

test("Anthropic 方言：服务端错误详情原样带出（错误体与 OpenAI 同形）", async () => {
	await capture();
	respond = () => ({ status: 400, json: { error: { message: "invalid x-api-key" } } });
	await assert.rejects(
		() => client.chatCompletion(anthropicConfig, [{ role: "user", content: "hi" }]),
		(e: unknown) => {
			assert.ok(e instanceof client.AIClientError);
			assert.equal((e as { code: string }).code, "chat.http");
			assert.ok((e as Error).message.includes("invalid x-api-key"));
			return true;
		}
	);
});

test("Anthropic 方言：listModels 带版本头与 limit=100，同一页读 data[].id", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: { data: [{ id: "claude-opus-4-7" }, { id: "claude-sonnet-4-6" }], has_more: false, last_id: "x" },
	});
	const models = await client.listModels({
		baseUrl: "https://api.anthropic.com/v1",
		apiKey: "sk",
		timeoutSeconds: 30,
		apiStyle: "anthropic",
	});
	assert.deepEqual(models, ["claude-opus-4-7", "claude-sonnet-4-6"]);
	assert.equal(captured[0].url, "https://api.anthropic.com/v1/models?limit=100");
	assert.equal(captured[0].headers["x-api-key"], "sk");
	assert.equal(captured[0].headers["anthropic-version"], "2026-10-21");
	assert.equal(captured[0].headers.Authorization, undefined);
});

test("listModels 无请求体不带 Content-Type", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [] } });
	await client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 });
	assert.equal(captured[0].headers["Content-Type"], undefined);
});

test("空 choices 与解析异常是可区分的两种错误", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [] } });
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }]),
		assertErrorCode("chat.empty")
	);
	const malformed = async () => ({ status: 200, json: null, text: "" });
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }], malformed),
		assertErrorCode("chat.parse")
	);
});

test("chatCompletion 响应体不是对象 → AIClientError(chat.parse)", async () => {
	const request = async () => ({ status: 200, json: null, text: "" });
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }], request),
		assertErrorCode("chat.parse")
	);
});

test("listModels 响应体不是对象 → AIClientError(models.parse)", async () => {
	const request = async () => ({ status: 200, json: null, text: "" });
	await assert.rejects(
		() => client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 }, request),
		assertErrorCode("models.parse")
	);
});

test("chatCompletion 网络异常 → AIClientError(chat.network)", async () => {
	const request = async (): Promise<{ status: number; json: unknown; text: string }> => {
		throw new Error("boom");
	};
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }], request),
		assertErrorCode("chat.network")
	);
});

test("testConnection 发送 ping 并成功返回", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "pong" } }] } });
	await client.testConnection(config);
	assert.equal(JSON.parse(captured[0].body!).messages[0].content, "ping");
});

test("listModels 透传 AIClientError，不被网络错误重包", async () => {
	await capture();
	const original = new client.AIClientError("timeout", { ms: 1234 });
	respond = () => {
		throw original;
	};
	await assert.rejects(() => client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 }), (e: unknown) => {
		assert.equal(e, original);
		return true;
	});
});

test("chatCompletion 透传 AIClientError，不被网络错误重包", async () => {
	await capture();
	const original = new client.AIClientError("timeout", { ms: 1234 });
	respond = () => {
		throw original;
	};
	await assert.rejects(
		() => client.chatCompletion(config, [{ role: "user", content: "hi" }]),
		(e: unknown) => {
			assert.equal(e, original);
			return true;
		}
	);
});

// ===== 模型请求策略（#106，ADR-0030）：OpenAI 预设的请求形态 =====

const openAIConfig = {
	...config,
	baseUrl: "https://api.openai.com/v1",
	model: "gpt-5.6-sol",
};

test("OpenAI 预设：发 max_completion_tokens、不发 max_tokens；omit-unless-none 且无 effort 时温度不发", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion({ ...openAIConfig, requestPolicy: OPENAI_REQUEST_POLICY }, [
		{ role: "user", content: "hi" },
	]);
	const payload = JSON.parse(captured[0].body!);
	assert.equal("max_tokens" in payload, false, "官方已弃用 max_tokens");
	assert.equal(payload.max_completion_tokens, 25000, "推理族预算取下限 25,000（配置 8192 被抬高）");
	assert.equal("temperature" in payload, false, "未发 reasoning_effort ⇒ 默认 medium，温度不合法");
	assert.equal(payload.stream, false);
});

test("OpenAI 预设：omit-unless-none 族在生效 effort 为 none 时温度照发", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		{
			...openAIConfig,
			requestPolicy: OPENAI_REQUEST_POLICY,
			thinking: { name: "reasoning_effort", value: "none" },
		},
		[{ role: "user", content: "hi" }]
	);
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.temperature, 0.7, "关（none）时温度合法");
	assert.equal(payload.reasoning_effort, "none");
	assert.equal(payload.max_completion_tokens, 25000);
});

test("OpenAI 预设：omit-always 族永不发温度（即便 effort=none）；思考参数形状不变", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		{
			...openAIConfig,
			model: "gpt-6.2-astra",
			requestPolicy: { ...OPENAI_REQUEST_POLICY, temperature: "omit-always" },
			thinking: { name: "reasoning_effort", value: "none" },
		},
		[{ role: "user", content: "hi" }]
	);
	const payload = JSON.parse(captured[0].body!);
	assert.equal("temperature" in payload, false);
	assert.equal(payload.reasoning_effort, "none");
});

test("策略预算：无下限行（非推理老模型）取全局值；配置更大时用户设置优先；仍钳制 384K", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	const legacyPolicy = {
		outputField: "max_completion_tokens" as const,
		temperature: "send" as const,
		minMaxTokens: 0,
		minTimeoutSeconds: 120,
	};
	await client.chatCompletion({ ...openAIConfig, model: "gpt-4.1", requestPolicy: legacyPolicy }, [
		{ role: "user", content: "hi" },
	]);
	assert.equal(JSON.parse(captured[0].body!).max_completion_tokens, 8192, "非推理族不为下限多花钱");

	await client.chatCompletion({ ...openAIConfig, maxTokens: 400000, requestPolicy: legacyPolicy }, [
		{ role: "user", content: "hi" },
	]);
	assert.equal(JSON.parse(captured[captured.length - 1].body!).max_completion_tokens, 384 * 1024, "钳制上限仍 384K");
});

test("策略预算：用户配置大于 25k 时优先（下限不压回）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		{ ...openAIConfig, maxTokens: 30000, requestPolicy: OPENAI_REQUEST_POLICY },
		[{ role: "user", content: "hi" }]
	);
	assert.equal(JSON.parse(captured[0].body!).max_completion_tokens, 30000);
});

test("策略超时：max(全局超时, 下限)——用户全局更大时用户优先（错误里带实际毫秒数）", async () => {
	await capture();
	const request = () => new Promise<{ status: number; json: unknown; text: string }>(() => {});
	await assert.rejects(
		() =>
			client.chatCompletion(
				{
					...openAIConfig,
					timeoutSeconds: 0.5,
					requestPolicy: { ...OPENAI_REQUEST_POLICY, minTimeoutSeconds: 0.02 },
				},
				[{ role: "user", content: "hi" }],
				request
			),
		(e: unknown) => {
			assert.ok(e instanceof client.AIClientError);
			assert.equal((e as { code: string }).code, "timeout");
			assert.equal((e as { details: { ms: number } }).details.ms, 500, "取全局 0.5 秒而非下限 20ms");
			return true;
		}
	);
});

test("策略超时：max(全局超时, 下限)——下限更大时生效（错误里带实际毫秒数）", async () => {
	await capture();
	const request = () => new Promise<{ status: number; json: unknown; text: string }>(() => {});
	await assert.rejects(
		() =>
			client.chatCompletion(
				{
					...openAIConfig,
					timeoutSeconds: 0.02,
					requestPolicy: { ...OPENAI_REQUEST_POLICY, minTimeoutSeconds: 1 },
				},
				[{ role: "user", content: "hi" }],
				request
			),
		(e: unknown) => {
			assert.ok(e instanceof client.AIClientError);
			assert.equal((e as { code: string }).code, "timeout");
			assert.equal((e as { details: { ms: number } }).details.ms, 1000, "取策略下限 1 秒而非 20ms");
			return true;
		}
	);
});

test("四家国产预设零变更：空策略下仍发 max_tokens 与温度，不发 max_completion_tokens", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	const presets = [
		{ id: "deepseek", baseUrl: "https://api.deepseek.com" },
		{ id: "qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
		{ id: "kimi", baseUrl: "https://api.moonshot.cn/v1" },
		{ id: "minimax", baseUrl: "https://api.minimax.chat/v1" },
	];
	for (const preset of presets) {
		await client.chatCompletion(
			{
				...config,
				baseUrl: preset.baseUrl,
				requestPolicy: { ...EMPTY_REQUEST_POLICY },
			},
			[{ role: "user", content: "hi" }]
		);
	}
	assert.equal(captured.length, presets.length);
	const payload = JSON.parse(captured[captured.length - 1].body!);
	assert.deepEqual(Object.keys(payload).sort(), [
		"max_tokens",
		"messages",
		"model",
		"stream",
		"temperature",
	], "四家国产预设的请求体逐字段不变（无策略字段夹带）");
	assert.equal(payload.max_tokens, 8192);
	assert.equal(payload.temperature, 0.7);
	assert.equal(payload.model, "deepseek-v4-flash");
	assert.deepEqual(payload.messages, [{ role: "user", content: "hi" }]);
	assert.equal(payload.stream, false);
	for (const [index, preset] of presets.entries()) {
		assert.deepEqual(JSON.parse(captured[index].body!), payload, `${preset.id}：请求体逐字段一致`);
	}
});

test("思考测试微型请求遵守策略：max_completion_tokens 恒 256（不受 25k 下限影响）、温度按规则不发", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "2" } }] } });
	await client.thinkingProbe(
		{
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk",
			model: "gpt-5.6-sol",
			timeoutSeconds: 30,
			requestPolicy: OPENAI_REQUEST_POLICY,
		},
		null
	);
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.max_completion_tokens, 256, "探测恒定 256");
	assert.equal("max_tokens" in payload, false);
	assert.equal("temperature" in payload, false, "基线不发 effort ⇒ 温度不发");
});

test("思考测试微型请求：探 reasoning_effort:none 时温度照发（同一套策略）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "2" } }] } });
	await client.thinkingProbe(
		{
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk",
			model: "gpt-5.2",
			timeoutSeconds: 30,
			requestPolicy: OPENAI_REQUEST_POLICY,
		},
		{ name: "reasoning_effort", value: "none" }
	);
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.reasoning_effort, "none");
	assert.equal(payload.temperature, 0);
	assert.equal(payload.max_completion_tokens, 256);
});

// ===== 接口协议（#110，ADR-0031）：Responses 的请求形态与读取面 =====

const responsesConfig = {
	...openAIConfig,
	model: "gpt-5.5-pro",
	protocol: "responses" as const,
	requestPolicy: OPENAI_REQUEST_POLICY,
};

test("Responses 协议：发 input / max_output_tokens / store:false；无 messages 与两个 chat 额度字段", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			status: "completed",
			output: [{ type: "message", content: [{ type: "output_text", text: "报告正文" }] }],
			usage: { output_tokens_details: { reasoning_tokens: 12 } },
		},
	});
	const result = await client.chatCompletion(responsesConfig, [
		{ role: "system", content: "sys" },
		{ role: "user", content: "hi" },
	]);
	assert.equal(captured[0].url, "https://api.openai.com/v1/responses");
	const payload = JSON.parse(captured[0].body!);
	assert.equal("messages" in payload, false, "Responses 用 input");
	assert.deepEqual(payload.input, [
		{ role: "system", content: "sys" },
		{ role: "user", content: "hi" },
	], "纯文本消息原样复用（system 角色留在原位）");
	assert.equal(payload.max_output_tokens, 25000, "预算取下限 25,000");
	assert.equal("max_tokens" in payload, false);
	assert.equal("max_completion_tokens" in payload, false);
	assert.equal(payload.store, false, "无状态：任务数据不被上游保存");
	assert.equal(payload.stream, false);
	assert.equal("temperature" in payload, false, "无 effort ⇒ 默认 medium，温度不合法");
	assert.equal(result.content, "报告正文");
	assert.equal(result.hasReasoning, true, "usage 的 reasoning_tokens 是推理段读面");
});

test("Responses 协议：思考发嵌套 reasoning.effort；omit-unless-none 在 none 时温度照发", async () => {
	await capture();
	respond = () => ({ status: 200, json: { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] } });
	await client.chatCompletion(
		{ ...responsesConfig, thinking: { name: "reasoning", value: { effort: "none" } } },
		[{ role: "user", content: "hi" }]
	);
	const payload = JSON.parse(captured[0].body!);
	assert.deepEqual(payload.reasoning, { effort: "none" }, "开关是嵌套 reasoning.effort");
	assert.equal("reasoning_effort" in payload, false, "顶层字段不属于 Responses");
	assert.equal(payload.temperature, 0.7, "生效 effort=none ⇒ 温度合法");
});

test("Responses 读取：多个 message 项与多个 output_text 块按换行拼接；reasoning 项即推理段", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			output: [
				{ type: "reasoning", summary: [] },
				{ type: "message", content: [{ type: "output_text", text: "A" }, { type: "output_text", text: "B" }] },
				{ type: "message", content: [{ type: "output_text", text: "C" }] },
			],
		},
	});
	const result = await client.chatCompletion(responsesConfig, [{ role: "user", content: "hi" }]);
	assert.equal(result.content, "AB\nC");
	assert.equal(result.hasReasoning, true, "reasoning 项（即便 summary 为空）即推理证据");
});

test("Responses 读取：只推理无正文（incomplete）归空回复，不新增错误码", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
			output: [{ type: "reasoning", summary: [] }],
		},
	});
	await assert.rejects(
		() => client.chatCompletion(responsesConfig, [{ role: "user", content: "hi" }]),
		assertErrorCode("chat.empty")
	);
});

test("Responses 读取：output 不是数组 → chat.parse（200 不是证据）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { error: { message: "gateway shape" } } });
	await assert.rejects(
		() => client.chatCompletion(responsesConfig, [{ role: "user", content: "hi" }]),
		assertErrorCode("chat.parse")
	);
});

test("Responses 微型探测：同一请求构造、预算恒 256；读 output 的 reasoning 项", async () => {
	await capture();
	respond = () => ({ status: 200, json: { output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: "2" }] }] } });
	const outcome = await client.thinkingProbe(
		{
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk",
			model: "gpt-5.5-pro",
			protocol: "responses",
			timeoutSeconds: 30,
			requestPolicy: OPENAI_REQUEST_POLICY,
		},
		{ name: "reasoning", value: { effort: "none" } }
	);
	assert.equal(outcome, "reasoning-present");
	const payload = JSON.parse(captured[0].body!);
	assert.equal(captured[0].url, "https://api.openai.com/v1/responses");
	assert.equal(payload.max_output_tokens, 256, "探测恒定 256，不受下限影响");
	assert.equal("max_tokens" in payload, false);
	assert.equal(payload.store, false);
	assert.deepEqual(payload.reasoning, { effort: "none" });
	assert.equal(payload.temperature, 0, "生效 effort=none ⇒ 探测温度照发（同一套策略）");
});

test("Responses 微型探测：output 不是数组 → 中断（chat.parse 不是探测信号）", async () => {
	await capture();
	respond = () => ({ status: 200, json: {} });
	const outcome = await client.thinkingProbe(
		{
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk",
			model: "gpt-5.5-pro",
			protocol: "responses",
			timeoutSeconds: 30,
			requestPolicy: OPENAI_REQUEST_POLICY,
		},
		null
	);
	assert.equal(outcome, "interrupted");
});

test("Chat 路径零变更：未带 protocol 时仍走 chat/completions（#110 只在必需时切换）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion({ ...openAIConfig, model: "gpt-6.2-astra", requestPolicy: OPENAI_REQUEST_POLICY }, [
		{ role: "user", content: "hi" },
	]);
	assert.equal(captured[0].url, "https://api.openai.com/v1/chat/completions");
	const payload = JSON.parse(captured[0].body!);
	assert.ok(Array.isArray(payload.messages));
	assert.equal(payload.max_completion_tokens, 25000);
});
