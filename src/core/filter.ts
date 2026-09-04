/**
 * 任务筛选：按日期范围自动筛选 + 识别"未记录日期"的任务。
 * 纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateField, DateRange, TaskInfo } from "../types";

/**
 * 从任务某个日期字段值中提取标准化的 YYYY-MM-DD。
 * 兼容 "YYYY-MM-DD" 以及 "YYYY-MM-DDTHH:mm:ssZ"（ISO 时间戳）等格式。
 */
export function normalizeDateValue(value: string | undefined): string | null {
	if (!value) return null;
	const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
	return m ? m[1] : null;
}

/** 判断一个日期值是否落在给定闭区间内。 */
function inRange(value: string | undefined, range: DateRange): boolean {
	const dateStr = normalizeDateValue(value);
	if (!dateStr) return false;
	return dateStr >= range.start && dateStr <= range.end;
}

/**
 * 按日期范围自动筛选任务：任一选定的日期字段落在范围内即命中，按 path 去重，排除已归档任务。
 */
export function filterTasksByDateRange(
	tasks: TaskInfo[],
	range: DateRange,
	dateFields: DateField[]
): TaskInfo[] {
	const result: TaskInfo[] = [];
	const seen = new Set<string>();
	for (const task of tasks) {
		if (task.archived) continue;
		const matched = dateFields.some((field) => inRange(task[field] as string | undefined, range));
		if (matched && !seen.has(task.path)) {
			seen.add(task.path);
			result.push(task);
		}
	}
	return result;
}

/**
 * 识别"未记录日期"的任务：所有选定日期字段均缺失。
 * 这些任务需要用户手动补录进报告。
 */
export function filterTasksWithoutDate(
	tasks: TaskInfo[],
	dateFields: DateField[]
): TaskInfo[] {
	return tasks.filter((task) => {
		if (task.archived) return false;
		return dateFields.every((field) => !task[field]);
	});
}

/**
 * 判断某任务是否"未记录任何日期"（供 UI 标注使用）。
 */
export function hasNoDate(task: TaskInfo, dateFields: DateField[]): boolean {
	return dateFields.every((field) => !task[field]);
}
