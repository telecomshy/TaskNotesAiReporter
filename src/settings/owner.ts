/**
 * 设置 owner：**自持状态与落盘**。
 *
 * 读写只经它的查询（`get`）与命令（`apply`）；接线层不再逐字段搬运设置切片
 * （此前 main.ts 的 getState/commit 要手工镜像 10 个字段，加字段而漏改 commit 即静默丢改动）。
 *
 * 不变式：owner 是设置的**唯一可变副本**。命令就地改写它、并由命令自身维护值域不变式，
 * 不再有「getState 返回浅拷贝、templates/dateFields 却与外部共享引用」的偷改路径（见 #46）。
 *
 * 纯逻辑 + 注入 IO，无 obsidian、无 DOM。
 */

import type { TaskNotesAIHelperSettings } from "../types";

/** owner 的外部 IO：落盘与按名读取密钥。 */
export interface SettingsOwnerIO {
	/** 持久化整个设置（`data.json` 形状不变）。 */
	save(settings: TaskNotesAIHelperSettings): Promise<void>;
	/** 按名读取密钥值；缺失返回 null。 */
	getSecret(id: string): string | null;
}

/** 设置 owner。 */
export interface SettingsOwner {
	/**
	 * 查询当前设置。
	 * 返回的是 owner 自持的唯一副本——**调用方只读，不得改写**；一切变更走 `apply`。
	 */
	get(): TaskNotesAIHelperSettings;
	/**
	 * 执行一次变更：转移函数就地改写 owner 自持的状态（并就地维护值域不变式），随后落盘一次。
	 */
	apply(command: (state: TaskNotesAIHelperSettings) => void): void;
	/** 按名读取密钥值（供应商模块解析凭据用）。 */
	readSecret(id: string): string | null;
	/** 立即落盘一次（供载入后等边界场景；日常变更经 `apply` 自动落盘）。 */
	persist(): void;
}

/** 构造设置 owner。`initial` 通常是 `loadSettings` 的产物。 */
export function createSettingsOwner(
	initial: TaskNotesAIHelperSettings,
	io: SettingsOwnerIO
): SettingsOwner {
	let current = initial;
	return {
		get: () => current,
		apply: (command) => {
			command(current);
			void io.save(current);
		},
		readSecret: (id) => io.getSecret(id),
		persist: () => {
			void io.save(current);
		},
	};
}
