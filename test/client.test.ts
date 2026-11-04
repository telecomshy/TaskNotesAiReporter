import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { buildChatCompletionsUrl, buildModelsUrl } from "../src/core/aiUrl";

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
	const models = await client.listModels("https://x.com", "sk", 30);
	assert.deepEqual(models, ["a", "b"]);
	assert.equal(captured[0].url, "https://x.com/models");
	assert.equal(captured[0].method, "GET");
	assert.equal(captured[0].headers.Authorization, "Bearer sk");
});

test("listModels 兼容 models 字段", async () => {
	await capture();
	respond = () => ({ status: 200, json: { models: [{ id: "m1" }] } });
	const models = await client.listModels("https://x.com", "sk", 30);
	assert.deepEqual(models, ["m1"]);
});

test("listModels 无 apiKey 时不带 Authorization 头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [{ id: "m1" }] } });
	await client.listModels("https://x.com", "   ", 30);
	assert.equal(captured[0].headers.Authorization, undefined);
});

test("listModels 非 2xx 抛出 AIClientError 并含服务端错误信息", async () => {
	await capture();
	respond = () => ({ status: 401, json: { error: { message: "invalid key" } } });
	await assert.rejects(() => client.listModels("https://x.com", "sk", 30), (e: unknown) => {
		assert.ok(e instanceof client.AIClientError);
		assert.ok((e as Error).message.includes("invalid key"));
		return true;
	});
});

test("listModels 响应无 data/models 时返回空数组", async () => {
	await capture();
	respond = () => ({ status: 200, json: { unexpected: [] } });
	const models = await client.listModels("https://x.com", "sk", 30);
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

test("listModels 无请求体不带 Content-Type", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [] } });
	await client.listModels("https://x.com", "sk", 30);
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
		() => client.listModels("https://x.com", "sk", 30, request),
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
	await assert.rejects(() => client.listModels("https://x.com", "sk", 30), (e: unknown) => {
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
