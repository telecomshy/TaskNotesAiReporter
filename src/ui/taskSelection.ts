/**
 * 「选择任务」窗口的勾选状态计算（纯函数，可单元测试）。
 *
 * 区分两个集合：
 * - 已加入主列表（alreadySelected）：已存在于主窗口列表的任务，在本窗口不可操作；
 * - 本地勾选（localSelected）：本窗口内用户勾选的任务。
 */

import type { TaskInfo } from "../types";

/**
 * 返回显示任务中「可勾选」的路径：即不在已加入主列表里的任务。
 * 已加入的任务在本窗口不可再操作（避免重复选择）。
 */
export function getSelectablePaths(displayed: TaskInfo[], alreadySelected: Set<string>): string[] {
	return displayed.filter((task) => !alreadySelected.has(task.path)).map((task) => task.path);
}

export interface SelectAllState {
	checked: boolean;
	indeterminate: boolean;
}

/**
 * 计算「全选」复选框的三态：已加入主列表的任务视为已勾选。
 * 这样当列表里混有已加入任务时，全选框仍能正确到达「全选」态。
 */
export function computeSelectAllState(
	displayed: TaskInfo[],
	localSelected: Set<string>,
	alreadySelected: Set<string>
): SelectAllState {
	const effectiveChecked = displayed.filter(
		(task) => localSelected.has(task.path) || alreadySelected.has(task.path)
	).length;
	return {
		checked: displayed.length > 0 && effectiveChecked === displayed.length,
		indeterminate: effectiveChecked > 0 && effectiveChecked < displayed.length,
	};
}

/**
 * 切 Tab / 改筛选后的初始勾选集。
 * - defaultSelectAll=true（时间页）：选中所有可勾选任务（排除已加入）；
 * - false（标题页）：空集（默认不选）。
 */
export function initialSelection(
	displayed: TaskInfo[],
	alreadySelected: Set<string>,
	defaultSelectAll: boolean
): Set<string> {
	return defaultSelectAll ? new Set(getSelectablePaths(displayed, alreadySelected)) : new Set();
}
