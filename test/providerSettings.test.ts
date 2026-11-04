import { test } from "node:test";
import assert from "node:assert/strict";
import {
	modelsOf,
	catalogOf,
	thinkingFor,
	isConfigured,
	isSelectable,
	isActiveModel,
	addProvider,
	removeProvider,
	setProviderName,
	setProviderBaseUrl,
	setSecretId,
	setAuthType,
	refreshModelCatalog,
	countNewPickable,
	applyPickedModels,
	isModelStale,
	isModelProtected,
	addModel,
	renameModel,
	setModelParams,
	removeModel,
	selectActiveModel,
	setModelThinking,
	recordThinkingTest,
	clearLearnedThinking,
	resolveActive,
	isSecretMissing,
	createProviderSettings,
	type ProviderState,
} from "../src/settings/providerSettings";
import { createSettingsOwner } from "../src/settings/owner";
import { DEFAULT_SETTINGS, type LearnedCapability, type ModelProvider } from "../src/types";

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

test("setSecretId 预设清空密钥名：不动启用集与模型清单（策展动作只在挑选，#87）", () => {
	const p = provider({
		id: "p",
		type: "preset",
		authType: "bearer",
		apiKeySecretId: "old",
		models: ["m"],
		modelCatalog: ["m"],
	});
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	setSecretId(s, "p", "");
	assert.equal(p.apiKeySecretId, "");
	assert.deepEqual(p.models, ["m"], "启用集保留");
	assert.deepEqual(p.modelCatalog, ["m"], "模型清单保留");
	assert.equal(s.activeModel, "m");
});

test("setSecretId 纯空白视为清空：同样不动启用集", () => {
	const p = provider({
		id: "p",
		type: "preset",
		authType: "bearer",
		apiKeySecretId: "old",
		models: ["m"],
		modelCatalog: ["m"],
	});
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	setSecretId(s, "p", "   ");
	assert.equal(p.apiKeySecretId, "");
	assert.deepEqual(p.models, ["m"]);
	assert.equal(s.activeModel, "m");
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

// ===== 模型清单（#87，ADR-0026） =====

test("catalogOf 缺失清单读作空清单", () => {
	assert.deepEqual(catalogOf(provider({ id: "p", type: "preset", models: ["a"] })), []);
	assert.deepEqual(catalogOf(provider({ id: "p", type: "preset", modelCatalog: ["x"] })), ["x"]);
});

test("refreshModelCatalog 只刷模型清单：启用集与当前模型不动（静默拉取）", () => {
	const p = provider({ id: "p", type: "preset", models: ["kept"], modelCatalog: ["old"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "kept" });
	refreshModelCatalog(s, "p", ["kept", "fresh"]);
	assert.deepEqual(p.modelCatalog, ["kept", "fresh"]);
	assert.deepEqual(p.models, ["kept"], "启用集不因拉取改动");
	assert.equal(s.activeModel, "kept");
});

test("refreshModelCatalog 自定义供应商同样只刷清单：模型行不动", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [{ id: "mc1", modelId: "m", contextLength: 4096 }],
	});
	const s = state({ providers: [p] });
	refreshModelCatalog(s, "c", ["m", "n"]);
	assert.deepEqual(p.modelCatalog, ["m", "n"]);
	assert.deepEqual(p.customModels, [{ id: "mc1", modelId: "m", contextLength: 4096 }]);
});

test("refreshModelCatalog 空列表视为拉取异常：清单不变", () => {
	const p = provider({ id: "p", type: "preset", models: ["a"], modelCatalog: ["a"] });
	const s = state({ providers: [p] });
	refreshModelCatalog(s, "p", []);
	assert.deepEqual(p.modelCatalog, ["a"]);
});

test("refreshModelCatalog 清洗清单：去空白、去重、剔除非字符串", () => {
	const p = provider({ id: "p", type: "preset", models: [] });
	const s = state({ providers: [p] });
	refreshModelCatalog(s, "p", [" a ", "a", "", "  ", 123 as unknown as string, "b"]);
	assert.deepEqual(p.modelCatalog, ["a", "b"]);
});

test("countNewPickable 只数清单新增且未启用的模型（「有 N 个新模型可挑选」）", () => {
	assert.equal(countNewPickable(["a"], ["a", "b", "c"], ["b"]), 1, "b 已启用、a 旧有，只剩 c");
	assert.equal(countNewPickable([], ["a"], []), 1);
	assert.equal(countNewPickable(["a"], ["a"], []), 0, "清单没变化没有新模型");
});

// ===== 启用 / 停用（挑选确认，#87） =====

test("applyPickedModels 预设：挑选集成为启用集，取消挑选即移出", () => {
	const p = provider({ id: "p", type: "preset", models: ["a", "b", "c"], modelCatalog: ["a", "b", "c"] });
	const s = state({ providers: [p] });
	applyPickedModels(s, "p", ["b", "c"]);
	assert.deepEqual(p.models, ["b", "c"], "取消挑选的 a 移出启用集");
});

test("applyPickedModels 自定义：取消挑选移出模型行，保留行的 id 与参数", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [
			{ id: "mc1", modelId: "a", contextLength: 4096 },
			{ id: "mc2", modelId: "b" },
		],
		modelCatalog: ["a", "b", "n"],
	});
	const s = state({ providers: [p] });
	applyPickedModels(s, "c", ["a", "n"]);
	const rows = p.customModels!;
	assert.equal(rows.length, 2);
	assert.equal(rows[0].id, "mc1", "保留行不换 id");
	assert.equal(rows[0].modelId, "a");
	assert.equal(rows[0].contextLength, 4096, "保留行参数不丢");
	assert.equal(rows[1].modelId, "n", "新挑选的模型行排在后面");
});

test("applyPickedModels 自定义：新挑选的模型补出空参数模型行", () => {
	const p = provider({ id: "c", type: "custom", customModels: [], modelCatalog: ["n"] });
	const s = state({ providers: [p] });
	applyPickedModels(s, "c", ["n"]);
	assert.equal(p.customModels!.length, 1);
	assert.equal(p.customModels![0].modelId, "n");
	assert.equal(p.customModels![0].contextLength, undefined);
});

test("applyPickedModels 停用模型不清思考偏好：重新添加后原样生效（AC4）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [{ id: "mc1", modelId: "m" }],
		thinkingByModel: { m: "on" },
	});
	const s = state({ providers: [p] });
	applyPickedModels(s, "c", []);
	assert.deepEqual(p.customModels, [], "已停用");
	assert.deepEqual(p.thinkingByModel, { m: "on" }, "思考偏好保留");
	applyPickedModels(s, "c", ["m"]);
	assert.deepEqual(modelsOf(p), ["m"]);
	assert.equal(thinkingFor(p, "m").setting, "on", "重新添加后原样生效");
});

// ===== 当前模型保护（AC3） =====

test("applyPickedModels 当前模型受保护：挑选集不含也强制保留", () => {
	const p = provider({ id: "p", type: "preset", models: ["a", "m"], modelCatalog: ["a", "m"] });
	const s = state({ providers: [p], activeProviderId: "p", activeModel: "m" });
	applyPickedModels(s, "p", ["a"]);
	assert.deepEqual(p.models, ["a", "m"], "当前模型 m 不被移出");
});

test("applyPickedModels 只保护本供应商的当前模型", () => {
	const p = provider({ id: "p", type: "preset", models: ["m"], modelCatalog: ["m"] });
	const s = state({ providers: [p], activeProviderId: "other", activeModel: "m" });
	applyPickedModels(s, "p", []);
	assert.deepEqual(p.models, [], "同名模型在他供应商，不受保护");
});

test("isModelProtected 当前模型受保护，其余模型可移除", () => {
	const s = state({ activeProviderId: "p", activeModel: "m" });
	assert.equal(isModelProtected(s, "p", "m"), true);
	assert.equal(isModelProtected(s, "p", "other"), false);
	assert.equal(isModelProtected(s, "other", "m"), false);
});

// ===== 已失效（AC6） =====

test("isModelStale 已启用但不在模型清单 → 已失效（上游消失）", () => {
	const p = provider({ id: "p", type: "preset", models: ["a", "gone"], modelCatalog: ["a", "b"] });
	assert.equal(isModelStale(p, "gone"), true);
	assert.equal(isModelStale(p, "a"), false, "仍在清单内不失效");
});

test("isModelStale 清单为空（无上游信息）不标失效；未启用的模型不谈失效", () => {
	const p = provider({ id: "c", type: "custom", customModels: [{ id: "1", modelId: "hand" }] });
	assert.equal(isModelStale(p, "hand"), false, "从未拉取过清单，手填模型不失效");
	const q = provider({ id: "p", type: "preset", models: ["a"], modelCatalog: ["a"] });
	assert.equal(isModelStale(q, "b"), false, "未启用的模型不谈失效");
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

test("removeModel 移除当前模型被拒：需先切换模型（AC3）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [{ id: "mc1", modelId: "a" }, { id: "mc2", modelId: "b" }],
	});
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "a" });
	removeModel(s, "c", "mc1");
	assert.deepEqual(p.customModels!.map((m) => m.modelId), ["a", "b"], "当前模型行不被移除");
	assert.equal(s.activeModel, "a");
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
		config: {
			baseUrl: "https://api.example.com",
			apiKey: "sk",
			model: "m",
			thinking: { setting: "off", param: null, note: "unknown", learned: null },
		},
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

test("门面：refreshModelCatalog 只刷清单并返回「有 N 个新模型可挑选」的 N", () => {
	const p = provider({ id: "a", type: "preset", models: ["m"], modelCatalog: ["m"] });
	const live = { ...DEFAULT_SETTINGS, ...state({ providers: [p], activeProviderId: "a", activeModel: "m" }) };
	const owner = createSettingsOwner(live, { save: () => Promise.resolve(), getSecret: () => null });
	const facade = createProviderSettings({ owner });
	const count = facade.refreshModelCatalog("a", ["m", "new1", "new2"]);
	assert.equal(count, 2);
	assert.deepEqual(live.providers[0].modelCatalog, ["m", "new1", "new2"]);
	assert.deepEqual(live.providers[0].models, ["m"], "启用集不改动");
});

test("门面：applyPickedModels 落盘启用集，当前模型受保护", () => {
	const p = provider({ id: "a", type: "preset", models: ["m", "x"], modelCatalog: ["m", "x"] });
	const live = { ...DEFAULT_SETTINGS, ...state({ providers: [p], activeProviderId: "a", activeModel: "m" }) };
	const owner = createSettingsOwner(live, { save: () => Promise.resolve(), getSecret: () => null });
	const facade = createProviderSettings({ owner });
	facade.applyPickedModels("a", ["x"]);
	assert.deepEqual(live.providers[0].models, ["x", "m"]);
	assert.equal(facade.isModelProtected("a", "m"), true);
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

// ===== 「思考」两档（#84 / #88，ADR-0024 / ADR-0026） =====

test("setModelThinking：写入该模型的「思考」两档（偏好跟模型走）", () => {
	const p = provider({ id: "p", type: "preset", models: ["m"] });
	const s = state({ providers: [p] });
	setModelThinking(s, "p", "m", "on");
	assert.deepEqual(p.thinkingByModel, { m: "on" });
	setModelThinking(s, "p", "m", "off");
	assert.deepEqual(p.thinkingByModel, { m: "off" });
});

test("模型「思考」缺省＝关：无偏好条目时解析出关参数（既有设置迁移后缺省关）", () => {
	const p = provider({
		id: "deepseek",
		type: "preset",
		authType: "bearer",
		apiKeySecretId: "k",
		models: ["deepseek-v4-pro"],
	});
	const s = state({ providers: [p], activeProviderId: "deepseek", activeModel: "deepseek-v4-pro" });
	const result = resolveActive(s, () => "sk");
	assert.equal(result.ok, true);
	assert.equal(result.ok && result.config.thinking.setting, "off");
	assert.deepEqual(result.ok && result.config.thinking.param, {
		name: "thinking",
		value: { type: "disabled" },
	});
});

test("resolveActive 带出思考解析结果：「开」发开参数（能力表映射随行）", () => {
	const p = provider({
		id: "deepseek",
		type: "preset",
		authType: "bearer",
		apiKeySecretId: "k",
		models: ["deepseek-v4-pro"],
		thinkingByModel: { "deepseek-v4-pro": "on" },
	});
	const s = state({ providers: [p], activeProviderId: "deepseek", activeModel: "deepseek-v4-pro" });
	const result = resolveActive(s, () => "sk");
	assert.deepEqual(result.ok && result.config.thinking.param, {
		name: "thinking",
		value: { type: "enabled" },
	});
});

test("renameModel 迁移该模型的思考偏好；removeModel 移除不清偏好（AC4）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		authType: "none",
		customModels: [{ id: "1", modelId: "m" }],
		thinkingByModel: { m: "on" },
	});
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "" });
	renameModel(s, "c", "1", "m2");
	assert.deepEqual(p.thinkingByModel, { m2: "on" });
	removeModel(s, "c", "1");
	assert.deepEqual(p.customModels, []);
	assert.deepEqual(p.thinkingByModel, { m2: "on" }, "移除模型不清除思考偏好");
});

// ===== 习得能力（#89，思考测试落档） =====

const LEARNED_SWITCHABLE: LearnedCapability = {
	verdict: "switchable",
	off: { name: "enable_thinking", value: false },
	testedAt: "2026-11-04T08:00:00.000Z",
};

test("recordThinkingTest（#89）：习得条目按（供应商, 模型）落档，thinkingFor 即刻以习得为准", () => {
	const p = provider({ id: "p", type: "preset", models: ["m"] });
	const s = state({ providers: [p] });
	recordThinkingTest(s, "p", "m", LEARNED_SWITCHABLE);
	assert.deepEqual(p.learnedByModel, { m: LEARNED_SWITCHABLE }, "条目键＝模型（供应商即所属条目），含测试时间戳");
	assert.deepEqual(thinkingFor(p, "m").param, { name: "enable_thinking", value: false }, "习得关参数生效");
});

test("习得盖过内置能力表（#89）：内置可关模型实测「未能关闭」后，解析以习得为准", () => {
	const p = provider({
		id: "deepseek",
		type: "preset",
		models: ["deepseek-v4-pro"],
		learnedByModel: {
			"deepseek-v4-pro": { verdict: "not-switchable", triedFields: 3, testedAt: "2026-11-04T08:00:00.000Z" },
		},
	});
	const r = thinkingFor(p, "deepseek-v4-pro");
	assert.equal(r.param, null, "习得「未能关闭」盖过内置可关");
	assert.equal(r.learned?.verdict, "not-switchable");
});

test("clearLearnedThinking（#89）：假关告警「重新测试」先清习得；思考偏好与其它模型条目不动", () => {
	const p = provider({
		id: "p",
		type: "preset",
		models: ["m", "n"],
		thinkingByModel: { m: "on" },
		learnedByModel: {
			m: LEARNED_SWITCHABLE,
			n: { verdict: "not-detected", testedAt: "2026-11-04T08:00:00.000Z" },
		},
	});
	const s = state({ providers: [p] });
	clearLearnedThinking(s, "p", "m");
	assert.deepEqual(
		p.learnedByModel,
		{ n: { verdict: "not-detected", testedAt: "2026-11-04T08:00:00.000Z" } },
		"只清目标模型的习得"
	);
	assert.deepEqual(p.thinkingByModel, { m: "on" }, "思考偏好不动");
	assert.equal(thinkingFor(p, "m").learned, null, "清后回落内置/未知");
	assert.equal(thinkingFor(p, "m").setting, "on");
});

test("习得能力门面（#89）：recordThinkingTest 落档并落盘，clearLearnedThinking 清档", () => {
	const p = provider({ id: "p", type: "preset", models: ["m"] });
	const live = {
		...DEFAULT_SETTINGS,
		...state({ providers: [p], activeProviderId: "p", activeModel: "m" }),
	};
	let saved = 0;
	const owner = createSettingsOwner(live, {
		save: () => {
			saved += 1;
			return Promise.resolve();
		},
		getSecret: () => null,
	});
	const facade = createProviderSettings({ owner });
	facade.recordThinkingTest("p", "m", LEARNED_SWITCHABLE);
	assert.deepEqual(p.learnedByModel, { m: LEARNED_SWITCHABLE });
	assert.ok(saved > 0, "随设置持久化（切走再切回直接可用）");
	facade.clearLearnedThinking("p", "m");
	assert.deepEqual(p.learnedByModel, {});
});

test("renameModel 迁移习得条目（#89，与思考偏好同门）；removeModel 移除不清习得", () => {
	const p = provider({
		id: "c",
		type: "custom",
		authType: "none",
		customModels: [{ id: "1", modelId: "m" }],
		learnedByModel: { m: LEARNED_SWITCHABLE },
	});
	const s = state({ providers: [p], activeProviderId: "c", activeModel: "" });
	renameModel(s, "c", "1", "m2");
	assert.deepEqual(p.learnedByModel, { m2: LEARNED_SWITCHABLE }, "习得随模型改名迁移");
	removeModel(s, "c", "1");
	assert.deepEqual(p.learnedByModel, { m2: LEARNED_SWITCHABLE }, "移除模型不清习得");
});

test("applyPickedModels 停用不清习得（#89，US7：重新添加后不必重新测试）", () => {
	const p = provider({
		id: "c",
		type: "custom",
		customModels: [{ id: "mc1", modelId: "m" }],
		learnedByModel: { m: LEARNED_SWITCHABLE },
	});
	const s = state({ providers: [p] });
	applyPickedModels(s, "c", []);
	assert.deepEqual(p.learnedByModel, { m: LEARNED_SWITCHABLE }, "习得保留");
	applyPickedModels(s, "c", ["m"]);
	assert.deepEqual(
		thinkingFor(p, "m").param,
		{ name: "enable_thinking", value: false },
		"重新添加后原样生效"
	);
});

test("resolveActive 生成路径同样以习得为准（#89）：习得关参数进请求解析", () => {
	const p = provider({
		id: "deepseek",
		type: "preset",
		authType: "bearer",
		apiKeySecretId: "k",
		models: ["deepseek-v4-pro"],
		learnedByModel: { "deepseek-v4-pro": LEARNED_SWITCHABLE },
	});
	const s = state({ providers: [p], activeProviderId: "deepseek", activeModel: "deepseek-v4-pro" });
	const result = resolveActive(s, () => "sk");
	assert.deepEqual(
		result.ok && result.config.thinking.param,
		{ name: "enable_thinking", value: false },
		"习得＞内置"
	);
	assert.deepEqual(result.ok && result.config.thinking.learned, LEARNED_SWITCHABLE);
});
