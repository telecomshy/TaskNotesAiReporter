/**
 * TaskRepository 的 Obsidian / TaskNotes adapter。
 * 这是任务数据访问里唯一静态依赖 obsidian 的实现。
 * 遵守 ADR-0001：只通过 TaskNotes 运行时公开 API 读取任务，不改其源码。
 */

import { TFile, type App } from "obsidian";
import type { TaskNotesPublicApi } from "../types";
import { createTaskRepository, type TaskRepository } from "./repository";

/** 获取 TaskNotes 插件暴露的公开 API；未启用或不可用则返回 null。 */
function getTaskNotesApi(app: App): TaskNotesPublicApi | null {
	try {
		const plugins = (app as unknown as { plugins: { plugins: Record<string, unknown> } })
			.plugins.plugins;
		const tasknotes = plugins["tasknotes"] as { api?: TaskNotesPublicApi } | undefined;
		if (!tasknotes || !tasknotes.api) return null;
		return tasknotes.api;
	} catch {
		return null;
	}
}

/** 用 Obsidian 应用构造生产用的 TaskRepository。 */
export function obsidianTaskRepository(app: App): TaskRepository {
	return createTaskRepository({
		listTasks: async () => {
			const api = getTaskNotesApi(app);
			if (!api) return null;
			try {
				return await api.tasks.list();
			} catch {
				return null;
			}
		},
		readNote: async (path: string) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return null;
			try {
				return await app.vault.read(file);
			} catch {
				return null;
			}
		},
	});
}
