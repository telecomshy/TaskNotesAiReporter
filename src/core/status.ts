/**
 * 任务状态归一化：把来源各异的状态值归类为「已完成 / 进行中 / 未完成」。
 * 纯函数，无 Obsidian 依赖，可单元测试。
 *
 * 来源无关性：分类只依赖状态目录（value + isCompleted）与一个约定值名，
 * 未来接入其它任务来源时，只需把其状态映射为同样的 StatusDefinition 列表。
 */

import type { StatusDefinition, TaskInfo } from "../types";

/** 约定：值名为此的状态视为「进行中」（TaskNotes 默认状态值）。 */
export const IN_PROGRESS_STATUS_VALUE = "in-progress";

/** 来源无关的「进行中」类型标记（Tasks 的 StatusType 口径）；优先于值名判定。 */
export const IN_PROGRESS_STATUS_TYPE = "IN_PROGRESS";

/** 任务子集口径。 */
export type TaskSubset = "completed" | "in-progress" | "open";

/** 状态是否被标记为已完成；未知状态视为未完成。 */
export function isCompletedStatus(status: string, statuses: readonly StatusDefinition[]): boolean {
	return statuses.find((definition) => definition.value === status)?.isCompleted === true;
}

/** 状态是否属于「进行中」：优先按 type 判定，回退到约定值名 `in-progress`。 */
export function isInProgressStatus(status: string, statuses: readonly StatusDefinition[]): boolean {
	if (isCompletedStatus(status, statuses)) return false;
	const definition = statuses.find((d) => d.value === status);
	if (definition?.type === IN_PROGRESS_STATUS_TYPE) return true;
	return status.trim().toLowerCase() === IN_PROGRESS_STATUS_VALUE;
}

/**
 * 按子集口径筛选任务：
 * - completed：已完成；
 * - in-progress：进行中；
 * - open：未完成（进行中 + 未开始）。
 */
export function filterTasksBySubset(
	tasks: readonly TaskInfo[],
	subset: TaskSubset,
	statuses: readonly StatusDefinition[]
): TaskInfo[] {
	switch (subset) {
		case "completed":
			return tasks.filter((task) => isCompletedStatus(task.status, statuses));
		case "in-progress":
			return tasks.filter((task) => isInProgressStatus(task.status, statuses));
		default:
			return tasks.filter((task) => !isCompletedStatus(task.status, statuses));
	}
}
