/**
 * TaskRepository 的 Obsidian / TaskNotes adapter。
 * 这是任务数据访问里唯一静态依赖 obsidian 的实现。
 * 遵守 ADR-0001：只通过 TaskNotes 运行时公开 API 读取任务，不改其源码。
 */

import { TFile, type App } from "obsidian";
import type { StatusDefinition, TaskNotesPublicApi } from "../types";
import { createTaskRepository, type TaskRepository } from "./repository";
import { taskNotesStatusClass } from "../core/status";

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

/** 读取 vault 中某个笔记的原始内容；文件不存在或读取失败返回 null。 */
export async function readVaultNote(app: App, path: string): Promise<string | null> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	try {
		return await app.vault.read(file);
	} catch {
		return null;
	}
}

/**
 * 用 Obsidian 应用构造生产用的 TaskRepository。
 * **插件未启用返回 `null`**（= 来源缺失），由「来源」深 module 的判别式承载（见 #45）。
 */
export function obsidianTaskRepository(app: App): TaskRepository | null {
	// 插件启用探测只此一处：listTasks / listStatuses 复用同一结果。
	const probe = getTaskNotesApi(app);
	if (!probe) return null;
	return createTaskRepository({
		listTasks: async () => {
			try {
				return await probe.tasks.list();
			} catch {
				return null;
			}
		},
		readNote: (path: string) => readVaultNote(app, path),
		listStatuses: async (): Promise<StatusDefinition[] | null> => {
			if (!probe.catalog) return null;
			try {
				return probe.catalog.statuses().map((status) => ({
					value: status.value,
					statusClass: taskNotesStatusClass(status.value, status.isCompleted),
				}));
			} catch {
				return null;
			}
		},
	});
}
