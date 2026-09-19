/**
 * 载入组合：把「归一 → 迁移旧版明文密钥 → 按需落盘」串成一个接受注入 IO 的可测函数。
 * 无 obsidian、无 DOM，可在 Node 中单测（见 ADR-0012）。
 * 插件入口只负责注入真实 IO 并构造门面。
 */

import type { TaskNotesAIHelperSettings } from "../types";
import { normalizeSettings } from "./logic";
import { importPendingSecrets, type SecretStore } from "./secrets";

/** 载入所需的外部 IO：读原始数据、落盘、按名读写密钥。 */
export interface SettingsIO {
	/** 读取磁盘上的原始设置数据（可能是任意旧结构）。 */
	loadRaw(): Promise<unknown>;
	/** 持久化最终设置。 */
	save(settings: TaskNotesAIHelperSettings): Promise<void>;
	/** 按名读取密钥值；缺失返回 null。 */
	getSecret(id: string): string | null;
	/** 写入密钥值。 */
	setSecret(id: string, value: string): void;
}

/**
 * 载入并组合最终设置。
 * 顺序：归一原始数据 → 迁移待导入的旧版明文密钥 → 仅当迁移发生变更时落盘一次。
 */
export async function loadSettings(io: SettingsIO): Promise<TaskNotesAIHelperSettings> {
	const raw = await io.loadRaw();
	const { settings: normalized, pendingSecrets } = normalizeSettings(raw);
	const store: SecretStore = {
		get: (id) => io.getSecret(id),
		set: (id, value) => io.setSecret(id, value),
	};
	const { settings, changed } = importPendingSecrets(normalized, pendingSecrets, store);
	if (changed) await io.save(settings);
	return settings;
}
