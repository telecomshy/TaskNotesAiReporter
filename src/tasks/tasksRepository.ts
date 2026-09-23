/**
 * Obsidian Tasks 后端的 TaskRepository 实现。
 *
 * 「扫 vault」与「读文件」两个 Obsidian 触碰点由 deps 注入，使 list / details / statuses
 * 可在 Node 用假 deps 测试（同 test/fakes 的 TaskRepository 先例）。生产接线见 ./obsidianTasks。
 *
 * 刻意不复用 ./repository 的通用包装：其 details 按标识找文件并 strip frontmatter，
 * 读不到「笔记#行号」这种带行号的标识（编码与拆分只在本 adapter 内部，见 ADR-0014 / #52）。
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
		async details(ids: readonly string[]): Promise<Record<string, string>> {
			// 一批补详情：同一笔记只读一次文件，逐条取行原文；缺详情为空串（#48 的一种缺失约定）。
			const out: Record<string, string> = {};
			const byNote = new Map<string, Array<{ id: string; line: number }>>();
			for (const id of ids) {
				if (id in out) continue;
				out[id] = "";
				const parsed = splitTaskPath(id);
				if (!parsed) continue;
				const entries = byNote.get(parsed.notePath) ?? [];
				entries.push({ id, line: parsed.line });
				byNote.set(parsed.notePath, entries);
			}
			for (const [notePath, entries] of byNote) {
				const content = await deps.readNote(notePath);
				if (content === null) continue;
				const lines = content.split(/\r?\n/);
				for (const entry of entries) out[entry.id] = lines[entry.line] ?? "";
			}
			return out;
		},
		async statuses(): Promise<StatusDefinition[]> {
			return TASKS_STATUS_DEFINITIONS;
		},
	};
}

/** Tasks 来源的接线依赖：一个同步探针 + 两个 Obsidian 触碰点（测试注入 fake）。 */
export interface TasksSourceDeps extends TasksRepositoryDeps {
	/** 同步探针：来源插件是否启用。false → 适配器缺席 → openSource 判「来源缺失」（#45 判别式）。 */
	enabled(): boolean;
}

/**
 * 构造 Tasks 来源的适配器挂接点（openSource 的一个取值，#53）。
 * 纯逻辑（探针与触碰点都注入），可在 Node 用假 deps 验证「插件未启用 → 来源缺失」；
 * 生产接线见 ./obsidianTasks。
 */
export function createTasksSource(deps: TasksSourceDeps): () => TaskRepository | null {
	return () => (deps.enabled() ? createTasksRepository(deps) : null);
}

/** 拆分「笔记路径#行号」；无合法行号时返回 null。编码与拆分只在 Tasks adapter 内部（ADR-0014）。 */
export function splitTaskPath(path: string): { notePath: string; line: number } | null {
	const index = path.lastIndexOf("#");
	if (index === -1) return null;
	const line = Number(path.slice(index + 1));
	if (!Number.isInteger(line) || line < 0) return null;
	return { notePath: path.slice(0, index), line };
}
