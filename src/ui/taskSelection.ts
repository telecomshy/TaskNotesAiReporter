/**
 * 「选择任务」窗口的候选与勾选状态计算（纯函数，可单元测试）。
 *
 * 「选择任务」窗口只呈现尚未「已勾选」的任务，因此本模块以「已勾选」为排除依据：
 * 展示集合的排除由调用方先行完成（见 getUncheckedTasks）；「已加入」仅用于计算默认勾选。
 */

import type { TaskInfo } from "../types";

/**
 * 返回尚未「已勾选」的任务：即全部任务里不在已勾选集合中的任务。
 * 用于在主窗口打开「选择任务」窗口前，把当前已勾选的任务排除掉。
 */
export function getUncheckedTasks(allTasks: TaskInfo[], checkedPaths: Set<string>): TaskInfo[] {
	return allTasks.filter((task) => !checkedPaths.has(task.path));
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
 * - defaultSelectAll=true（时间页）：只勾选展示任务中尚未「已加入」的（首次加入的）任务；
 *   已加入但未勾选的任务默认不勾，尊重用户先前的显式取消。
 * - false（标题页）：空集（默认不选）。
 */
export function initialSelection(
	displayed: TaskInfo[],
	candidatePaths: Set<string>,
	defaultSelectAll: boolean
): Set<string> {
	if (!defaultSelectAll) return new Set();
	return new Set(
		displayed.filter((task) => !candidatePaths.has(task.path)).map((task) => task.path)
	);
}
