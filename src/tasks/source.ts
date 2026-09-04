/**
 * TaskNotes 任务读取源：通过公开 API 读取任务，并提供降级提示。
 * 完全不改 TaskNotes 源码，仅依赖其运行时暴露的公开 API。
 */

import type { App } from "obsidian";
import type { TaskInfo, TaskNotesPublicApi } from "../types";

/** 获取 TaskNotes 插件暴露的公开 API；未启用或不可用则返回 null。 */
export function getTaskNotesApi(app: App): TaskNotesPublicApi | null {
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

/** 读取全部未归档任务。返回 null 表示 TaskNotes API 不可用。 */
export async function loadAllTasks(app: App): Promise<TaskInfo[] | null> {
	const api = getTaskNotesApi(app);
	if (!api) return null;

	try {
		const tasks = await api.tasks.list();
		// 过滤掉已归档任务，仅保留有效任务
		return tasks.filter((task) => task && task.path && !task.archived);
	} catch {
		return null;
	}
}

/** 按 path 去重（保留先出现的） */
export function dedupeByPath(tasks: TaskInfo[]): TaskInfo[] {
	const seen = new Set<string>();
	const result: TaskInfo[] = [];
	for (const task of tasks) {
		if (!seen.has(task.path)) {
			seen.add(task.path);
			result.push(task);
		}
	}
	return result;
}
