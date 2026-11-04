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
