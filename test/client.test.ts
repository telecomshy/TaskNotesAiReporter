import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
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

const transportPath = pathToFileURL(
	"E:/code/my_projects/TaskNotesAiReporter/src/ai/transport.ts"
).href;

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

test("listModels 正常返回模型 ID 列表", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [{ id: "a" }, { id: "b" }, { id: "" }] } });
	const models = await client.listModels("https://x.com", "sk");
	assert.deepEqual(models, ["a", "b"]);
	assert.equal(captured[0].url, "https://x.com/models");
	assert.equal(captured[0].method, "GET");
	assert.equal(captured[0].headers.Authorization, "Bearer sk");
});

test("listModels 兼容 models 字段", async () => {
	await capture();
	respond = () => ({ status: 200, json: { models: [{ id: "m1" }] } });
	const models = await client.listModels("https://x.com", "sk");
	assert.deepEqual(models, ["m1"]);
});

test("listModels 无 apiKey 时不带 Authorization 头", async () => {
	await capture();
	respond = () => ({ status: 200, json: { data: [{ id: "m1" }] } });
	await client.listModels("https://x.com", "   ");
	assert.equal(captured[0].headers.Authorization, undefined);
});

test("listModels 非 2xx 抛出 AIClientError 并含服务端错误信息", async () => {
	await capture();
	respond = () => ({ status: 401, json: { error: { message: "invalid key" } } });
	await assert.rejects(() => client.listModels("https://x.com", "sk"), (e: unknown) => {
		assert.ok(e instanceof client.AIClientError);
		assert.ok((e as Error).message.includes("invalid key"));
		return true;
	});
});

test("listModels 响应无 data/models 时返回空数组", async () => {
	await capture();
	respond = () => ({ status: 200, json: { unexpected: [] } });
	const models = await client.listModels("https://x.com", "sk");
	assert.deepEqual(models, []);
});

test("chatCompletion 正常返回模型内容", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "你好" } }] } });
	const content = await client.chatCompletion(config, [{ role: "user", content: "hi" }]);
	assert.equal(content, "你好");
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

test("testConnection 发送 ping 并成功返回", async () => {
	await capture();
	respond = () => ({ status: 200, json: { choices: [{ message: { content: "pong" } }] } });
	await client.testConnection(config);
	assert.equal(JSON.parse(captured[0].body!).messages[0].content, "ping");
});
