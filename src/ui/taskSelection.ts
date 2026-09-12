/**
 * 「选择任务」窗口的候选与勾选状态计算（纯函数，可单元测试）。
 *
 * 「选择任务」窗口只呈现尚未「已加入」的任务，因此本模块以「已加入」为排除依据：
 * 候选集合的排除由调用方先行完成（见 getAddableTasks）。
 */

import type { TaskInfo } from "../types";

/**
 * 返回尚未「已加入」的任务：即全部任务里不在已加入集合中的任务。
 * 用于在主窗口打开「选择任务」窗口前，把已加入的任务排除掉。
 */
export function getAddableTasks(allTasks: TaskInfo[], candidatePaths: Set<string>): TaskInfo[] {
	return allTasks.filter((task) => !candidatePaths.has(task.path));
}

export interface SelectAllState {
	checked: boolean;
	indeterminate: boolean;
}

/** 计算「全选」复选框的三态：全部勾选为全选，部分勾选为半选。 */
export function computeSelectAllState(displayed: TaskInfo[], selected: Set<string>): SelectAllState {
	const checkedCount = displayed.filter((task) => selected.has(task.path)).length;
	return {
		checked: displayed.length > 0 && checkedCount === displayed.length,
		indeterminate: checkedCount > 0 && checkedCount < displayed.length,
	};
}

/**
 * 切 Tab / 改筛选后的初始勾选集。
 * - defaultSelectAll=true（时间页）：选中所有展示任务；
 * - false（标题页）：空集（默认不选）。
 */
export function initialSelection(displayed: TaskInfo[], defaultSelectAll: boolean): Set<string> {
	return defaultSelectAll ? new Set(displayed.map((task) => task.path)) : new Set();
}
