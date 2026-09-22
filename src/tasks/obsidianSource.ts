/**
 * 来源工厂的生产接线：把真实的 Obsidian 后端接到 ./source 的选择逻辑之上。
 * 这是唯一静态依赖 obsidian 的来源接线点（`createSourceRepository(app, source)`）。
 */

import type { App } from "obsidian";
import type { TaskSource } from "../types";
import type { TaskRepository } from "./repository";
import { obsidianTaskRepository } from "./obsidian";
import { selectSourceRepository, unavailableRepository } from "./source";

/** 由 Obsidian 应用与来源构造生产用的 TaskRepository；恒返回后端（不返回 null）。 */
export function createSourceRepository(app: App, source: TaskSource): TaskRepository {
	return selectSourceRepository(source, app, {
		tasknotes: obsidianTaskRepository,
		// Tasks 后端在票3 接入前先返回「不可用」后端，使中间态可安全合并。
		obsidianTasks: () => unavailableRepository(),
	});
}
