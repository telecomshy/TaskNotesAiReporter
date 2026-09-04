import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, resolveActiveModelConfig, PRESET_PROVIDERS } from "../src/types";

test("normalizeSettings 空数据返回默认预设（4个预设供应商，无固定 custom）", () => {
	const settings = normalizeSettings({});
	assert.equal(settings.providers.length, PRESET_PROVIDERS.length);
	assert.equal(settings.activeProviderId, "deepseek");
	// 预设供应商 models 默认为空（动态拉取）
	for (const p of settings.providers) {
		assert.deepEqual(p.models, []);
	}
	assert.equal(settings.selectedTemplateId, "", "默认不选择模板");
});

test("normalizeSettings 保留存在的 selectedTemplateId", () => {
	const raw = {
		providers: PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: "", authType: "bearer" as const })),
		templates: [
			{ id: "tpl_a", name: "周报", content: "x {{tasks}}" },
			{ id: "tpl_b", name: "月报", content: "y {{tasks}}" },
		],
		selectedTemplateId: "tpl_b",
	};
	const settings = normalizeSettings(raw);
	assert.equal(settings.selectedTemplateId, "tpl_b");
});

test("normalizeSettings 引用的模板不存在时重置 selectedTemplateId 为空", () => {
	const raw = {
		providers: PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: "", authType: "bearer" as const })),
		templates: [{ id: "tpl_a", name: "周报", content: "x" }],
		selectedTemplateId: "tpl_removed",
	};
	const settings = normalizeSettings(raw);
	assert.equal(settings.selectedTemplateId, "");
});

test("normalizeSettings 非字符串 selectedTemplateId 回退为空", () => {
	const settings = normalizeSettings({ selectedTemplateId: 123 }) as any;
	assert.equal(settings.selectedTemplateId, "");
});

test("normalizeSettings 迁移旧版 DeepSeek 配置到预设供应商", () => {
	const settings = normalizeSettings({
		baseUrl: "https://api.deepseek.com",
		apiKey: "sk-test",
		model: "deepseek-v4-pro",
	});
	assert.equal(settings.activeProviderId, "deepseek");
	assert.equal(settings.activeModel, "deepseek-v4-pro");
	const deepseek = settings.providers.find((p) => p.id === "deepseek")!;
	assert.equal(deepseek.apiKey, "sk-test");
	assert.ok(deepseek.models.includes("deepseek-v4-pro"));
});

test("normalizeSettings 迁移不匹配的旧配置创建自定义供应商", () => {
	const settings = normalizeSettings({
		baseUrl: "https://custom.example.com/v1",
		apiKey: "sk-custom",
		model: "my-model",
	});
	// 不匹配预设，应创建新的自定义供应商（而非固定 id="custom"）
	const custom = settings.providers.find((p) => p.type === "custom")!;
	assert.ok(custom);
	assert.equal(custom.apiKey, "sk-custom");
	assert.deepEqual(custom.models, ["my-model"]);
	assert.equal(settings.activeProviderId, custom.id);
	assert.equal(settings.activeModel, "my-model");
});

test("normalizeSettings 保留新结构供应商", () => {
	const providers = [
		{ id: "deepseek", name: "DeepSeek", type: "preset" as const, baseUrl: "https://api.deepseek.com", apiKey: "k", models: ["m1"], authType: "bearer" as const },
	];
	const settings = normalizeSettings({ providers, activeProviderId: "deepseek", activeModel: "m1" });
	assert.equal(settings.providers.length, 1);
	assert.equal(settings.activeProviderId, "deepseek");
	assert.equal(settings.activeModel, "m1");
});

test("normalizeSettings 过滤器掉空的 custom 占位，保留已配置的 custom", () => {
	const providers = [
		{ id: "deepseek", name: "DeepSeek", type: "preset" as const, baseUrl: "https://api.deepseek.com", apiKey: "k", models: ["m1"], authType: "bearer" as const },
		// 旧版默认列表遗留的 custom 空壳，应被过滤
		{ id: "custom", name: "自定义", type: "custom" as const, baseUrl: "", apiKey: "", models: [], authType: "bearer" as const },
		// 用户手动添加并已配置的 custom，应保留
		{ id: "custom_abc", name: "我的供应商", type: "custom" as const, baseUrl: "https://x.com/v1", apiKey: "sk-x", models: ["m2"], authType: "bearer" as const },
	];
	const settings = normalizeSettings({ providers, activeProviderId: "deepseek" });
	assert.equal(settings.providers.length, 2);
	assert.equal(settings.providers.some((p) => p.id === "custom"), false, "空的 custom 占位应被移除");
	assert.equal(settings.providers.some((p) => p.id === "custom_abc"), true, "已配置的 custom 应保留");
});

test("normalizeSettings 修正不存在的 activeProviderId", () => {
	const settings = normalizeSettings({ activeProviderId: "nonexistent" });
	assert.notEqual(settings.activeProviderId, "nonexistent");
});

test("resolveActiveModelConfig 返回当前生效配置", () => {
	const settings = normalizeSettings({
		baseUrl: "https://api.deepseek.com",
		apiKey: "sk-test",
		model: "deepseek-v4-flash",
	});
	const active = resolveActiveModelConfig(settings)!;
	assert.equal(active.baseUrl, "https://api.deepseek.com");
	assert.equal(active.apiKey, "sk-test");
	assert.equal(active.model, "deepseek-v4-flash");
});

test("normalizeBaseUrl 归一化（通过匹配验证）", () => {
	// 带 /v1 后缀也能匹配到预设
	const settings = normalizeSettings({
		baseUrl: "https://api.deepseek.com/v1",
		apiKey: "sk-test",
		model: "deepseek-chat",
	});
	assert.equal(settings.activeProviderId, "deepseek");
});

test("normalizeSettings 迁移旧版自定义供应商 models 数组到 customModels", () => {
	const providers = [
		{
			id: "custom_old",
			name: "旧自定义",
			type: "custom" as const,
			baseUrl: "https://x.com/v1",
			apiKey: "sk-x",
			models: ["m1", "m2"],
			authType: "bearer" as const,
		},
	];
	const settings = normalizeSettings({ providers, activeProviderId: "custom_old", activeModel: "m1" });
	const p = settings.providers.find((x) => x.id === "custom_old")!;
	assert.ok(Array.isArray(p.customModels), "custom 供应商应迁移出 customModels");
	assert.equal(p.customModels!.length, 2);
	assert.deepEqual(
		p.customModels!.map((m) => m.modelId),
		["m1", "m2"]
	);
});

test("normalizeSettings 保留已存在的 customModels（不重复迁移）", () => {
	const providers = [
		{
			id: "custom_new",
			name: "新自定义",
			type: "custom" as const,
			baseUrl: "https://x.com/v1",
			apiKey: "sk-x",
			models: ["m1"],
			authType: "bearer" as const,
			customModels: [{ id: "fixed", modelId: "m1", maxTokens: 4096 }],
		},
	];
	const settings = normalizeSettings({ providers, activeProviderId: "custom_new", activeModel: "m1" });
	const p = settings.providers.find((x) => x.id === "custom_new")!;
	assert.equal(p.customModels!.length, 1);
	assert.equal(p.customModels![0].id, "fixed");
	assert.equal(p.customModels![0].maxTokens, 4096);
});

test("resolveActiveModelConfig 对自定义供应商提取该模型的独立参数", () => {
	const providers = [
		{
			id: "custom_m",
			name: "多模型供应商",
			type: "custom" as const,
			baseUrl: "https://x.com/v1",
			apiKey: "sk-x",
			models: ["small", "large"],
			authType: "none" as const,
			customModels: [
				{ id: "a", modelId: "small", contextLength: 4096, maxTokens: 2048 },
				{ id: "b", modelId: "large", contextLength: 131072, maxTokens: 65535 },
			],
		},
	];
	const settings = normalizeSettings({ providers }) as any;
	settings.activeProviderId = "custom_m";

	settings.activeModel = "small";
	const small = resolveActiveModelConfig(settings)!;
	assert.equal(small.maxTokens, 2048);
	assert.equal(small.contextLength, 4096);

	settings.activeModel = "large";
	const large = resolveActiveModelConfig(settings)!;
	assert.equal(large.maxTokens, 65535);
	assert.equal(large.contextLength, 131072);

	// 未在 customModels 中匹配的模型，不返回独立参数
	settings.activeModel = "nonexistent";
	const none = resolveActiveModelConfig(settings)!;
	assert.equal(none.maxTokens, undefined);
	assert.equal(none.contextLength, undefined);
});
