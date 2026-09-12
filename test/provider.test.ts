import { test } from "node:test";
import assert from "node:assert/strict";
import { modelsOf, isConfigured, isSelectable, isActiveModel } from "../src/settings/provider";
import type { ModelProvider } from "../src/types";

function provider(over: Partial<ModelProvider> & { id: string }): ModelProvider {
	return {
		name: over.id,
		type: "preset",
		baseUrl: "https://example.com",
		apiKey: "",
		models: [],
		authType: "bearer",
		...over,
	};
}

test("modelsOf 预设取已拉取列表", () => {
	assert.deepEqual(modelsOf(provider({ id: "p", type: "preset", models: ["a", "b"] })), ["a", "b"]);
});

test("modelsOf 自定义由 customModels 派生并去空白", () => {
	const p = provider({
		id: "c",
		type: "custom",
		models: ["ignored"],
		customModels: [
			{ id: "1", modelId: "m1" },
			{ id: "2", modelId: "  " },
			{ id: "3", modelId: "m2" },
		],
	});
	assert.deepEqual(modelsOf(p), ["m1", "m2"]);
});

test("isConfigured 预设：填了 Key 即已配置", () => {
	assert.equal(isConfigured(provider({ id: "p", type: "preset", apiKey: "sk" })), true);
	assert.equal(isConfigured(provider({ id: "p", type: "preset", apiKey: "   " })), false);
});

test("isConfigured 自定义：需地址且有模型", () => {
	assert.equal(
		isConfigured(provider({ id: "c", type: "custom", baseUrl: "https://x", customModels: [{ id: "1", modelId: "m" }] })),
		true
	);
	assert.equal(
		isConfigured(provider({ id: "c", type: "custom", baseUrl: "", customModels: [{ id: "1", modelId: "m" }] })),
		false
	);
	assert.equal(isConfigured(provider({ id: "c", type: "custom", baseUrl: "https://x", customModels: [] })), false);
});

test("isSelectable 预设：有模型且有 Key", () => {
	assert.equal(isSelectable(provider({ id: "p", type: "preset", apiKey: "sk", models: ["m"] })), true);
	assert.equal(isSelectable(provider({ id: "p", type: "preset", apiKey: "", models: ["m"] })), false);
	assert.equal(isSelectable(provider({ id: "p", type: "preset", apiKey: "sk", models: [] })), false);
});

test("isSelectable 自定义无认证：有模型即可选（不要求 Key）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		authType: "none",
		apiKey: "",
		customModels: [{ id: "1", modelId: "m" }],
	});
	assert.equal(isSelectable(p), true);
});

test("isSelectable 无地址：不可选（即便有模型）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		authType: "none",
		baseUrl: "",
		customModels: [{ id: "1", modelId: "m" }],
	});
	assert.equal(isSelectable(p), false);
});

test("isSelectable 自定义有认证：需 Key", () => {
	assert.equal(
		isSelectable(provider({ id: "c", type: "custom", authType: "bearer", apiKey: "", customModels: [{ id: "1", modelId: "m" }] })),
		false
	);
	assert.equal(
		isSelectable(provider({ id: "c", type: "custom", authType: "bearer", apiKey: "k", customModels: [{ id: "1", modelId: "m" }] })),
		true
	);
});

test("isActiveModel 供应商与模型都匹配时为真", () => {
	assert.equal(isActiveModel("p1", "m1", "p1", "m1"), true);
	assert.equal(isActiveModel("p1", "m1", "p2", "m1"), false);
	assert.equal(isActiveModel("p1", "m1", "p1", "m2"), false);
});
