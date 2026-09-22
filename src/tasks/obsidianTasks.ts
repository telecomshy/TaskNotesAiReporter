/**
 * Tasks 后端的 Obsidian 接线：借 metadataCache 自扫 vault 里的清单行（ADR-0013）。
 *
 * 读取来自第一方公开 API：`vault.getMarkdownFiles` / `metadataCache.getFileCache` /
 * `listItems[].task` / `position.start.line`；另按 ADR-0001 的先例，经
 * `app.plugins.plugins["obsidian-tasks-plugin"]` 判断 Tasks 插件是否启用。
 * 不依赖 Tasks 插件的内部 getTasks()。这是对 ADR-0001「仅运行时公开 API」的一次有界破例，仅限 Tasks 后端。
 */

import type { App } from "obsidian";
import type { TaskRepository } from "./repository";
import type { RawTaskLine } from "./tasksLine";
import { createTasksRepository } from "./tasksRepository";
import { readVaultNote } from "./obsidian";

/** Obsidian Tasks 的插件 id（未启用则来源不可用，list() 返回 null）。 */
const TASKS_PLUGIN_ID = "obsidian-tasks-plugin";

/** Obsidian Tasks 插件是否启用。 */
function isTasksPluginEnabled(app: App): boolean {
	try {
		const plugins = (app as unknown as { plugins: { plugins: Record<string, unknown> } })
			.plugins.plugins;
		return Boolean(plugins[TASKS_PLUGIN_ID]);
	} catch {
		return false;
	}
}

/**
 * 遍历 vault，识别带复选框的清单行并读取其原文。
 * 只读取确实含任务行的笔记，避免为无任务笔记付出读盘成本。
 */
async function listTaskLines(app: App): Promise<RawTaskLine[] | null> {
	if (!isTasksPluginEnabled(app)) return null;

	const result: RawTaskLine[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const items = (cache?.listItems ?? []).filter((item) => item.task);
		if (items.length === 0) continue;

		const content = await app.vault.cachedRead(file);
		const lines = content.split(/\r?\n/);
		for (const item of items) {
			const line = item.position?.start?.line;
			if (typeof line !== "number") continue;
			result.push({ path: file.path, line, text: lines[line] ?? "" });
		}
	}
	return result;
}

/** 用 Obsidian 应用构造生产用的 Tasks 后端。 */
export function obsidianTasksRepository(app: App): TaskRepository {
	return createTasksRepository({
		listLines: () => listTaskLines(app),
		readNote: (path) => readVaultNote(app, path),
	});
}
