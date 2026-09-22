/**
 * 来源工厂：把「来源」选择映射到一个 TaskRepository 后端。
 *
 * 纯逻辑：只依赖注入的后端构造器，不静态依赖 obsidian，可在 Node 单测。
 * 生产接线（真实的 Obsidian / metadataCache 后端）见 ./obsidianSource（同 ./repository 与 ./obsidian 的拆分）。
 *
 * 契约：恒返回一个 TaskRepository，**不返回 null**。「来源不可用」由该后端的 `list()` 返回 null 表达，
 * 与现有 TaskNotes 后端行为一致，调用方无需新增 null-repo 处理。
 */

import type { App } from "obsidian";
import type { TaskSource } from "../types";
import type { TaskRepository } from "./repository";

/** 各来源对应的后端构造器；由边界注入使选择逻辑可测。 */
export interface SourceBackends {
	tasknotes(app: App): TaskRepository;
	obsidianTasks(app: App): TaskRepository;
}

/** 按来源选择后端。 */
export function selectSourceRepository(
	source: TaskSource,
	app: App,
	backends: SourceBackends
): TaskRepository {
	return source === "obsidian-tasks" ? backends.obsidianTasks(app) : backends.tasknotes(app);
}

/**
 * 「来源不可用」后端：插件未启用 / 后端尚未实现时使用。
 * `list()` → null 让报告弹窗走「未检测到插件」提示；其余退化为空。
 */
export function unavailableRepository(): TaskRepository {
	return {
		async list() {
			return null;
		},
		async readBody() {
			return "";
		},
		async statuses() {
			return [];
		},
	};
}
