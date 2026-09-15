import type { TaskInfo } from "../../src/types";

/** 构造测试用任务；默认补上 status/priority/archived。 */
export function makeTask(over: Partial<TaskInfo> & { path: string }): TaskInfo {
	return { title: over.path, status: "open", priority: "normal", archived: false, ...over };
}
