/**
 * Tasks 来源的装配（纯逻辑）：把「探针 + 两个 Obsidian 触碰点」折成 openSource 的一个取值。
 * 与 ./tasksRepository（仓库实现）分文件：装配与实现各有各的变更缘由（shy-code-review 对拍 findings）。
 * 生产接线见 ./obsidianTasks；测试注入假 deps 即可在 Node 验证「插件未启用 → 来源缺失」。
 */

import type { TaskRepository } from "./repository";
import { createTasksRepository, type TasksRepositoryDeps } from "./tasksRepository";

/** Tasks 来源的接线依赖：一个同步探针 + 两个 Obsidian 触碰点（测试注入 fake）。 */
export interface TasksSourceDeps extends TasksRepositoryDeps {
	/** 同步探针：来源插件是否启用。false → 适配器缺席 → openSource 判「来源缺失」（#45 判别式）。 */
	enabled(): boolean;
}

/**
 * 构造 Tasks 来源的适配器挂接点（openSource 的一个取值，#53）。
 * 插件未启用（探针缺席）→ `null`；启用后的行为由仓库实现承载（含 listLines null 的空列表约定）。
 */
export function createTasksSource(deps: TasksSourceDeps): () => TaskRepository | null {
	return () => (deps.enabled() ? createTasksRepository(deps) : null);
}
