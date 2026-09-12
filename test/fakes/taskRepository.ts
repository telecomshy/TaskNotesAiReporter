import type { TaskRepository } from "../../src/tasks/repository";
import type { TaskInfo } from "../../src/types";

/** 测试用 in-process TaskRepository fake，供越 seam 的行为测试复用。 */
export function fakeTaskRepository(
	opts: { tasks?: TaskInfo[] | null; bodies?: Record<string, string> } = {}
): TaskRepository {
	const tasks = opts.tasks ?? [];
	const bodies = opts.bodies ?? {};
	return {
		async list(): Promise<TaskInfo[] | null> {
			return tasks;
		},
		async readBody(path: string): Promise<string> {
			return bodies[path] ?? "";
		},
	};
}
