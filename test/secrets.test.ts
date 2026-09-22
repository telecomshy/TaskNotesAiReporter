import { test } from "node:test";
import assert from "node:assert/strict";
import {
	importPendingSecrets,
	resolveSecretValue,
	secretIdForProvider,
	type PendingSecret,
	type SecretStore,
} from "../src/settings/secrets";
import type { TaskNotesAIHelperSettings } from "../src/types";

function settingsWith(providers: TaskNotesAIHelperSettings["providers"]): TaskNotesAIHelperSettings {
	return {
		providers,
		activeProviderId: providers[0]?.id ?? "",
		activeModel: "",
		temperature: 0.7,
		maxTokens: 8192,
		timeoutSeconds: 60,
		reportFolder: "TaskNotes/Reports",
		dateFields: ["completedDate"],
		weekStartsOnMonday: true,
		language: "English",
		uiLanguage: "auto",
		taskSource: "tasknotes",
		templates: [],
		selectedTemplateId: "",
	};
}

function provider(over: Partial<TaskNotesAIHelperSettings["providers"][number]> & { id: string }) {
	return {
		name: over.id,
		type: "preset" as const,
		baseUrl: "https://example.com",
		apiKeySecretId: "",
		models: [],
		authType: "bearer" as const,
		...over,
	};
}

function pending(providerId: string, plaintext: string): PendingSecret {
	return { providerId, plaintext };
}

/** 内存版 SecretStore，记录写入并把值读回。 */
function fakeStore(initial: Record<string, string> = {}): {
	store: SecretStore;
	writes: Array<[string, string]>;
} {
	const values: Record<string, string> = { ...initial };
	const writes: Array<[string, string]> = [];
	return {
		store: {
			get: (id) => (id in values ? values[id] : null),
			set: (id, value) => {
				values[id] = value;
				writes.push([id, value]);
			},
		},
		writes,
	};
}

test("resolveSecretValue 去空白后按名取值，空名不查询", () => {
	const seen: string[] = [];
	const get = (id: string) => {
		seen.push(id);
		return id === "k" ? "sk" : null;
	};
	assert.equal(resolveSecretValue("  k  ", get), "sk");
	assert.deepEqual(seen, ["k"], "应按去空白后的名字查询");
	assert.equal(resolveSecretValue("   ", get), "");
	assert.deepEqual(seen, ["k"], "空名不应触发查询");
});

test("resolveSecretValue 存储中缺失时回退空串", () => {
	assert.equal(resolveSecretValue("gone", () => null), "");
});

test("secretIdForProvider 生成 SecretStorage 合法 id（短前缀 + 小写字母数字与连字符）", () => {
	const id = secretIdForProvider("custom_ABC.1");
	assert.match(id, /^[a-z0-9-]+$/);
	assert.ok(id.startsWith("tnar-"));
	assert.ok(id.includes("custom-abc-1"));
});

test("secretIdForProvider 对归一后相同的 id 仍产出不同密钥名（含哈希）", () => {
	assert.notEqual(secretIdForProvider("custom_abc"), secretIdForProvider("custom-abc"));
});

test("importPendingSecrets 把旧明文导入存储并写入密钥名", () => {
	const { store, writes } = fakeStore();
	const { settings, changed } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek" })]),
		[pending("deepseek", "sk-1")],
		store
	);
	assert.equal(changed, true);
	assert.deepEqual(writes, [[secretIdForProvider("deepseek"), "sk-1"]]);
	assert.equal(settings.providers[0].apiKeySecretId, secretIdForProvider("deepseek"));
});

test("importPendingSecrets 已选密钥名悬空时，用明文补写该名", () => {
	const { store, writes } = fakeStore();
	const { settings, changed } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek", apiKeySecretId: "existing" })]),
		[pending("deepseek", "sk-old")],
		store
	);
	assert.equal(changed, true);
	assert.deepEqual(writes, [["existing", "sk-old"]]);
	assert.equal(settings.providers[0].apiKeySecretId, "existing");
});

test("importPendingSecrets 已选密钥名已有值时，不覆盖，仅标记变更", () => {
	const { store, writes } = fakeStore({ existing: "user-secret" });
	const { settings, changed } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek", apiKeySecretId: "existing" })]),
		[pending("deepseek", "sk-old")],
		store
	);
	assert.equal(changed, true);
	assert.deepEqual(writes, [], "不得覆盖既有密钥");
	assert.equal(store.get("existing"), "user-secret");
	assert.equal(settings.providers[0].apiKeySecretId, "existing");
});

test("importPendingSecrets 派生名被不同值占用时追加后缀，且不覆盖已有密钥", () => {
	const base = secretIdForProvider("deepseek");
	const { store, writes } = fakeStore({ [base]: "someone-elses" });
	const { settings } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek" })]),
		[pending("deepseek", "sk-1")],
		store
	);
	assert.deepEqual(writes, [[`${base}-2`, "sk-1"]]);
	assert.equal(store.get(base), "someone-elses", "既有密钥不得被覆盖");
	assert.equal(settings.providers[0].apiKeySecretId, `${base}-2`);
});

test("importPendingSecrets 派生名已有相同值时复用该名（不追加后缀）", () => {
	const base = secretIdForProvider("deepseek");
	const { store } = fakeStore({ [base]: "sk-1" });
	const { settings } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek" })]),
		[pending("deepseek", "sk-1")],
		store
	);
	assert.equal(settings.providers[0].apiKeySecretId, base);
});

test("importPendingSecrets 幂等：无待导入项时不写、不标记变更", () => {
	const { store, writes } = fakeStore();
	const input = settingsWith([provider({ id: "deepseek", apiKeySecretId: "already" })]);
	const { settings, changed } = importPendingSecrets(input, [], store);
	assert.equal(changed, false);
	assert.deepEqual(writes, []);
	assert.equal(settings, input);
});

test("importPendingSecrets 待导入项指向不存在的供应商时无操作", () => {
	const { store, writes } = fakeStore();
	const { changed } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek" })]),
		[pending("ghost", "sk-1")],
		store
	);
	assert.equal(changed, false);
	assert.deepEqual(writes, []);
});

test("importPendingSecrets 忽略纯空白明文（不写入、但标记清理）", () => {
	const { store, writes } = fakeStore();
	const { changed } = importPendingSecrets(
		settingsWith([provider({ id: "deepseek" })]),
		[pending("deepseek", "   ")],
		store
	);
	assert.equal(changed, true, "清理掉空白明文也算变更");
	assert.deepEqual(writes, []);
});
