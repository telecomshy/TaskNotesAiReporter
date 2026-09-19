/**
 * 「选择任务」窗口的候选集合计算（纯函数，可单元测试）。
 *
 * 「选择任务」窗口只呈现尚未「已加入」的任务，因此本模块以「已加入」为排除依据：
 * 候选集合的排除由调用方先行完成（见 getAddableTasks）。
 * 会话内的选择规则见 pickerSession。
 */

import type { TaskInfo } from "../types";

/**
 * 返回尚未「已加入」的任务：即全部任务里不在已加入集合中的任务。
 * 用于在主窗口打开「选择任务」窗口前，把已加入的任务排除掉。
 */
export function getAddableTasks(allTasks: TaskInfo[], candidatePaths: Set<string>): TaskInfo[] {
	return allTasks.filter((task) => !candidatePaths.has(task.path));
}
