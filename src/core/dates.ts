/**
 * 日期工具：范围计算（周/月/年）与格式化。
 * 全部为纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateRange, TaskInfo } from "../types";
import { normalizeDateValue } from "./filter";

/** 将 Date 格式化为本地时区的 YYYY-MM-DD */
export function toDateString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** 获取某天所在周的起止（闭区间）。weekStartsOnMonday 决定周起始日。 */
export function getWeekRange(anchor: Date, weekStartsOnMonday: boolean): DateRange {
	const day = anchor.getDay(); // 0=周日, 1=周一 ... 6=周六
	const diff = weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
	const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diff);
	const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取某天所在月的起止（闭区间）。 */
export function getMonthRange(anchor: Date): DateRange {
	const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取某天所在年的起止（闭区间）。 */
export function getYearRange(anchor: Date): DateRange {
	const start = new Date(anchor.getFullYear(), 0, 1);
	const end = new Date(anchor.getFullYear(), 11, 31);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取某天所在季度的起止（闭区间）。Q1=1-3月, Q2=4-6月, Q3=7-9月, Q4=10-12月。 */
export function getQuarterRange(anchor: Date): DateRange {
	const quarter = Math.floor(anchor.getMonth() / 3);
	const startMonth = quarter * 3;
	const start = new Date(anchor.getFullYear(), startMonth, 1);
	const end = new Date(anchor.getFullYear(), startMonth + 3, 0);
	return { start: toDateString(start), end: toDateString(end) };
}

/**
 * 计算报告的「日期范围」：取所选任务在 完成 / 到期 / 计划 / 创建 四个日期字段上的
 * 最早到最晚（均规范化为 YYYY-MM-DD）。创建日期恒存在，故范围恒有定义；
 * 仅当四者全缺时才回退到 now 所在周。
 */
export function getReportRange(
	tasks: TaskInfo[],
	weekStartsOnMonday: boolean,
	now: Date
): DateRange {
	const dates: string[] = [];
	for (const task of tasks) {
		for (const value of [task.completedDate, task.due, task.scheduled, task.dateCreated]) {
			const normalized = normalizeDateValue(value);
			if (normalized) dates.push(normalized);
		}
	}
	if (dates.length > 0) {
		dates.sort();
		return { start: dates[0], end: dates[dates.length - 1] };
	}
	return getWeekRange(now, weekStartsOnMonday);
}
