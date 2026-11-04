import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings } from "../src/settings/logic";
import { DEFAULT_SETTINGS, PRESET_PROVIDERS } from "../src/types";

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

// ===== #46：载入与变更共用同一套值域规则 =====

test("normalizeSettings 日期口径空数组合法：不被改回默认（#46 用户可见修正）", () => {
	const settings = load({ dateFields: [] });
	assert.deepEqual(settings.dateFields, []);
});

test("normalizeSettings 日期口径缺省（无该字段）才回退默认", () => {
	const settings = load({});
	assert.deepEqual(settings.dateFields, DEFAULT_SETTINGS.dateFields);
});

test("normalizeSettings 日期口径：载入原样保留（过滤非法项是变更侧规则）", () => {
	const settings = load({ dateFields: ["due", "bogus", "due", "completedDate"] });
	assert.deepEqual(settings.dateFields, ["due", "bogus", "due", "completedDate"]);
});

test("normalizeSettings 报告语言空回退默认、界面语言非法归一 auto（与变更一致）", () => {
	assert.equal(load({ language: "   " }).language, DEFAULT_SETTINGS.language);
	assert.equal(load({ uiLanguage: "klingon" }).uiLanguage, "auto");
});

// ===== #44 双例外约束：载入不得改写用户既有数据 =====

test("normalizeSettings 报告目录载入不 trim（去空白是变更侧规则，改写即第三处可见变更）", () => {
	assert.equal(load({ reportFolder: "  我的/报告  " }).reportFolder, "  我的/报告  ");
});

test("normalizeSettings 生成参数载入不改写（有限数值校验是变更侧规则）", () => {
	const settings = load({ maxTokens: Number.NaN, temperature: 5 });
	assert.ok(Number.isNaN(settings.maxTokens));
	assert.equal(settings.temperature, 5);
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
	assert.deepEqual(deepseek.modelCatalog, ["deepseek-v4-pro"], "清单初值＝启用集（#87）");
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
	assert.deepEqual(
		custom.customModels?.map((m) => m.modelId),
		["my-model"],
		"存量模型迁移进启用集（customModels 行，#87）"
	);
	assert.deepEqual(custom.modelCatalog, ["my-model"], "清单初值＝启用集（#87）");
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

// ===== 「思考」两档迁移（#88，ADR-0026） =====

test("normalizeSettings 保留用户的「思考」偏好；存量「自动」迁移为「开」；非法值剔除", () => {
	const raw = {
		providers: [
			{
				id: "p",
				name: "p",
				type: "preset",
				baseUrl: "https://x",
				apiKeySecretId: "k",
				models: ["a", "b"],
				authType: "bearer",
				thinkingByModel: { a: "on", b: "sometimes", c: "off", d: "auto" },
			},
		],
	};
	const settings = load(raw);
	const p = settings.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p.thinkingByModel, { a: "on", c: "off", d: "on" }, "auto → on，非法剔除");
});

test("normalizeSettings 思考迁移幂等：迁移后的取值再载入原样保留", () => {
	const once = load({
		providers: [
			{
				id: "p",
				name: "p",
				type: "preset",
				baseUrl: "https://x",
				apiKeySecretId: "k",
				models: ["a"],
				authType: "bearer",
				thinkingByModel: { a: "auto" },
			},
		],
	});
	const p1 = once.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p1.thinkingByModel, { a: "on" });
	const twice = load({ providers: [p1] });
	const p2 = twice.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p2.thinkingByModel, { a: "on" }, "迁移幂等");
});

test("normalizeSettings 旧设置无思考偏好：不发明条目（每模型读取侧缺省＝关）", () => {
	const settings = load({});
	for (const p of settings.providers) {
		assert.equal(p.thinkingByModel, undefined);
	}
});

// ===== 习得能力归一化（#89） =====

test("normalizeSettings 习得能力：合法条目保留（含测试时间戳），非法条目剔除", () => {
	const good = {
		verdict: "switchable",
		off: { name: "thinking", value: { type: "disabled" } },
		testedAt: "2026-11-04T08:00:00.000Z",
	};
	const weak = { verdict: "not-switchable", triedFields: 3, testedAt: "2026-11-04T08:00:00.000Z" };
	const raw = {
		providers: [
			{
				id: "p",
				name: "p",
				type: "preset",
				baseUrl: "https://x",
				apiKeySecretId: "k",
				models: ["a"],
				authType: "bearer",
				learnedByModel: {
					good,
					weak,
					badVerdict: { verdict: "forced", testedAt: "t" },
					interrupted: { verdict: "interrupted", testedAt: "t" },
					noTime: { verdict: "not-detected" },
					junk: "x",
				},
			},
		],
	};
	const settings = load(raw);
	const p = settings.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p.learnedByModel, { good, weak }, "只留合法条目（「中断」不落条目）");
});

test("normalizeSettings 习得能力：无合法条目不发明（读取侧＝未知，可重新测试）", () => {
	const settings = load({
		providers: [
			{
				id: "p",
				name: "p",
				type: "preset",
				baseUrl: "https://x",
				apiKeySecretId: "k",
				models: ["a"],
				authType: "bearer",
				learnedByModel: { a: { verdict: "interrupted", testedAt: "t" }, b: 42 },
			},
		],
	});
	assert.equal(settings.providers[0].learnedByModel, undefined);
});

test("normalizeSettings 习得能力归一化幂等：归一后载入原样保留", () => {
	const entry = { verdict: "not-detected", testedAt: "2026-11-04T08:00:00.000Z" };
	const once = load({
		providers: [
			{
				id: "p",
				name: "p",
				type: "preset",
				baseUrl: "https://x",
				apiKeySecretId: "k",
				models: ["a"],
				authType: "bearer",
				learnedByModel: { a: entry },
			},
		],
	});
	const p1 = once.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p1.learnedByModel, { a: entry });
	const twice = load({ providers: [p1] });
	assert.deepEqual(twice.providers.find((x) => x.id === "p")!.learnedByModel, { a: entry }, "幂等");
});

// ===== 模型清单与启用集迁移（#87，ADR-0026） =====

test("normalizeSettings 迁移：存量模型成为启用集且模型清单初值＝启用集", () => {
	const providers = [
		{
			id: "deepseek",
			name: "DeepSeek",
			type: "preset" as const,
			baseUrl: "https://api.deepseek.com",
			apiKeySecretId: "k",
			models: ["a", "b"],
			authType: "bearer" as const,
		},
	];
	const settings = load({ providers, activeProviderId: "deepseek", activeModel: "a" });
	const p = settings.providers.find((x) => x.id === "deepseek")!;
	assert.deepEqual(p.models, ["a", "b"], "存量模型全部保留为启用集");
	assert.deepEqual(p.modelCatalog, ["a", "b"], "清单初值＝启用集");
});

test("normalizeSettings 迁移自定义供应商：存量模型行并入模型清单（空白行不入）", () => {
	const providers = [
		{
			id: "custom_x",
			name: "旧自定义",
			type: "custom" as const,
			baseUrl: "https://x.com/v1",
			apiKeySecretId: "k",
			models: [],
			authType: "bearer" as const,
			customModels: [
				{ id: "mc1", modelId: "m1", maxTokens: 4096 },
				{ id: "mc2", modelId: "  " },
			],
		},
	];
	const settings = load({ providers, activeProviderId: "custom_x", activeModel: "m1" });
	const p = settings.providers.find((x) => x.id === "custom_x")!;
	assert.deepEqual(p.modelCatalog, ["m1"]);
	assert.equal(p.customModels!.length, 2, "模型行全部保留");
	assert.equal(p.customModels![1].modelId, "  ");
});

test("normalizeSettings 已有模型清单不被启用集并入（已失效标记跨载入存活）", () => {
	const providers = [
		{
			id: "p",
			name: "p",
			type: "preset" as const,
			baseUrl: "https://x",
			apiKeySecretId: "k",
			models: ["a", "x"],
			modelCatalog: ["x"],
			authType: "bearer" as const,
		},
	];
	const settings = load({ providers, activeProviderId: "p", activeModel: "a" });
	const p = settings.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p.modelCatalog, ["x"], "a 不被并入清单——它的已失效状态保留");
});

test("normalizeSettings 迁移幂等：二次归一后模型字段不再变化", () => {
	const providers = [
		{
			id: "p",
			name: "p",
			type: "preset" as const,
			baseUrl: "https://x",
			apiKeySecretId: "k",
			models: ["a", "b"],
			authType: "bearer" as const,
		},
	];
	const once = load({ providers, activeProviderId: "p", activeModel: "a" });
	const twice = load(once);
	for (const id of ["p"]) {
		const a = once.providers.find((x) => x.id === id)!;
		const b = twice.providers.find((x) => x.id === id)!;
		assert.deepEqual(b.models, a.models);
		assert.deepEqual(b.modelCatalog, a.modelCatalog);
	}
});

test("normalizeSettings 模型清单非法值照旧剔除：去空白、去重、剔除非字符串", () => {
	const providers = [
		{
			id: "p",
			name: "p",
			type: "preset" as const,
			baseUrl: "https://x",
			apiKeySecretId: "k",
			models: ["a"],
			modelCatalog: [" a ", "a", "", "  ", 7, "b"],
			authType: "bearer" as const,
		},
	];
	const settings = load({ providers, activeProviderId: "p" });
	const p = settings.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p.modelCatalog, ["a", "b"]);
});

test("normalizeSettings 模型清单整块非法（非数组）按缺失对待：回退清单初值＝启用集", () => {
	const providers = [
		{
			id: "p",
			name: "p",
			type: "preset" as const,
			baseUrl: "https://x",
			apiKeySecretId: "k",
			models: ["a"],
			modelCatalog: "corrupt",
			authType: "bearer" as const,
		},
	];
	const settings = load({ providers, activeProviderId: "p" });
	const p = settings.providers.find((x) => x.id === "p")!;
	assert.deepEqual(p.modelCatalog, ["a"], "非法清单不残留，按迁移补默认");
});
