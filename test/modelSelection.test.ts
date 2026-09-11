import { test } from "node:test";
import assert from "node:assert/strict";
import { getSelectableProviders, isActiveModel } from "../src/settings/modelSelection";
import type { ModelProvider } from "../src/types";

function makeProvider(overrides: Partial<ModelProvider> & { id: string }): ModelProvider {
	return {
		name: overrides.id,
		type: "preset",
		baseUrl: "https://example.com",
		apiKey: "",
		models: [],
		authType: "bearer",
		...overrides,
	};
}

test("getSelectableProviders 保留有模型且已填 Key 的供应商", () => {
	const a = makeProvider({ id: "a", apiKey: "sk-a", models: ["m1"] });
	const result = getSelectableProviders([a]);
	assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("getSelectableProviders 排除无模型的供应商", () => {
	const a = makeProvider({ id: "a", apiKey: "sk-a", models: [] });
	assert.deepEqual(getSelectableProviders([a]), []);
});

test("getSelectableProviders 排除未填 Key 的供应商", () => {
	const a = makeProvider({ id: "a", apiKey: "   ", models: ["m1"] });
	assert.deepEqual(getSelectableProviders([a]), []);
});

test("getSelectableProviders 保持原有顺序", () => {
	const a = makeProvider({ id: "a", apiKey: "sk", models: ["m"] });
	const b = makeProvider({ id: "b", apiKey: "", models: ["m"] });
	const c = makeProvider({ id: "c", apiKey: "sk", models: ["m"] });
	assert.deepEqual(getSelectableProviders([a, b, c]).map((p) => p.id), ["a", "c"]);
});

test("isActiveModel 供应商与模型都匹配时为真", () => {
	assert.equal(isActiveModel("p1", "m1", "p1", "m1"), true);
});

test("isActiveModel 供应商不同为假", () => {
	assert.equal(isActiveModel("p1", "m1", "p2", "m1"), false);
});

test("isActiveModel 模型不同为假", () => {
	assert.equal(isActiveModel("p1", "m1", "p1", "m2"), false);
});
