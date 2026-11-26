/**
 * 「获取模型列表」流程回归（#90 / #92）：
 * - 守卫拦截（缺地址 / 缺密钥名 / 密钥值缺失）时零请求、不写清单、不报「拉取中」；
 * - 成功即刷新「模型清单」（含空表照实记账）；失败不写清单；
 * - 超时用调用方给的值（不回落缺省）；`onStart` 只在放行后调一次。
 *
 * 走真实 ai/client + 假传输（既有 RequestFn 缝），断言结局与发出的请求。
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/fetchModelsFlow.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	runFetchModelsFlow,
	type FetchModelsSlice,
} from "../src/settings/fetchModels";
import type { HttpResponse, RequestFn, RequestParams } from "../src/ai/request";
import { AIClientError } from "../src/ai/errors";
import type { ModelProvider } from "../src/types";

const BASE_URL = "https://api.example.com/v1";
const SECRET_NAME = "tnar-kimi";

function providerOf(overrides: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "kimi",
		name: "Kimi",
		type: "preset",
		baseUrl: BASE_URL,
		apiKeySecretId: SECRET_NAME,
		models: [],
		authType: "bearer",
		...overrides,
	};
}

interface CatalogWrite {
	providerId: string;
	models: string[];
}

function fakeSlice(secrets: Record<string, string> = {}): {
	slice: FetchModelsSlice;
	catalogs: CatalogWrite[];
} {
	const catalogs: CatalogWrite[] = [];
	return {
		slice: {
			secretValue: (id) => secrets[id] ?? "",
			refreshModelCatalog: (providerId, models) =>
				void catalogs.push({ providerId, models: [...models] }),
		},
		catalogs,
	};
}

/** 记录请求并按固定响应回放；order 用于断言 onStart 先于请求。 */
function fakeRequest(response: HttpResponse): {
	request: RequestFn;
	calls: RequestParams[];
	order: string[];
} {
	const calls: RequestParams[] = [];
	const order: string[] = [];
	const request: RequestFn = async (params) => {
		calls.push(params);
		order.push("request");
		return response;
	};
	return { request, calls, order };
}

function modelsResponse(ids: string[]): HttpResponse {
	return { status: 200, json: { data: ids.map((id) => ({ id })) }, text: "" };
}

// ===== 守卫：零请求、不写清单、不报「拉取中」 =====

test("缺地址：need-url，零请求，不写清单，不报开始", async () => {
	const { slice, catalogs } = fakeSlice();
	const { request, calls, order } = fakeRequest(modelsResponse(["m1"]));
	let started = 0;
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ baseUrl: "   " }),
		30,
		request,
		() => void started++
	);
	assert.deepEqual(outcome, { kind: "need-url" });
	assert.equal(calls.length, 0);
	assert.deepEqual(catalogs, []);
	assert.equal(started, 0);
	assert.deepEqual(order, []);
});

test("缺密钥名：need-key，零请求，不写清单", async () => {
	const { slice, catalogs } = fakeSlice();
	const { request, calls } = fakeRequest(modelsResponse(["m1"]));
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiKeySecretId: "  " }),
		30,
		request
	);
	assert.deepEqual(outcome, { kind: "need-key" });
	assert.equal(calls.length, 0);
	assert.deepEqual(catalogs, []);
});

test("密钥名存在但 SecretStorage 无名下值：secret-missing，零请求", async () => {
	const { slice, catalogs } = fakeSlice({});
	const { request, calls } = fakeRequest(modelsResponse(["m1"]));
	const outcome = await runFetchModelsFlow(slice, providerOf(), 30, request);
	assert.deepEqual(outcome, { kind: "secret-missing" });
	assert.equal(calls.length, 0);
	assert.deepEqual(catalogs, []);
});

// ===== 放行与成功 =====

test("无认证供应商不要求密钥：放行且不带 Authorization", async () => {
	const { slice, catalogs } = fakeSlice();
	const { request, calls } = fakeRequest(modelsResponse(["m1"]));
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ authType: "none", apiKeySecretId: "" }),
		30,
		request
	);
	assert.deepEqual(outcome, { kind: "fetched", models: ["m1"] });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].headers.Authorization, undefined);
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: ["m1"] }]);
});

test("成功：请求 URL / 认证头正确，清单刷新为拉取结果，onStart 先于请求", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request, calls, order } = fakeRequest(modelsResponse(["a", "b", ""]));
	const outcome = await runFetchModelsFlow(slice, providerOf(), 30, request, () =>
		order.push("start")
	);

	assert.deepEqual(outcome, { kind: "fetched", models: ["a", "b"] });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, `${BASE_URL}/models`);
	assert.equal(calls[0].method, "GET");
	assert.equal(calls[0].headers.Authorization, "Bearer sk-live");
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: ["a", "b"] }]);
	assert.deepEqual(order, ["start", "request"]);
});

// ===== 接口方言（#105）：Anthropic 清单翻页 =====

/** 按调用次序回放的多页响应（每页消耗一条）。 */
function pageReplay(pages: HttpResponse[]): { request: RequestFn; calls: RequestParams[] } {
	const calls: RequestParams[] = [];
	let index = 0;
	const request: RequestFn = async (params) => {
		calls.push(params);
		return pages[Math.min(index++, pages.length - 1)];
	};
	return { request, calls };
}

function anthropicPage(ids: string[], lastId: string, hasMore: boolean): HttpResponse {
	return {
		status: 200,
		json: { data: ids.map((id) => ({ id })), has_more: hasMore, last_id: lastId },
		text: "",
	};
}

test("Anthropic 方言：清单请求带 x-api-key + 版本头，limit=100，不发 Authorization", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request, calls } = pageReplay([anthropicPage(["m1"], "m1", false)]);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiStyle: "anthropic" }),
		30,
		request
	);
	assert.deepEqual(outcome, { kind: "fetched", models: ["m1"] });
	assert.equal(calls[0].url, `${BASE_URL}/models?limit=100`);
	assert.equal(calls[0].headers["x-api-key"], "sk-live");
	assert.equal(calls[0].headers["anthropic-version"], "2026-10-21");
	assert.equal(calls[0].headers.Authorization, undefined);
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: ["m1"] }]);
});

test("Anthropic 方言：按 after_id 翻页拉全（has_more=false 停止），顺序保持", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request, calls } = pageReplay([
		anthropicPage(["m1", "m2"], "m2", true),
		anthropicPage(["m3"], "m3", false),
	]);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiStyle: "anthropic" }),
		30,
		request
	);
	assert.deepEqual(outcome, { kind: "fetched", models: ["m1", "m2", "m3"] });
	assert.equal(calls.length, 2, "两页即完");
	assert.equal(calls[1].url, `${BASE_URL}/models?limit=100&after_id=m2`);
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: ["m1", "m2", "m3"] }], "整次拉取才写清单");
});

test("Anthropic 方言：坏网关说「还有下一页」却给不出游标 → 按失败收尾，不写半截清单", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request, calls } = pageReplay([anthropicPage(["m1"], "", true)]);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiStyle: "anthropic" }),
		30,
		request
	);
	assert.ok(outcome.kind === "failed", "无法自证完整 → 失败（US16）");
	assert.equal(outcome.error instanceof AIClientError && outcome.error.code, "models.parse");
	assert.equal(calls.length, 1);
	assert.deepEqual(catalogs, [], "不写半截清单");
});

test("Anthropic 方言：页数上限 50 兜底（第 50 页仍喊下一页 → 失败、不卡死）", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request, calls } = pageReplay([]);
	// 永不喊停的网关：每页都给游标
	const neverEnding: RequestFn = async (params) => {
		calls.push(params);
		const n = calls.length;
		return anthropicPage([`m${n}`], `m${n}`, true);
	};
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiStyle: "anthropic" }),
		30,
		neverEnding
	);
	assert.equal(calls.length, 50, "页数上限兜底：不无限翻页");
	assert.ok(outcome.kind === "failed", "触顶仍不完整 → 失败（US16）");
	assert.equal(outcome.error instanceof AIClientError && outcome.error.code, "models.parse");
	assert.deepEqual(catalogs, [], "不把半截清单当完整快照");
});

test("Anthropic 方言：中途某页失败 → 整次按失败、不写半截清单", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = pageReplay([
		anthropicPage(["m1", "m2"], "m2", true),
		{ status: 500, json: { error: { message: "boom" } }, text: "" },
	]);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiStyle: "anthropic" }),
		30,
		request
	);
	assert.ok(outcome.kind === "failed", "应返回 failed");
	assert.equal(outcome.error instanceof AIClientError && outcome.error.code, "models.http");
	assert.deepEqual(catalogs, [], "不写半截清单");
});

test("Anthropic 方言：首屏空（data:[] 且 has_more=false）→ 空清单（正常状态）", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = pageReplay([anthropicPage([], "", false)]);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ apiStyle: "anthropic" }),
		30,
		request
	);
	assert.deepEqual(outcome, { kind: "empty" });
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: [] }]);
});

// ===== OpenAI 预设清单过滤（#106） =====

test("OpenAI 预设：拉取成功后过滤，写回的清单只含对话模型、顺序保留、结局 fetched", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = fakeRequest(
		modelsResponse([
			"gpt-6.2-astra",
			"text-embedding-3-large",
			"gpt-4.1",
			"gpt-image-2.6-sunburst",
			"gpt-5.5-pro",
			"sora-2",
			"gpt-6.7-terra",
		])
	);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ id: "openai", baseUrl: "https://api.openai.com/v1" }),
		30,
		request
	);
	assert.deepEqual(outcome, {
		kind: "fetched",
		models: ["gpt-6.2-astra", "gpt-4.1", "gpt-6.7-terra"],
	});
	assert.deepEqual(catalogs, [
		{ providerId: "openai", models: ["gpt-6.2-astra", "gpt-4.1", "gpt-6.7-terra"] },
	], "写回的是过滤后的完整快照");
});

test("OpenAI 预设：全部被过滤 ⇒ 结局 empty、清单照实为空（不新增错误码）", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = fakeRequest(
		modelsResponse(["text-embedding-3-small", "gpt-oss-20b", "gpt-5.6-cyber", "chat-latest"])
	);
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ id: "openai", baseUrl: "https://api.openai.com/v1" }),
		30,
		request
	);
	assert.deepEqual(outcome, { kind: "empty" });
	assert.deepEqual(catalogs, [{ providerId: "openai", models: [] }]);
});

test("其它供应商：清单不过滤（四家国产预设与自定义零变更）", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = fakeRequest(modelsResponse(["gpt-6.2-astra", "text-embedding-3-large"]));
	const outcome = await runFetchModelsFlow(slice, providerOf(), 30, request);
	assert.deepEqual(outcome, { kind: "fetched", models: ["gpt-6.2-astra", "text-embedding-3-large"] });
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: ["gpt-6.2-astra", "text-embedding-3-large"] }]);
});

test("OpenAI 预设：请求失败仍不写清单（过滤只在成功路径）", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = fakeRequest({ status: 401, json: { error: { message: "bad key" } }, text: "" });
	const outcome = await runFetchModelsFlow(
		slice,
		providerOf({ id: "openai", baseUrl: "https://api.openai.com/v1" }),
		30,
		request
	);
	assert.ok(outcome.kind === "failed");
	assert.deepEqual(catalogs, []);
});

// ===== 空表 / 失败 =====
test("空表是正常状态：empty 且清单照实刷为空", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = fakeRequest(modelsResponse([]));
	const outcome = await runFetchModelsFlow(slice, providerOf(), 30, request);
	assert.deepEqual(outcome, { kind: "empty" });
	assert.deepEqual(catalogs, [{ providerId: "kimi", models: [] }]);
});

test("请求失败：failed 带结构化错误，不写清单", async () => {
	const { slice, catalogs } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const { request } = fakeRequest({
		status: 401,
		json: { error: { message: "invalid key" } },
		text: "",
	});
	const outcome = await runFetchModelsFlow(slice, providerOf(), 30, request);
	assert.ok(outcome.kind === "failed", "应返回 failed");
	assert.ok(outcome.error instanceof AIClientError);
	assert.equal(outcome.error.code, "models.http");
	assert.equal(outcome.error.details.status, 401);
	assert.deepEqual(catalogs, []);
});

test("超时用调用方给的值：20ms 即中断，不回落 30s 缺省", async () => {
	const { slice } = fakeSlice({ [SECRET_NAME]: "sk-live" });
	const never: RequestFn = () => new Promise<HttpResponse>(() => {});
	const started = Date.now();
	const outcome = await runFetchModelsFlow(slice, providerOf(), 0.02, never);

	assert.ok(outcome.kind === "failed", "超时应返回 failed");
	assert.ok(outcome.error instanceof AIClientError);
	assert.equal(outcome.error.code, "timeout");
	assert.equal(outcome.error.details.ms, 20);
	assert.ok(Date.now() - started < 5000, "不应等待 30 秒缺省超时");
});
