/**
 * Obsidian Tasks 后端的 TaskRepository 实现。
 *
 * 「扫 vault」与「读文件」两个 Obsidian 触碰点由 deps 注入，使 list / readBody / statuses
 * 可在 Node 用假 deps 测试（同 test/fakes 的 TaskRepository 先例）。生产接线见 ./obsidianTasks。
 *
 * 刻意不复用 ./repository 的通用包装：其 readBody 按 path 找文件并 strip frontmatter，
 * 读不到 `笔记#行号` 这种带行号的路径。
 */

import type { StatusDefinition, TaskInfo } from "../types";
import type { TaskRepository } from "./repository";
import { parseTaskLine, TASKS_STATUS_DEFINITIONS, type RawTaskLine } from "./tasksLine";

/** Tasks 后端的底层来源（由 adapter 注入；测试用 fake）。 */
export interface TasksRepositoryDeps {
	/** 扫描全部 Tasks 行；来源插件不可用（未启用）时返回 null。 */
	listLines(): Promise<RawTaskLine[] | null>;
	/** 读取笔记原始内容；文件不存在返回 null。 */
	readNote(path: string): Promise<string | null>;
}

/** 由底层来源构造 Tasks 后端的 TaskRepository。 */
export function createTasksRepository(deps: TasksRepositoryDeps): TaskRepository {
	return {
		async list(): Promise<TaskInfo[] | null> {
			const lines = await deps.listLines();
			if (lines === null) return null;
			return lines.map(parseTaskLine);
		},
		async readBody(path: string): Promise<string> {
			const parsed = splitTaskPath(path);
			if (!parsed) return "";
			const content = await deps.readNote(parsed.notePath);
			if (content === null) return "";
			return content.split(/\r?\n/)[parsed.line] ?? "";
		},
		async statuses(): Promise<StatusDefinition[]> {
			return TASKS_STATUS_DEFINITIONS;
		},
	};
}

/** 拆分 `笔记路径#行号`；无合法行号时返回 null。 */
export function splitTaskPath(path: string): { notePath: string; line: number } | null {
	const index = path.lastIndexOf("#");
	if (index === -1) return null;
	const line = Number(path.slice(index + 1));
	if (!Number.isInteger(line) || line < 0) return null;
	return { notePath: path.slice(0, index), line };
}
