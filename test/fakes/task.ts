import type { TaskInfo } from "../../src/types";

/** 构造测试用任务；默认补上 status/priority/archived。 */
export function makeTask(over: Partial<TaskInfo> & { id: string }): TaskInfo {
	return { title: over.id, status: "open", priority: "normal", archived: false, ...over };
}
