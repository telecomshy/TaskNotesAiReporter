/**
 * 密钥迁移：把旧版设置里的明文 API 密钥导入 Obsidian SecretStorage，只保留密钥名。
 * 保持无 obsidian 依赖——读写通过注入的 SecretStore 完成，可单元测试。
 */

import type { ModelProvider, TaskNotesAIHelperSettings } from "../types";

/** SecretStorage 的密钥 id 前缀：短前缀避免与其它插件冲突，同时让密钥名更短。 */
const SECRET_ID_PREFIX = "tnar";

/**
 * 由供应商 id 派生 SecretStorage 合法 id（小写字母数字与连字符）。
 * 末尾附加原始 id 的短哈希，避免归一后撞名（如 `custom_abc` 与 `custom-abc`）。
 */
export function secretIdForProvider(providerId: string): string {
	const slug = providerId
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${SECRET_ID_PREFIX}-${slug || "provider"}-${hashId(providerId)}`;
}

/** FNV-1a 32 位哈希的前 6 位十六进制，仅用于区分密钥名。 */
function hashId(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

/** 把密钥名解析为密钥值：去空白；空名不查询；存储缺失回退空串。 */
export function resolveSecretValue(
	secretId: string,
	getSecret: (id: string) => string | null
): string {
	const id = secretId.trim();
	if (id === "") return "";
	return getSecret(id) ?? "";
}

/** 一条待导入的旧版明文密钥，由 `normalizeSettings` 收集。 */
export interface PendingSecret {
	providerId: string;
	plaintext: string;
}

/** 密钥存储的读写接口（由 Obsidian 边界注入 `app.secretStorage`）。 */
export interface SecretStore {
	get(id: string): string | null;
	set(id: string, value: string): void;
}

export interface ImportPendingSecretsResult {
	settings: TaskNotesAIHelperSettings;
	changed: boolean;
}

/**
 * 把待导入的旧版明文密钥写入密钥存储，并改写供应商的 `apiKeySecretId`。
 * 幂等：无待导入项时不写入、不标记变更。
 * 不覆盖：绝不覆盖存储中已有不同值的密钥——已选密钥名沿用；派生名冲突则追加数字后缀。
 * 纯空白明文会被清理但不写入。只要处理过明文就标记 changed，以便边界覆盖磁盘、清除明文残留。
 */
export function importPendingSecrets(
	settings: TaskNotesAIHelperSettings,
	pendingSecrets: readonly PendingSecret[],
	store: SecretStore
): ImportPendingSecretsResult {
	if (pendingSecrets.length === 0) return { settings, changed: false };

	const plaintextByProvider = new Map<string, string>();
	for (const pending of pendingSecrets) {
		plaintextByProvider.set(pending.providerId, pending.plaintext);
	}

	let changed = false;
	const providers = settings.providers.map((p): ModelProvider => {
		const plaintext = plaintextByProvider.get(p.id);
		if (plaintext === undefined) return p;

		changed = true;
		if (plaintext.trim() === "") return p;

		const selected = p.apiKeySecretId.trim();
		if (selected !== "") {
			// 已选密钥名：仅当该名下无值（悬空引用）时补写，否则保留既有密钥不动。
			if (store.get(selected) === null) store.set(selected, plaintext);
			return { ...p, apiKeySecretId: selected };
		}

		const id = freeSecretId(store, secretIdForProvider(p.id), plaintext);
		store.set(id, plaintext);
		return { ...p, apiKeySecretId: id };
	});

	return { settings: { ...settings, providers }, changed };
}

/** 从 base 起找一个未被不同值占用的密钥名；同名同值则复用。 */
function freeSecretId(store: SecretStore, base: string, value: string): string {
	let id = base;
	for (let suffix = 2; ; suffix++) {
		const existing = store.get(id);
		if (existing === null || existing === value) return id;
		id = `${base}-${suffix}`;
	}
}
