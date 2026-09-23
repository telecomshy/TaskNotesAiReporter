/**
 * 任务数据访问的 seam。
 *
 * TaskRepository 用两个行为屏蔽底层来源：列出任务（TaskNotes 运行时公开 API）
 * 与一次一批补「详情」（TaskNotes 为笔记正文、Obsidian Tasks 为任务行原文，见 CONTEXT.md「详情」）。
 * 生产 adapter 见 ./obsidian 与 ./obsidianTasks；测试用 in-process fake。
 * 遵守 ADR-0001：仅通过 TaskNotes 运行时公开 API 读取任务，不改其源码。
 */

import type { StatusDefinition, TaskInfo } from "../types";

/**
 * 任务数据访问接口（#48：「详情」一批补 + 一种缺失约定）。
 * `id` 是任务标识（见 `TaskInfo.id`）：调用方不得解释或拆解其内部结构。
 */
export interface TaskRepository {
	/** 列出全部未归档任务；TaskNotes 运行时不可用时返回 null。 */
	list(): Promise<TaskInfo[] | null>;
	/**
	 * 一次一批补「详情」（喂给模型的补充材料）：返回 标识 → 详情文本。
	 * 缺详情（如笔记已删 / 行号越界）为空串——一种缺失约定，不另设缺失形状。
	 * interface 只表达「详情」：正文裁剪、任务行原文都是来源内部细节。
	 */
	details(ids: readonly string[]): Promise<Record<string, string>>;
	/** 读取任务状态目录（值名 → 状态归类，用于状态子集分类）；不可用时返回空数组。 */
	statuses(): Promise<StatusDefinition[]>;
}

/** 底层数据来源（由 adapter 提供；测试中可注入 fake）。 */
export interface TaskRepositoryDeps {
	/** 列出任务；不可用返回 null。 */
	listTasks(): Promise<TaskInfo[] | null>;
	/** 按笔记路径读取笔记原始内容；文件不存在返回 null。注意形参是笔记路径，不是任务标识。 */
	readNote(path: string): Promise<string | null>;
	/** 列出状态目录；不可用返回 null（缺省视为空目录）。 */
	listStatuses?(): Promise<StatusDefinition[] | null>;
}

/** 由底层来源构造 TaskRepository。 */
export function createTaskRepository(deps: TaskRepositoryDeps): TaskRepository {
	return {
		async list(): Promise<TaskInfo[] | null> {
			const tasks = await deps.listTasks();
			if (tasks === null) return null;
			return tasks.filter((task) => task && task.id && !task.archived);
		},
		async details(ids: readonly string[]): Promise<Record<string, string>> {
			// 本包装假定「任务标识即笔记路径」（TaskNotes 形状）；其他来源的 adapter 自行实现 details。
			const out: Record<string, string> = {};
			for (const id of ids) {
				if (id in out) continue; // 同一标识只读一次
				const raw = await deps.readNote(id);
				out[id] = raw === null ? "" : stripFrontmatter(raw);
			}
			return out;
		},
		async statuses(): Promise<StatusDefinition[]> {
			return (await deps.listStatuses?.()) ?? [];
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
 * 把一批「详情」回填到任务上（纯逻辑，可单元测试）：
 * 详情为空的保留原 details 不变——缺详情不抹掉已有内容（行为与旧逐条水合一致）。
 */
export function applyDetails(
	tasks: readonly TaskInfo[],
	details: Record<string, string>
): TaskInfo[] {
	return tasks.map((task) => {
		const detail = (details[task.id] ?? "").trim();
		return detail ? { ...task, details: detail } : task;
	});
}

/** 越过 seam 一次一批补「详情」（#48 的批补协议）。 */
export async function hydrateTasks(
	repository: TaskRepository,
	tasks: readonly TaskInfo[]
): Promise<TaskInfo[]> {
	return applyDetails(tasks, await repository.details(tasks.map((task) => task.id)));
}
