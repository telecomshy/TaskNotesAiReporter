import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSettings, type SettingsIO } from "../src/settings/loadSettings";
import { secretIdForProvider } from "../src/settings/secrets";
import type { TaskNotesAIHelperSettings } from "../src/types";

interface FakeIO {
	io: SettingsIO;
	/** IO 调用顺序，用于断言「归一 → 迁移 → 按需落盘」。 */
	events: string[];
	saved: TaskNotesAIHelperSettings[];
	secrets: Record<string, string>;
}

function fakeIO(raw: unknown, initialSecrets: Record<string, string> = {}): FakeIO {
	const events: string[] = [];
	const saved: TaskNotesAIHelperSettings[] = [];
	const secrets: Record<string, string> = { ...initialSecrets };
	return {
		events,
		saved,
		secrets,
		io: {
			loadRaw: async () => {
				events.push("loadRaw");
				return raw;
			},
			save: async (settings) => {
				events.push("save");
				saved.push(settings);
			},
			getSecret: (id) => {
				events.push("getSecret");
				return id in secrets ? secrets[id] : null;
			},
			setSecret: (id, value) => {
				events.push("setSecret");
				secrets[id] = value;
			},
		},
	};
}

/** 一条旧版明文密钥的新结构供应商原始数据。 */
function rawWithLegacySecret(plaintext: string): unknown {
	return {
		providers: [
			{
				id: "deepseek",
				name: "DeepSeek",
				type: "preset",
				baseUrl: "https://api.deepseek.com",
				apiKey: plaintext,
				models: ["m1"],
				authType: "bearer",
			},
		],
		activeProviderId: "deepseek",
		activeModel: "m1",
	};
}

test("loadSettings 无待迁移明文：不落盘，返回归一化设置", async () => {
	const fake = fakeIO({});
	const settings = await loadSettings(fake.io);
	assert.deepEqual(fake.events, ["loadRaw"], "无待迁移项时不应触碰密钥或落盘");
	assert.deepEqual(fake.saved, []);
	assert.equal(settings.reportFolder, "TaskNotes/Reports");
});

test("loadSettings 有旧明文：迁移写入密钥后落盘一次", async () => {
	const fake = fakeIO(rawWithLegacySecret("sk-old"));
	const settings = await loadSettings(fake.io);

	assert.deepEqual(fake.events, ["loadRaw", "getSecret", "setSecret", "save"]);
	assert.deepEqual(fake.saved, [settings], "恰好落盘一次且落的是最终设置");

	const id = secretIdForProvider("deepseek");
	assert.equal(fake.secrets[id], "sk-old");
	assert.equal(settings.providers[0].apiKeySecretId, id);
});

test("loadSettings 迁移先于落盘：save 是最后一个 IO 调用", async () => {
	const fake = fakeIO(rawWithLegacySecret("sk-old"));
	await loadSettings(fake.io);
	assert.equal(fake.events[fake.events.length - 1], "save");
	assert.ok(
		fake.events.indexOf("setSecret") < fake.events.indexOf("save"),
		"密钥写入应先于落盘"
	);
});

test("loadSettings 纯空白旧明文：归一阶段即丢弃，不写密钥", async () => {
	const fake = fakeIO(rawWithLegacySecret("   "));
	const settings = await loadSettings(fake.io);
	assert.deepEqual(fake.events, ["loadRaw", "save"], "空白明文不进入待迁移项；未配置清空启用集触发一次落盘");
	assert.deepEqual(fake.secrets, {});
	assert.equal(settings.providers[0].apiKeySecretId, "");
	assert.deepEqual(settings.providers[0].models, [], "未配置（密钥名为空）⇒ 无启用模型");
});

test("loadSettings 旧明文迁移回填密钥名后：启用集保留（清理规则不误伤）", async () => {
	const fake = fakeIO(rawWithLegacySecret("sk-old"));
	const settings = await loadSettings(fake.io);
	assert.deepEqual(settings.providers[0].models, ["m1"], "配置过（迁移后有密钥名）则保留");
});

test("loadSettings 预设供应商密钥名为空：载入清空启用集并落盘（#90）", async () => {
	const fake = fakeIO({
		providers: [
			{
				id: "kimi",
				name: "Kimi",
				type: "preset",
				baseUrl: "https://api.moonshot.cn/v1",
				apiKeySecretId: "",
				models: ["kimi-latest", "moonshot-v1-8k"],
				modelCatalog: ["kimi-latest", "moonshot-v1-8k"],
				authType: "bearer",
			},
		],
		activeProviderId: "kimi",
		activeModel: "",
	});
	const settings = await loadSettings(fake.io);
	assert.deepEqual(settings.providers[0].models, [], "未配置 ⇒ 无任何模型");
	assert.deepEqual(fake.saved, [settings], "存量残留清理落盘一次");
	assert.deepEqual(fake.events, ["loadRaw", "save"]);
});

test("loadSettings 预设供应商已配置密钥名：启用集保留、不落盘", async () => {
	const fake = fakeIO({
		providers: [
			{
				id: "kimi",
				name: "Kimi",
				type: "preset",
				baseUrl: "https://api.moonshot.cn/v1",
				apiKeySecretId: "tnar-kimi-x",
				models: ["kimi-latest"],
				authType: "bearer",
			},
		],
		activeProviderId: "kimi",
		activeModel: "kimi-latest",
	});
	const settings = await loadSettings(fake.io);
	assert.deepEqual(settings.providers[0].models, ["kimi-latest"]);
	assert.equal(settings.activeModel, "kimi-latest");
	assert.deepEqual(fake.events, ["loadRaw"], "无变更不落盘");
});

test("loadSettings 自定义供应商密钥名为空：模型行保留（手工配置不受清理影响）", async () => {
	const fake = fakeIO({
		providers: [
			{
				id: "custom_x",
				name: "自定义",
				type: "custom",
				baseUrl: "http://localhost:3000/v1",
				apiKeySecretId: "",
				authType: "bearer",
				customModels: [{ id: "mc1", modelId: "m" }],
			},
		],
		activeProviderId: "custom_x",
		activeModel: "",
	});
	const settings = await loadSettings(fake.io);
	assert.deepEqual(
		(settings.providers[0] as { customModels?: unknown[] }).customModels,
		[{ id: "mc1", modelId: "m" }]
	);
	assert.deepEqual(fake.events, ["loadRaw"]);
});

// ===== 接口方言与内置预设补齐（#105） =====

test("loadSettings 存量供应商缺 apiStyle：读作 OpenAI 兼容，不发明缺省值、不落盘", async () => {
	const fake = fakeIO({
		providers: [
			{
				id: "custom_x",
				name: "自定义",
				type: "custom",
				baseUrl: "http://localhost:3000/v1",
				apiKeySecretId: "tnar-x",
				authType: "bearer",
				customModels: [{ id: "mc1", modelId: "m" }],
			},
		],
		activeProviderId: "custom_x",
		activeModel: "m",
	});
	const settings = await loadSettings(fake.io);
	const custom = settings.providers.find((p) => p.id === "custom_x");
	assert.ok(custom);
	assert.equal("apiStyle" in custom, false, "载入不补缺省值（升级不改写 data.json）");
	assert.deepEqual(fake.events, ["loadRaw"], "无迁移即不落盘");
});

test("loadSettings 合法 apiStyle 原样保留；非法值剔除", async () => {
	const fake = fakeIO({
		providers: [
			{
				id: "custom_a",
				name: "Anthropic 网关",
				type: "custom",
				baseUrl: "https://gateway.example.com/v1",
				apiKeySecretId: "tnar-a",
				apiStyle: "anthropic",
				authType: "bearer",
				customModels: [{ id: "mc1", modelId: "claude-sonnet-4-6" }],
			},
			{
				id: "custom_b",
				name: "坏值",
				type: "custom",
				baseUrl: "https://gateway.example.com/v1",
				apiKeySecretId: "tnar-b",
				apiStyle: "gemini",
				authType: "bearer",
				customModels: [{ id: "mc2", modelId: "m" }],
			},
		],
		activeProviderId: "custom_a",
		activeModel: "",
	});
	const settings = await loadSettings(fake.io);
	assert.equal(settings.providers.find((p) => p.id === "custom_a")?.apiStyle, "anthropic");
	assert.equal(
		"apiStyle" in (settings.providers.find((p) => p.id === "custom_b") ?? {}),
		false,
		"非法值剔除（读取侧回落 OpenAI 兼容）"
	);
	assert.deepEqual(fake.events, ["loadRaw"]);
});

test("loadSettings 内置预设补齐（#105）：追加到末尾、不覆盖既有项、幂等、不因补齐落盘", async () => {
	const raw = {
		providers: [
			{
				id: "kimi",
				name: "Kimi",
				type: "preset",
				baseUrl: "https://api.moonshot.cn/v1",
				apiKeySecretId: "tnar-kimi",
				models: ["kimi-latest"],
				authType: "bearer",
			},
			{
				id: "custom_z",
				name: "自定义",
				type: "custom",
				baseUrl: "http://localhost:3000/v1",
				apiKeySecretId: "",
				authType: "bearer",
				customModels: [],
			},
		],
		activeProviderId: "kimi",
		activeModel: "kimi-latest",
	};
	const fake = fakeIO(raw);
	const settings = await loadSettings(fake.io);
	const ids = settings.providers.map((p) => p.id);
	assert.equal(ids[0], "kimi", "既有顺序不变");
	assert.equal(ids[1], "custom_z");
	assert.deepEqual(
		ids.slice(2),
		["deepseek", "qwen", "minimax", "anthropic", "openai"],
		"缺失的内置预设按定义顺序追加到末尾"
	);
	const openai = settings.providers.find((p) => p.id === "openai");
	assert.equal(openai?.baseUrl, "https://api.openai.com/v1");
	assert.equal("apiStyle" in (openai ?? {}), false, "OpenAI 预设方言内置固定（OpenAI 兼容），不发明字段");
	assert.equal(openai?.apiKeySecretId, "");
	assert.equal(openai?.authType, "bearer");
	assert.deepEqual(openai?.models, [], "未配置 ⇒ 无启用模型");
	const anthropic = settings.providers.find((p) => p.id === "anthropic");
	assert.equal(anthropic?.baseUrl, "https://api.anthropic.com/v1");
	assert.equal(anthropic?.apiStyle, "anthropic");
	assert.equal(anthropic?.apiKeySecretId, "");
	assert.equal(anthropic?.authType, "bearer");
	assert.deepEqual(
		settings.providers.find((p) => p.id === "kimi")?.models,
		["kimi-latest"],
		"既有供应商的启用集不被覆盖"
	);
	assert.deepEqual(fake.events, ["loadRaw"], "补齐不强制落盘（升级本身不改设置文件）");

	// 幂等：再载入一次，顺序与数量都不变
	const again = await loadSettings(fakeIO({ ...raw, providers: settings.providers.map((p) => ({ ...p })) }).io);
	assert.deepEqual(again.providers.map((p) => p.id), ids, "补齐幂等");
});

test("loadSettings Anthropic 预设进入「未配置 ⇒ 无启用模型」清理路径（规则对预设通用）", async () => {
	const fake = fakeIO({
		providers: [
			{
				id: "anthropic",
				name: "Anthropic (Claude)",
				type: "preset",
				baseUrl: "https://api.anthropic.com/v1",
				apiStyle: "anthropic",
				apiKeySecretId: "",
				models: ["claude-sonnet-4-6"],
				modelCatalog: ["claude-sonnet-4-6"],
				authType: "bearer",
			},
		],
		activeProviderId: "anthropic",
		activeModel: "",
	});
	const settings = await loadSettings(fake.io);
	assert.deepEqual(settings.providers.find((p) => p.id === "anthropic")?.models, []);
	assert.deepEqual(fake.saved, [settings], "清理存量残留落盘一次");
});

test("loadSettings 保留用户既有设置（非默认值不被覆盖）", async () => {
	const fake = fakeIO({
		reportFolder: "我的/报告",
		dateFields: ["due"],
		weekStartsOnMonday: false,
		language: "日本語",
		uiLanguage: "zh",
		templates: [{ id: "tpl_a", name: "周报", content: "x {{tasks}}" }],
		selectedTemplateId: "tpl_a",
	});
	const settings = await loadSettings(fake.io);
	assert.equal(settings.reportFolder, "我的/报告");
	assert.deepEqual(settings.dateFields, ["due"]);
	assert.equal(settings.weekStartsOnMonday, false);
	assert.equal(settings.language, "日本語");
	assert.equal(settings.uiLanguage, "zh");
	assert.equal(settings.selectedTemplateId, "tpl_a");
	assert.deepEqual(fake.events, ["loadRaw"]);
});
