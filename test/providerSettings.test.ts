import { test } from "node:test";
import assert from "node:assert/strict";
import {
	modelsOf,
	isConfigured,
	isSelectable,
	isActiveModel,
	addProvider,
	removeProvider,
	setProviderName,
	setProviderBaseUrl,
	setSecretId,
	setAuthType,
	applyFetchedModels,
	addModel,
	renameModel,
	setModelParams,
	removeModel,
	selectActiveModel,
	resolveActive,
	isSecretMissing,
	createProviderSettings,
	type ProviderState,
} from "../src/settings/providerSettings";
import { createSettingsOwner } from "../src/settings/owner";
import { DEFAULT_SETTINGS, type ModelProvider } from "../src/types";

function provider(over: Partial<ModelProvider> & { id: string }): ModelProvider {
	return {
		name: over.id,
		type: "preset",
		baseUrl: "https://example.com",
		apiKeySecretId: "",
		models: [],
		authType: "bearer",
		...over,
	};
}

function state(over: Partial<ProviderState> = {}): ProviderState {
	return { providers: [], activeProviderId: "", activeModel: "", ...over };
}

// ===== 判定谓词（自 test/provider.test.ts 迁入） =====

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

test("isConfigured 预设：选了密钥即已配置", () => {
	assert.equal(isConfigured(provider({ id: "p", type: "preset", apiKeySecretId: "sk" })), true);
	assert.equal(isConfigured(provider({ id: "p", type: "preset", apiKeySecretId: "   " })), false);
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

test("isSelectable 预设：有模型且有密钥", () => {
	assert.equal(isSelectable(provider({ id: "p", type: "preset", apiKeySecretId: "sk", models: ["m"] })), true);
	assert.equal(isSelectable(provider({ id: "p", type: "preset", apiKeySecretId: "", models: ["m"] })), false);
	assert.equal(isSelectable(provider({ id: "p", type: "preset", apiKeySecretId: "sk", models: [] })), false);
});

test("isSelectable 自定义无认证：有模型即可选（不要求 Key）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		authType: "none",
		apiKeySecretId: "",
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

test("isSelectable 自定义有认证：需密钥", () => {
	assert.equal(
		isSelectable(provider({ id: "c", type: "custom", authType: "bearer", apiKeySecretId: "", customModels: [{ id: "1", modelId: "m" }] })),
		false
	);
	assert.equal(
		isSelectable(provider({ id: "c", type: "custom", authType: "bearer", apiKeySecretId: "k", customModels: [{ id: "1", modelId: "m" }] })),
		true
	);
});

test("isActiveModel 供应商与模型都匹配时为真", () => {
	assert.equal(isActiveModel("p1", "m1", "p1", "m1"), true);
	assert.equal(isActiveModel("p1", "m1", "p2", "m1"), false);
	assert.equal(isActiveModel("p1", "m1", "p1", "m2"), false);
});

// ===== 命令转移 =====

test("addProvider 追加一个自定义供应商，不改变当前选择", () => {
	const s = state();
	addProvider(s);
	assert.equal(s.providers.length, 1);
	assert.equal(s.providers[0].type, "custom");
	assert.equal(s.providers[0].name, "自定义供应商");
	assert.deepEqual(s.providers[0].customModels, []);
});

test("removeProvider 删除当前供应商：重置到首个并清空当前模型", () => {
	const s = state({
		providers: [provider({ id: "a" }), provider({ id: "b" })],
		activeProviderId: "a",
		activeModel: "m",
	});
	removeProvider(s, "a");
	assert.deepEqual(s.providers.map((p) => p.id), ["b"]);
	assert.equal(s.activeProviderId, "b");
	assert.equal(s.activeModel, "");
});

test("removeProvider 删除非当前供应商：当前选择不变", () => {
	const s = state({
		providers: [provider({ id: "a" }), provider({ id: "b" })],
		activeProviderId: "a",
		activeModel: "m",
	});
	removeProvider(s, "b");
	assert.deepEqual(s.providers.map((p) => p.id), ["a"]);
	assert.equal(s.activeProviderId, "a");
	assert.equal(s.activeModel, "m");
});

test("setProviderName 去空白，空则回退默认名", () => {
	const p = provider({ id: "c", type: "custom", name: "old" });
	const s = state({ providers: [p] });
	setProviderName(s, "c", "  新名  ");
	assert.equal(p.name, "新名");
	setProviderName(s, "c", "   ");
	assert.equal(p.name, "自定义供应商");
});

test("setProviderBaseUrl 去空白写入", () => {
	const p = provider({ id: "c", type: "custom", baseUrl: "" });
	const s = state({ providers: [p] });
	setProviderBaseUrl(s, "c", "  https://x.com/v1  ");
	assert.equal(p.baseUrl, "https://x.com/v1");
});

test("setSecretId 预设清空密钥名：连带清空模型与当前模型", () => {
	const p = provider({ id: "p", type: "preset", authType: "bearer", apiKeySecretId: "old", models: ["m"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	setSecretId(s, "p", "");
	assert.equal(p.apiKeySecretId, "");
	assert.deepEqual(p.models, []);
	assert.equal(s.activeModel, "");
});

test("setSecretId 纯空白视为清空", () => {
	const p = provider({ id: "p", type: "preset", authType: "bearer", apiKeySecretId: "old", models: ["m"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	setSecretId(s, "p", "   ");
	assert.equal(p.apiKeySecretId, "");
	assert.deepEqual(p.models, []);
});

test("setSecretId 预设换新密钥名：去空白并保留模型", () => {
	const p = provider({ id: "p", type: "preset", authType: "bearer", apiKeySecretId: "old", models: ["m"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	setSecretId(s, "p", "  new  ");
	assert.equal(p.apiKeySecretId, "new");
	assert.deepEqual(p.models, ["m"]);
	assert.equal(s.activeModel, "m");
});

test("setAuthType 切到 none：清空密钥名", () => {
	const p = provider({ id: "c", type: "custom", authType: "bearer", apiKeySecretId: "k" });
	const s = state({ providers: [p] });
	setAuthType(s, "c", "none");
	assert.equal(p.authType, "none");
	assert.equal(p.apiKeySecretId, "");
});

test("applyFetchedModels 替换预设模型列表，不动当前模型", () => {
	const p = provider({ id: "p", type: "preset", models: [] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	applyFetchedModels(s, "p", ["a", "b"]);
	assert.deepEqual(p.models, ["a", "b"]);
	assert.equal(s.activeModel, "m");
});

test("addModel 追加一个空模型配置", () => {
	const p = provider({ id: "c", type: "custom", customModels: [] });
	const s = state({ providers: [p] });
	addModel(s, "c");
	assert.equal(p.customModels!.length, 1);
	assert.equal(p.customModels![0].modelId, "");
});

test("renameModel 改当前模型 id：清空当前模型", () => {
	const p = provider({ id: "c", type: "custom", customModels: [{ id: "mc1", modelId: "old" }] });
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "old" });
	renameModel(s, "c", "mc1", "new");
	assert.equal(p.customModels![0].modelId, "new");
	assert.equal(s.activeModel, "");
});

test("renameModel 改非当前模型 id：当前模型不变", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [{ id: "mc1", modelId: "other" }, { id: "mc2", modelId: "keep" }],
	});
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "keep" });
	renameModel(s, "c", "mc1", "new");
	assert.equal(s.activeModel, "keep");
});

test("setModelParams 写入上下文长度与输出上限", () => {
	const p = provider({ id: "c", type: "custom", customModels: [{ id: "mc1", modelId: "m" }] });
	const s = state({ providers: [p] });
	setModelParams(s, "c", "mc1", { contextLength: 131072 });
	setModelParams(s, "c", "mc1", { maxTokens: 4096 });
	assert.equal(p.customModels![0].contextLength, 131072);
	assert.equal(p.customModels![0].maxTokens, 4096);
});

test("removeModel 删除当前模型：清空当前模型", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [{ id: "mc1", modelId: "a" }, { id: "mc2", modelId: "b" }],
	});
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "a" });
	removeModel(s, "c", "mc1");
	assert.deepEqual(p.customModels!.map((m) => m.modelId), ["b"]);
	assert.equal(s.activeModel, "");
});

test("selectActiveModel 写入当前供应商与模型", () => {
	const s = state({ providers: [provider({ id: "a" }), provider({ id: "b" })] });
	selectActiveModel(s, "b", "m");
	assert.equal(s.activeProviderId, "b");
	assert.equal(s.activeModel, "m");
});

test("selectActiveModel 供应商不存在：不改变现状（activeProviderId 恒存在）", () => {
	const s = state({ providers: [provider({ id: "a" })], activeProviderId: "a", activeModel: "m" });
	selectActiveModel(s, "ghost", "x");
	assert.equal(s.activeProviderId, "a");
	assert.equal(s.activeModel, "m");
});

// ===== resolveActive =====

test("resolveActive 成功：解析出地址与密钥值", () => {
	const p = provider({
		id: "p",
		type: "preset",
		baseUrl: "https://api.example.com",
		apiKeySecretId: "my-key",
		models: ["m"],
	});
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	const result = resolveActive(s, (id) => (id === "my-key" ? "sk" : null));
	assert.deepEqual(result, {
		ok: true,
		config: { baseUrl: "https://api.example.com", apiKey: "sk", model: "m" },
	});
});

test("resolveActive 无当前供应商 → no-provider", () => {
	const result = resolveActive(state({ activeProviderId: "gone" }), () => null);
	assert.deepEqual(result, { ok: false, reason: "no-provider" });
});

test("resolveActive 当前模型不在供应商模型列表 → no-model", () => {
	const p = provider({ id: "p", type: "preset", apiKeySecretId: "k", models: ["other"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	assert.deepEqual(resolveActive(s, () => "sk"), { ok: false, reason: "no-model" });
});

test("resolveActive 需认证但密钥缺失 → missing-credentials", () => {
	const p = provider({ id: "p", type: "preset", authType: "bearer", apiKeySecretId: "k", models: ["m"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	assert.deepEqual(resolveActive(s, () => null), { ok: false, reason: "missing-credentials" });
});

test("resolveActive 无认证供应商：无需密钥即可成功", () => {
	const p = provider({ id: "c", type: "custom", authType: "none", apiKeySecretId: "", customModels: [{ id: "1", modelId: "m" }] });
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "m" });
	const result = resolveActive(s, () => null);
	assert.equal(result.ok, true);
});

test("resolveActive 自定义供应商：带出该模型的独立参数", () => {
	const p = provider({
		id: "c",
		type: "custom",
		authType: "none",
		customModels: [{ id: "1", modelId: "m", contextLength: 4096, maxTokens: 2048 }],
	});
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "m" });
	const result = resolveActive(s, () => null);
	assert.equal(result.ok && result.config.contextLength, 4096);
	assert.equal(result.ok && result.config.maxTokens, 2048);
});

test("resolveActive 未选密钥名：不查询存储", () => {
	const p = provider({ id: "p", type: "preset", authType: "bearer", apiKeySecretId: "", models: ["m"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	let calls = 0;
	resolveActive(s, () => {
		calls++;
		return "x";
	});
	assert.equal(calls, 0);
});

// ===== 密钥可用性 =====

test("isSecretMissing：空名不算缺失；存储缺失才算", () => {
	assert.equal(isSecretMissing("", () => null), false);
	assert.equal(isSecretMissing("  ", () => null), false);
	assert.equal(isSecretMissing("gone", () => null), true);
	assert.equal(isSecretMissing("here", () => "value"), false);
});

// ===== 绑定门面 =====

test("门面：命令落盘一次，并保留引用", () => {
	const p = provider({ id: "a", type: "preset", models: ["m"] });
	// live 即 owner 自持的那一份（同一引用），故断言可观察到命令的就地改写
	const live = { ...DEFAULT_SETTINGS, ...state({ providers: [p] }) };
	let saves = 0;
	const owner = createSettingsOwner(live, {
		save: () => {
			saves++;
			return Promise.resolve();
		},
		getSecret: () => null,
	});
	const facade = createProviderSettings({ owner });
	facade.selectActiveModel("a", "m");
	assert.equal(live.activeProviderId, "a");
	assert.equal(live.activeModel, "m");
	assert.equal(saves, 1);
});

test("门面：resolveActive 与 isSecretMissing 用注入的密钥读取", () => {
	const p = provider({ id: "p", type: "preset", apiKeySecretId: "k", models: ["m"] });
	const live = { ...DEFAULT_SETTINGS, ...state({ providers: [p], activeProviderId: "p", activeModel: "m" }) };
	const owner = createSettingsOwner(
		live,
		{ save: () => Promise.resolve(), getSecret: (id: string) => (id === "k" ? "sk" : null) }
	);
	const facade = createProviderSettings({ owner });
	const result = facade.resolveActive();
	assert.equal(result.ok && result.config.apiKey, "sk");
	assert.equal(facade.isSecretMissing("k"), false);
	assert.equal(facade.isSecretMissing("gone"), true);
	assert.equal(facade.secretValue("k"), "sk");
	assert.equal(facade.secretValue("gone"), "");
});
