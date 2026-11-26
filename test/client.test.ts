import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { buildChatCompletionsUrl, buildMessagesUrl, buildModelsUrl, buildResponsesUrl } from "../src/core/aiUrl";
import type { ModelRequest } from "../src/types";

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
	assert.equal(
		buildMessagesUrl("https://api.anthropic.com/v1/messages"),
		"https://api.anthropic.com/v1/messages"
	);
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

// ===== 传输缝：mock transport 后动态 import client =====

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

// ===== ModelRequest 字面量（执行层只消费装配产物，测试手搓各变体） =====

type ChatReq = Extract<ModelRequest, { dialect: "openai"; protocol: "chat-completions" }>;
type ResponsesReq = Extract<ModelRequest, { dialect: "openai"; protocol: "responses" }>;
type AnthropicReq = Extract<ModelRequest, { dialect: "anthropic" }>;

function chatRequest(over: Partial<ChatReq> = {}): ChatReq {
	return {
		dialect: "openai",
		protocol: "chat-completions",
		baseUrl: "https://api.deepseek.com",
		apiKey: "sk-test",
		model: "deepseek-v4-flash",
		messages: [{ role: "user", content: "hi" }],
		maxTokens: 8192,
		timeoutSeconds: 30,
		thinking: null,
		outputField: "max_tokens",
		temperature: 0.7,
		...over,
	};
}

function responsesRequest(over: Partial<ResponsesReq> = {}): ResponsesReq {
	return {
		dialect: "openai",
		protocol: "responses",
		baseUrl: "https://api.openai.com/v1",
		apiKey: "sk-test",
		model: "gpt-5.5-pro",
		messages: [{ role: "user", content: "hi" }],
		maxTokens: 25000,
		timeoutSeconds: 120,
		thinking: null,
		temperature: 0.7,
		...over,
	};
}

function anthropicRequest(over: Partial<AnthropicReq> = {}): AnthropicReq {
	return {
		dialect: "anthropic",
		baseUrl: "https://api.anthropic.com/v1",
		apiKey: "sk-test",
		model: "claude-sonnet-4-6",
		messages: [{ role: "user", content: "hi" }],
		maxTokens: 8192,
		timeoutSeconds: 30,
		thinking: null,
		...over,
	};
}

/** 断言 rejection 是给定 code 的 AIClientError。 */
function assertErrorCode(code: string) {
	return (e: unknown): boolean => {
		assert.ok(e instanceof client.AIClientError);
		assert.equal((e as { code: string }).code, code);
		return true;
	};
}

// ===== listModels =====

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

test("listModels 无请求体不带 Content-Type", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [] } });
	await client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 });
	assert.equal(captured[0].headers["Content-Type"], undefined);
});

test("listModels 响应体不是对象 → AIClientError(models.parse)", async () => {
	const request = async () => ({ status: 200, json: null, text: "" });
	await assert.rejects(
		() => client.listModels({ baseUrl: "https://x.com", apiKey: "sk", timeoutSeconds: 30 }, request),
		assertErrorCode("models.parse")
	);
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

// ===== Chat 变体：报文构造 / 解析 / 错误映射 =====

test("chatCompletion 正常返回模型内容", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "你好" } }] } });
	const result = await client.chatCompletion(chatRequest());
	assert.equal(result.content, "你好");
	const { url, method, body } = captured[0];
	assert.equal(url, "https://api.deepseek.com/chat/completions");
	assert.equal(method, "POST");
	const payload = JSON.parse(body!);
	assert.equal(payload.model, "deepseek-v4-flash");
	assert.equal(payload.messages[0].content, "hi");
	assert.equal(payload.stream, false);
	assert.equal(payload.max_tokens, 8192);
	assert.equal(payload.temperature, 0.7);
	assert.equal(captured[0].headers.Authorization, "Bearer sk-test");
});

test("chatCompletion 携带思考开关参数：单键并入请求体（一次只发一个）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		chatRequest({ thinking: { name: "thinking", value: { type: "disabled" } } })
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
	await client.chatCompletion(chatRequest());
	const payload = JSON.parse(captured[0].body!);
	assert.equal("thinking" in payload, false);
	assert.equal("enable_thinking" in payload, false);
});

test("chatCompletion 温度缺席＝不发（装配已判死）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(chatRequest({ temperature: undefined }));
	assert.equal("temperature" in JSON.parse(captured[0].body!), false);
});

test("chatCompletion 额度字段名随装配定案：max_completion_tokens 时不含 max_tokens", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		chatRequest({ outputField: "max_completion_tokens", maxTokens: 25000, temperature: undefined })
	);
	const payload = JSON.parse(captured[0].body!);
	assert.equal("max_tokens" in payload, false, "官方已弃用 max_tokens");
	assert.equal(payload.max_completion_tokens, 25000);
});

test("假关读面：reasoning_content 残留 → hasReasoning", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: { choices: [{ message: { content: "ok", reasoning_content: "想了一堆" } }] },
	});
	const result = await client.chatCompletion(chatRequest());
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
	assert.equal((await client.chatCompletion(chatRequest())).hasReasoning, true);
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	assert.equal((await client.chatCompletion(chatRequest())).hasReasoning, false);
});

test("chatCompletion 无 apiKey 时不带 Authorization 头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(chatRequest({ apiKey: "" }));
	assert.equal(captured[0].headers.Authorization, undefined);
});

test("chatCompletion 非 2xx 抛出 AIClientError 并含服务端错误信息", async () => {
	await capture();
	respond = () => ({ status: 400, json: { error: { message: "context too long" } } });
	await assert.rejects(() => client.chatCompletion(chatRequest()), (e: unknown) => {
		assert.ok(e instanceof client.AIClientError);
		assert.ok((e as Error).message.includes("context too long"));
		return true;
	});
});

test("chatCompletion 空 choices 抛出 AIClientError", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [] } });
	await assert.rejects(() => client.chatCompletion(chatRequest()), client.AIClientError);
});

test("chatCompletion 带 JSON 内容类型头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(chatRequest());
	assert.equal(captured[0].headers["Content-Type"], "application/json");
});

test("空 choices 与解析异常是可区分的两种错误", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [] } });
	await assert.rejects(() => client.chatCompletion(chatRequest()), assertErrorCode("chat.empty"));
	const malformed = async () => ({ status: 200, json: null, text: "" });
	await assert.rejects(
		() => client.chatCompletion(chatRequest(), malformed),
		assertErrorCode("chat.parse")
	);
});

test("chatCompletion 响应体不是对象 → AIClientError(chat.parse)", async () => {
	const request = async () => ({ status: 200, json: null, text: "" });
	await assert.rejects(() => client.chatCompletion(chatRequest(), request), assertErrorCode("chat.parse"));
});

test("chatCompletion 网络异常 → AIClientError(chat.network)", async () => {
	const request = async (): Promise<{ status: number; json: unknown; text: string }> => {
		throw new Error("boom");
	};
	await assert.rejects(() => client.chatCompletion(chatRequest(), request), assertErrorCode("chat.network"));
});

test("chatCompletion 透传 AIClientError，不被网络错误重包", async () => {
	await capture();
	const original = new client.AIClientError("timeout", { ms: 1234 });
	respond = () => {
		throw original;
	};
	await assert.rejects(() => client.chatCompletion(chatRequest()), (e: unknown) => {
		assert.equal(e, original);
		return true;
	});
});

// ===== Anthropic 变体 =====

test("Anthropic 方言：对话走 /messages，x-api-key + 固定版本头，不发 Authorization", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	await client.chatCompletion(anthropicRequest());
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
	await client.chatCompletion(
		anthropicRequest({
			messages: [
				{ role: "system", content: "be terse" },
				{ role: "user", content: "hi" },
			],
			thinking: { name: "thinking", value: { type: "disabled" } },
		})
	);
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.system, "be terse", "system 消息提升为顶层字段");
	assert.deepEqual(payload.messages, [{ role: "user", content: "hi" }]);
	assert.equal("temperature" in payload, false, "temperature 已从 Anthropic API 删除，不发");
	assert.equal("top_p" in payload, false);
	assert.deepEqual(payload.thinking, { type: "disabled" });
	assert.equal(payload.max_tokens, 8192);
	assert.equal(payload.stream, false);
	assert.equal(payload.model, "claude-sonnet-4-6");
});

test("Anthropic 方言：无认证时不发 x-api-key（版本头仍在）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	await client.chatCompletion(anthropicRequest({ apiKey: "" }));
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
	const result = await client.chatCompletion(anthropicRequest());
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
	assert.equal((await client.chatCompletion(anthropicRequest())).hasReasoning, true);
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "ok" }] } });
	assert.equal((await client.chatCompletion(anthropicRequest())).hasReasoning, false);
});

test("Anthropic 方言：正文为空 → chat.empty（不静默空报告）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { content: [{ type: "text", text: "" }] } });
	await assert.rejects(() => client.chatCompletion(anthropicRequest()), assertErrorCode("chat.empty"));
});

test("Anthropic 方言：content 不是数组（非补全形态）→ chat.parse", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "wrong shape" } }] } });
	await assert.rejects(() => client.chatCompletion(anthropicRequest()), assertErrorCode("chat.parse"));
});

test("Anthropic 方言：服务端错误详情原样带出（错误体与 OpenAI 同形）", async () => {
	await capture();
	respond = () => ({ status: 400, json: { error: { message: "invalid x-api-key" } } });
	await assert.rejects(() => client.chatCompletion(anthropicRequest()), (e: unknown) => {
		assert.ok(e instanceof client.AIClientError);
		assert.equal((e as { code: string }).code, "chat.http");
		assert.ok((e as Error).message.includes("invalid x-api-key"));
		return true;
	});
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

// ===== Responses 变体（#110） =====

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
	const result = await client.chatCompletion(
		responsesRequest({
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "hi" },
			],
			temperature: undefined,
		})
	);
	assert.equal(captured[0].url, "https://api.openai.com/v1/responses");
	const payload = JSON.parse(captured[0].body!);
	assert.equal("messages" in payload, false, "Responses 用 input");
	assert.deepEqual(payload.input, [
		{ role: "system", content: "sys" },
		{ role: "user", content: "hi" },
	], "纯文本消息原样复用（system 角色留在原位）");
	assert.equal(payload.max_output_tokens, 25000);
	assert.equal("max_tokens" in payload, false);
	assert.equal("max_completion_tokens" in payload, false);
	assert.equal(payload.store, false, "无状态：任务数据不被上游保存");
	assert.equal(payload.stream, false);
	assert.equal("temperature" in payload, false, "装配判死温度 ⇒ 不发");
	assert.equal(result.content, "报告正文");
	assert.equal(result.hasReasoning, true, "usage 的 reasoning_tokens 是推理段读面");
});

test("Responses 协议：思考发嵌套 reasoning.effort；温度在场时照发", async () => {
	await capture();
	respond = () => ({ status: 200, json: { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] } });
	await client.chatCompletion(
		responsesRequest({ thinking: { name: "reasoning", value: { effort: "none" } }, temperature: 0.7 })
	);
	const payload = JSON.parse(captured[0].body!);
	assert.deepEqual(payload.reasoning, { effort: "none" }, "开关是嵌套 reasoning.effort");
	assert.equal("reasoning_effort" in payload, false, "顶层字段不属于 Responses");
	assert.equal(payload.temperature, 0.7);
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
	const result = await client.chatCompletion(responsesRequest());
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
	await assert.rejects(() => client.chatCompletion(responsesRequest()), assertErrorCode("chat.empty"));
});

test("Responses 读取：output 不是数组 → chat.parse（200 不是证据）", async () => {
	await capture();
	respond = () => ({ status: 200, json: { error: { message: "gateway shape" } } });
	await assert.rejects(() => client.chatCompletion(responsesRequest()), assertErrorCode("chat.parse"));
});

test("Chat 路径零变更：chat 变体仍走 chat/completions", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "ok" } }] } });
	await client.chatCompletion(
		chatRequest({ baseUrl: "https://api.openai.com/v1", model: "gpt-6.2-astra", outputField: "max_completion_tokens", maxTokens: 25000, temperature: undefined })
	);
	assert.equal(captured[0].url, "https://api.openai.com/v1/chat/completions");
	const payload = JSON.parse(captured[0].body!);
	assert.ok(Array.isArray(payload.messages));
	assert.equal(payload.max_completion_tokens, 25000);
});

// ===== 微型探测：读面与分派（请求已由装配定给，不测策略算术） =====

test("OpenAI 探测：reasoning_content 残留 → reasoning-present；请求走 chat 变体", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: { choices: [{ message: { content: "2", reasoning_content: "想想" } }] },
	});
	const outcome = await client.thinkingProbe(
		chatRequest({ messages: [{ role: "user", content: "1+1=?" }], maxTokens: 256, temperature: 0 })
	);
	assert.equal(outcome, "reasoning-present");
	assert.equal(captured[0].url, "https://api.deepseek.com/chat/completions");
	assert.equal(JSON.parse(captured[0].body!).max_tokens, 256);
});

test("OpenAI 探测：响应体不是对话补全体 → 中断（chat.parse 不是探测信号）", async () => {
	await capture();
	respond = () => ({ status: 200, json: {} });
	assert.equal(await client.thinkingProbe(chatRequest({ maxTokens: 256 })), "interrupted");
});

test("OpenAI 探测：400 → rejected（字段不适用是探测信号）", async () => {
	await capture();
	respond = () => ({ status: 400, json: { error: { message: "unsupported field" } } });
	assert.equal(await client.thinkingProbe(chatRequest({ maxTokens: 256 })), "rejected");
});

test("Responses 探测：读 output 的 reasoning 项；请求走 /responses", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: {
			output: [
				{ type: "reasoning", summary: [] },
				{ type: "message", content: [{ type: "output_text", text: "2" }] },
			],
		},
	});
	const outcome = await client.thinkingProbe(
		responsesRequest({ thinking: { name: "reasoning", value: { effort: "none" } }, maxTokens: 256, temperature: 0 })
	);
	assert.equal(outcome, "reasoning-present");
	assert.equal(captured[0].url, "https://api.openai.com/v1/responses");
	const payload = JSON.parse(captured[0].body!);
	assert.equal(payload.max_output_tokens, 256);
	assert.equal(payload.store, false);
	assert.deepEqual(payload.reasoning, { effort: "none" });
});

test("Responses 探测：output 不是数组 → 中断", async () => {
	await capture();
	respond = () => ({ status: 200, json: {} });
	assert.equal(await client.thinkingProbe(responsesRequest({ maxTokens: 256 })), "interrupted");
});

test("Anthropic 探测：读 content[] 的思考块；不发温度", async () => {
	await capture();
	respond = () => ({
		status: 200,
		json: { content: [{ type: "thinking", thinking: "想想" }, { type: "text", text: "2" }] },
	});
	const outcome = await client.thinkingProbe(
		anthropicRequest({ thinking: { name: "thinking", value: { type: "disabled" } }, maxTokens: 256 })
	);
	assert.equal(outcome, "reasoning-present");
	const payload = JSON.parse(captured[0].body!);
	assert.equal("temperature" in payload, false);
	assert.equal(payload.max_tokens, 256);
	assert.deepEqual(payload.thinking, { type: "disabled" });
});

test("Anthropic 探测：content 不是数组 → 中断", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [] } });
	assert.equal(await client.thinkingProbe(anthropicRequest({ maxTokens: 256 })), "interrupted");
});
