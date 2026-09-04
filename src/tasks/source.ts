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

/** 去掉 markdown 开头的 YAML frontmatter，返回正文（尾部空白修剪）。 */
export function stripFrontmatter(content: string): string {
	const trimmed = content.replace(/^\uFEFF/, "");
	if (trimmed.startsWith("---")) {
		const end = trimmed.indexOf("\n---", 3);
		if (end !== -1) {
			return trimmed.slice(end + 4).replace(/^\n+/, "").trimEnd();
		}
	}
	return trimmed.trimEnd();
}

/**
 * 将读取到的正文回填到 task.details（纯逻辑，可单元测试）。
 * body 为空时保留原 details 不变。
 */
export function applyHydratedDetails(task: TaskInfo, body: string): TaskInfo {
	const detail = body.trim();
	if (!detail) return task;
	return { ...task, details: detail };
}

/**
 * 通过 Obsidian Vault API 读取任务对应的笔记正文，回填到 task.details。
 * 若读取失败、文件不存在或不是普通文件，保持 task.details 不变（不覆盖已有详情）。
 * 注意：Obsidian 的 TFile 没有 read() 方法，读取必须使用 app.vault.read(file)。
 */
export async function hydrateTaskDetails(
	app: App,
	task: TaskInfo
): Promise<TaskInfo> {
	if (!task.path) return task;
	try {
		const file = app.vault.getAbstractFileByPath(task.path);
		if (!file) return task;
		// 非文件（如文件夹）传给 vault.read 会抛错，由 catch 兜底返回原 task
		const content = await app.vault.read(file as import("obsidian").TFile);
		const body = stripFrontmatter(content);
		return applyHydratedDetails(task, body);
	} catch {
		return task;
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
