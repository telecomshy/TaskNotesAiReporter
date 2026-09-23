/**
 * 设置 owner：**自持状态与落盘**。
 *
 * 读写只经它的查询（`get`）与命令（`apply`）；接线层不再逐字段搬运设置切片
 * （此前 main.ts 的 getState/commit 要手工镜像 10 个字段，加字段而漏改 commit 即静默丢改动）。
 *
 * 不变式：owner 是设置的**唯一可变副本**。命令就地改写它、并由命令自身维护值域不变式，
 * 不再有「getState 返回浅拷贝、templates/dateFields 却与外部共享引用」的偷改路径（见 #46）。
 * 查询交出的是**深只读快照**，调用方无法借共享引用改写状态。
 *
 * 落盘失败**不被吞掉**：`apply` 把保存的 Promise 交回调用方，等待与传播都由调用方决定（#51 会消费它）。
 *
 * 纯逻辑 + 注入 IO，无 obsidian、无 DOM。
 */

import type {
	DateField,
	ModelProvider,
	ReportTemplate,
	TaskNotesAIHelperSettings,
} from "../types";

/**
 * 设置的只读快照：查询交出的东西。
 *
 * 字段不可重新赋值、数组不可增删改（`readonly T[]`）；元素本身保持可变类型，
 * 使只读消费方（如 `resolveActive`）无需收窄即可工作。
 * 想改状态只能走命令——这是 #46「不借共享引用偷改状态」的封口。
 */
export type SettingsSnapshot = Readonly<
	Omit<TaskNotesAIHelperSettings, "providers" | "templates" | "dateFields">
> & {
	readonly providers: readonly ModelProvider[];
	readonly templates: readonly ReportTemplate[];
	readonly dateFields: readonly DateField[];
};

/** owner 的外部 IO：落盘与按名读取密钥。 */
export interface SettingsOwnerIO {
	/** 持久化整个设置（`data.json` 形状除 `taskSource` 外不变）。 */
	save(settings: TaskNotesAIHelperSettings): Promise<void>;
	/** 按名读取密钥值；缺失返回 null。 */
	getSecret(id: string): string | null;
}

/** 设置 owner。 */
export interface SettingsOwner {
	/**
	 * 查询当前设置的只读快照——**调用方不得改写**（字段不可赋值、数组不可增删）；一切变更走 `apply`。
	 */
	get(): SettingsSnapshot;
	/**
	 * 执行一次变更：转移函数就地改写 owner 自持的状态（并就地维护值域不变式），随后落盘一次。
	 * 返回落盘的 Promise，失败**不被吞掉**，由调用方等待或传播。
	 */
	apply(command: (state: TaskNotesAIHelperSettings) => void): Promise<void>;
	/** 按名读取密钥值（供应商模块解析凭据用）。 */
	readSecret(id: string): string | null;
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
			return io.save(current);
		},
		readSecret: (id) => io.getSecret(id),
	};
}
