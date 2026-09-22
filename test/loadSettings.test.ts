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

test("loadSettings 纯空白旧明文：归一阶段即丢弃，不触发落盘", async () => {
	const fake = fakeIO(rawWithLegacySecret("   "));
	const settings = await loadSettings(fake.io);
	assert.deepEqual(fake.events, ["loadRaw"], "空白明文不进入待迁移项，故无落盘");
	assert.deepEqual(fake.secrets, {});
	assert.equal(settings.providers[0].apiKeySecretId, "");
});

test("loadSettings 保留用户既有设置（非默认值不被覆盖）", async () => {
	const fake = fakeIO({
		reportFolder: "我的/报告",
		dateFields: ["due"],
		weekStartsOnMonday: false,
		language: "日本語",
		uiLanguage: "zh",
		taskSource: "obsidian-tasks",
		templates: [{ id: "tpl_a", name: "周报", content: "x {{tasks}}" }],
		selectedTemplateId: "tpl_a",
	});
	const settings = await loadSettings(fake.io);
	assert.equal(settings.reportFolder, "我的/报告");
	assert.deepEqual(settings.dateFields, ["due"]);
	assert.equal(settings.weekStartsOnMonday, false);
	assert.equal(settings.language, "日本語");
	assert.equal(settings.uiLanguage, "zh");
	assert.equal(settings.taskSource, "obsidian-tasks");
	assert.equal(settings.selectedTemplateId, "tpl_a");
	assert.deepEqual(fake.events, ["loadRaw"]);
});
