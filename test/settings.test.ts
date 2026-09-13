import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings, resolveActiveModelConfig } from "../src/settings/logic";
import { PRESET_PROVIDERS } from "../src/types";

/** 只取归一化后的设置本身（迁移密钥由 pendingSecrets 单独测）。 */
function load(raw: unknown) {
	return normalizeSettings(raw).settings;
}

test("normalizeSettings 空数据返回默认预设（4个预设供应商，无固定 custom）", () => {
	const settings = load({});
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
		providers: PRESET_PROVIDERS.map((p) => ({ ...p, apiKeySecretId: "", authType: "bearer" as const })),
		templates: [
			{ id: "tpl_a", name: "周报", content: "x {{tasks}}" },
			{ id: "tpl_b", name: "月报", content: "y {{tasks}}" },
		],
		selectedTemplateId: "tpl_b",
	};
	const settings = load(raw);
	assert.equal(settings.selectedTemplateId, "tpl_b");
});

test("normalizeSettings 引用的模板不存在时重置 selectedTemplateId 为空", () => {
	const raw = {
		providers: PRESET_PROVIDERS.map((p) => ({ ...p, apiKeySecretId: "", authType: "bearer" as const })),
		templates: [{ id: "tpl_a", name: "周报", content: "x" }],
		selectedTemplateId: "tpl_removed",
	};
	const settings = load(raw);
	assert.equal(settings.selectedTemplateId, "");
});

test("normalizeSettings 非字符串 selectedTemplateId 回退为空", () => {
	const settings = load({ selectedTemplateId: 123 }) as any;
	assert.equal(settings.selectedTemplateId, "");
});

test("normalizeSettings 迁移旧版 DeepSeek 配置到预设供应商", () => {
	const { settings, pendingSecrets } = normalizeSettings({
		baseUrl: "https://api.deepseek.com",
		apiKey: "sk-test",
		model: "deepseek-v4-pro",
	});
	assert.equal(settings.activeProviderId, "deepseek");
	assert.equal(settings.activeModel, "deepseek-v4-pro");
	const deepseek = settings.providers.find((p) => p.id === "deepseek")!;
	assert.equal(deepseek.apiKeySecretId, "", "尚未解析为密钥名");
	assert.ok(deepseek.models.includes("deepseek-v4-pro"));
	assert.deepEqual(pendingSecrets, [{ providerId: "deepseek", plaintext: "sk-test" }]);
});

test("normalizeSettings 迁移不匹配的旧配置创建自定义供应商", () => {
	const { settings, pendingSecrets } = normalizeSettings({
		baseUrl: "https://custom.example.com/v1",
		apiKey: "sk-custom",
		model: "my-model",
	});
	// 不匹配预设，应创建新的自定义供应商（而非固定 id="custom"）
	const custom = settings.providers.find((p) => p.type === "custom")!;
	assert.ok(custom);
	assert.equal(custom.apiKeySecretId, "");
	assert.deepEqual(custom.models, ["my-model"]);
	assert.equal(settings.activeProviderId, custom.id);
	assert.equal(settings.activeModel, "my-model");
	assert.deepEqual(pendingSecrets, [{ providerId: custom.id, plaintext: "sk-custom" }]);
});

test("normalizeSettings 保留新结构的 apiKeySecretId", () => {
	const providers = [
		{ id: "deepseek", name: "DeepSeek", type: "preset" as const, baseUrl: "https://api.deepseek.com", apiKeySecretId: "my-key", models: ["m1"], authType: "bearer" as const },
	];
	const { settings, pendingSecrets } = normalizeSettings({ providers, activeProviderId: "deepseek", activeModel: "m1" });
	assert.equal(settings.providers.length, 1);
	assert.equal(settings.providers[0].apiKeySecretId, "my-key");
	assert.equal(settings.activeProviderId, "deepseek");
	assert.equal(settings.activeModel, "m1");
	assert.deepEqual(pendingSecrets, [], "新结构无待迁移明文");
});

test("normalizeSettings 把供应商的旧明文 apiKey 收集进 pendingSecrets", () => {
	const providers = [
		{ id: "deepseek", name: "DeepSeek", type: "preset" as const, baseUrl: "https://api.deepseek.com", apiKey: "sk-old", models: ["m1"], authType: "bearer" as const },
	];
	const { settings, pendingSecrets } = normalizeSettings({ providers, activeProviderId: "deepseek" });
	assert.equal(settings.providers[0].apiKeySecretId, "");
	assert.deepEqual(pendingSecrets, [{ providerId: "deepseek", plaintext: "sk-old" }]);
});

test("normalizeSettings 同时存在密钥名与旧明文时，明文仍进入 pendingSecrets", () => {
	const providers = [
		{ id: "deepseek", name: "DeepSeek", type: "preset" as const, baseUrl: "https://api.deepseek.com", apiKeySecretId: "existing", apiKey: "sk-old", models: ["m1"], authType: "bearer" as const },
	];
	const { settings, pendingSecrets } = normalizeSettings({ providers, activeProviderId: "deepseek" });
	assert.equal(settings.providers[0].apiKeySecretId, "existing");
	assert.deepEqual(pendingSecrets, [{ providerId: "deepseek", plaintext: "sk-old" }], "明文不得被静默丢弃");
});

test("normalizeSettings 过滤器掉空的 custom 占位，保留已配置的 custom", () => {
	const providers = [
		{ id: "deepseek", name: "DeepSeek", type: "preset" as const, baseUrl: "https://api.deepseek.com", apiKey: "k", models: ["m1"], authType: "bearer" as const },
		// 旧版默认列表遗留的 custom 空壳，应被过滤
		{ id: "custom", name: "自定义", type: "custom" as const, baseUrl: "", apiKey: "", models: [], authType: "bearer" as const },
		// 用户手动添加并已配置的 custom，应保留
		{ id: "custom_abc", name: "我的供应商", type: "custom" as const, baseUrl: "https://x.com/v1", apiKey: "sk-x", models: ["m2"], authType: "bearer" as const },
	];
	const settings = load({ providers, activeProviderId: "deepseek" });
	assert.equal(settings.providers.length, 2);
	assert.equal(settings.providers.some((p) => p.id === "custom"), false, "空的 custom 占位应被移除");
	assert.equal(settings.providers.some((p) => p.id === "custom_abc"), true, "已配置的 custom 应保留");
});

test("normalizeSettings 修正不存在的 activeProviderId", () => {
	const settings = load({ activeProviderId: "nonexistent" });
	assert.notEqual(settings.activeProviderId, "nonexistent");
});

test("resolveActiveModelConfig 用密钥名向存储解析出密钥值", () => {
	const settings = load({
		providers: [
			{
				id: "deepseek",
				name: "DeepSeek",
				type: "preset" as const,
				baseUrl: "https://api.deepseek.com",
				apiKeySecretId: "my-key",
				models: ["deepseek-v4-flash"],
				authType: "bearer" as const,
			},
		],
		activeProviderId: "deepseek",
		activeModel: "deepseek-v4-flash",
	});
	const active = resolveActiveModelConfig(settings, (id) =>
		id === "my-key" ? "sk-resolved" : null
	)!;
	assert.equal(active.baseUrl, "https://api.deepseek.com");
	assert.equal(active.apiKey, "sk-resolved");
	assert.equal(active.model, "deepseek-v4-flash");
});

test("resolveActiveModelConfig 密钥名存在但存储中缺失 → apiKey 为空", () => {
	const settings = load({
		providers: [
			{
				id: "deepseek",
				name: "DeepSeek",
				type: "preset" as const,
				baseUrl: "https://api.deepseek.com",
				apiKeySecretId: "gone",
				models: ["m"],
				authType: "bearer" as const,
			},
		],
		activeProviderId: "deepseek",
		activeModel: "m",
	});
	const active = resolveActiveModelConfig(settings, () => null)!;
	assert.equal(active.apiKey, "");
});

test("resolveActiveModelConfig 未选密钥 → 不查存储且 apiKey 为空", () => {
	const settings = load({
		providers: [
			{
				id: "deepseek",
				name: "DeepSeek",
				type: "preset" as const,
				baseUrl: "https://api.deepseek.com",
				apiKeySecretId: "",
				models: ["m"],
				authType: "bearer" as const,
			},
		],
		activeProviderId: "deepseek",
		activeModel: "m",
	});
	let calls = 0;
	const active = resolveActiveModelConfig(settings, () => {
		calls++;
		return "x";
	})!;
	assert.equal(active.apiKey, "");
	assert.equal(calls, 0);
});

test("normalizeBaseUrl 归一化（通过匹配验证）", () => {
	// 带 /v1 后缀也能匹配到预设
	const settings = load({
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
	const settings = load({ providers, activeProviderId: "custom_old", activeModel: "m1" });
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
	const settings = load({ providers, activeProviderId: "custom_new", activeModel: "m1" });
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
	const settings = load({ providers }) as any;
	settings.activeProviderId = "custom_m";

	const noSecret = () => null;

	settings.activeModel = "small";
	const small = resolveActiveModelConfig(settings, noSecret)!;
	assert.equal(small.maxTokens, 2048);
	assert.equal(small.contextLength, 4096);

	settings.activeModel = "large";
	const large = resolveActiveModelConfig(settings, noSecret)!;
	assert.equal(large.maxTokens, 65535);
	assert.equal(large.contextLength, 131072);

	// 未在 customModels 中匹配的模型，不返回独立参数
	settings.activeModel = "nonexistent";
	const none = resolveActiveModelConfig(settings, noSecret)!;
	assert.equal(none.maxTokens, undefined);
	assert.equal(none.contextLength, undefined);
});

test("normalizeSettings 默认界面语言为 auto", () => {
	assert.equal(load({}).uiLanguage, "auto");
});

test("normalizeSettings 非法界面语言回退 auto", () => {
	assert.equal(load({ uiLanguage: "fr" }).uiLanguage, "auto");
	assert.equal(load({ uiLanguage: 123 }).uiLanguage, "auto");
});

test("normalizeSettings 保留合法界面语言", () => {
	assert.equal(load({ uiLanguage: "en" }).uiLanguage, "en");
	assert.equal(load({ uiLanguage: "zh" }).uiLanguage, "zh");
	assert.equal(load({ uiLanguage: "auto" }).uiLanguage, "auto");
});

test("normalizeSettings 空或纯空白报告语言回退英文", () => {
	assert.equal(load({ language: "" }).language, "English");
	assert.equal(load({ language: "   " }).language, "English");
});

test("normalizeSettings 保留自定义报告语言", () => {
	assert.equal(load({ language: "日本語" }).language, "日本語");
});

const LEGACY_EXAMPLE_NAME = "周报（示例）";
const LEGACY_EXAMPLE_CONTENT =
	"请根据以下任务数据，生成一份工作周报。\n\n报告时间范围：{{range}}\n\n要求：\n- 客观基于给定任务数据，不编造不存在的任务或事实。\n- 语言精炼、条理清晰，适合向上汇报。\n- 使用 Markdown 格式。\n\n任务数据如下：\n{{tasks}}";

test("normalizeSettings 空数据给出英文示例模板与英文报告语言", () => {
	const settings = load({});
	assert.equal(settings.language, "English");
	const tpl = settings.templates.find((t) => t.id === "tpl_weekly_example")!;
	assert.equal(tpl.name, "Weekly report (example)");
	assert.ok(tpl.content.includes("{{tasks}}"));
});

test("normalizeSettings 把未改动的旧中文示例模板迁移为英文", () => {
	const settings = load({
		templates: [
			{ id: "tpl_weekly_example", name: LEGACY_EXAMPLE_NAME, content: LEGACY_EXAMPLE_CONTENT },
		],
	});
	assert.equal(settings.templates[0].name, "Weekly report (example)");
	assert.ok(!settings.templates[0].content.includes("请根据以下任务数据"));
	assert.ok(settings.templates[0].content.includes("{{tasks}}"));
});

test("normalizeSettings 保留用户改过的示例模板", () => {
	const settings = load({
		templates: [{ id: "tpl_weekly_example", name: "我的周报", content: "自定义 {{tasks}}" }],
	});
	assert.equal(settings.templates[0].name, "我的周报");
	assert.equal(settings.templates[0].content, "自定义 {{tasks}}");
});

test("normalizeSettings 不迁移非示例 id 的模板", () => {
	const settings = load({
		templates: [{ id: "tpl_a", name: LEGACY_EXAMPLE_NAME, content: LEGACY_EXAMPLE_CONTENT }],
	});
	assert.equal(settings.templates[0].name, LEGACY_EXAMPLE_NAME);
	assert.equal(settings.templates[0].content, LEGACY_EXAMPLE_CONTENT);
});
