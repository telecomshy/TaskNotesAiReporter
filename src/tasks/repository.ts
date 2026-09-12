/**
 * 任务数据访问的 seam。
 *
 * TaskRepository 用两个行为屏蔽底层来源：列出任务（TaskNotes 运行时公开 API）
 * 与读取任务正文（Obsidian vault）。生产 adapter 见 ./obsidian；测试用 in-process fake。
 * 遵守 ADR-0001：仅通过 TaskNotes 运行时公开 API 读取任务，不改其源码。
 */

import type { TaskInfo } from "../types";

/** 任务数据访问接口。 */
export interface TaskRepository {
	/** 列出全部未归档任务；TaskNotes 运行时不可用时返回 null。 */
	list(): Promise<TaskInfo[] | null>;
	/** 读取任务笔记正文（已去掉 frontmatter）；笔记不存在时返回空串。 */
	readBody(path: string): Promise<string>;
}

/** 底层数据来源（由 adapter 提供；测试中可注入 fake）。 */
export interface TaskRepositoryDeps {
	/** 列出任务；不可用返回 null。 */
	listTasks(): Promise<TaskInfo[] | null>;
	/** 读取笔记原始内容；文件不存在返回 null。 */
	readNote(path: string): Promise<string | null>;
}

/** 由底层来源构造 TaskRepository。 */
export function createTaskRepository(deps: TaskRepositoryDeps): TaskRepository {
	return {
		async list(): Promise<TaskInfo[] | null> {
			const tasks = await deps.listTasks();
			if (tasks === null) return null;
			return tasks.filter((task) => task && task.path && !task.archived);
		},
		async readBody(path: string): Promise<string> {
			const raw = await deps.readNote(path);
			return raw === null ? "" : stripFrontmatter(raw);
		},
	};
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
 * 越过 seam，读取任务正文并回填到 details。
 * 调用方无需自行组合 readBody 与 applyHydratedDetails。
 */
export async function hydrateTask(
	repository: TaskRepository,
	task: TaskInfo
): Promise<TaskInfo> {
	return applyHydratedDetails(task, await repository.readBody(task.path));
}
