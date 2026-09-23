import { collectDetails, type TaskRepository } from "../../src/tasks/repository";
import type { StatusDefinition, TaskInfo } from "../../src/types";

/** 测试用 in-process TaskRepository fake，供跨 seam 的行为测试复用。 */
export function fakeTaskRepository(
	opts: {
		tasks?: TaskInfo[] | null;
		bodies?: Record<string, string>;
		statuses?: StatusDefinition[];
	} = {}
): TaskRepository {
	const tasks = opts.tasks ?? [];
	const bodies = opts.bodies ?? {};
	const statuses = opts.statuses ?? [];
	return {
		async list(): Promise<TaskInfo[] | null> {
			return tasks;
		},
		async details(ids: readonly string[]): Promise<Record<string, string>> {
			return collectDetails(ids, async (id) => bodies[id] ?? "");
		},
		async statuses(): Promise<StatusDefinition[]> {
			return statuses;
		},
	};
}
