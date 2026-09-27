/**
 * 日期工具：范围计算（周/月/年）与格式化。
 * 全部为纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateRange, TaskInfo } from "../types";
import { normalizeDateValue } from "./filter";
import { DATE_FIELD_TABLE } from "./dateFields";

/** 将 Date 格式化为本地时区的 YYYY-MM-DD */
export function toDateString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** anchor 所在周的起始日相对 anchor 的偏移天数（负数或 0）。 */
function weekStartOffset(anchor: Date, weekStartsOnMonday: boolean): number {
	const day = anchor.getDay(); // 0=周日, 1=周一 ... 6=周六
	return weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
}

/** 获取某天所在周的起止（闭区间）。weekStartsOnMonday 决定周起始日。 */
export function getWeekRange(anchor: Date, weekStartsOnMonday: boolean): DateRange {
	const start = new Date(
		anchor.getFullYear(),
		anchor.getMonth(),
		anchor.getDate() + weekStartOffset(anchor, weekStartsOnMonday)
	);
	const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取紧邻某天所在周之前的那个完整自然周的起止（闭区间）。weekStartsOnMonday 决定周起始日。 */
export function getLastWeekRange(anchor: Date, weekStartsOnMonday: boolean): DateRange {
	const start = new Date(
		anchor.getFullYear(),
		anchor.getMonth(),
		anchor.getDate() + weekStartOffset(anchor, weekStartsOnMonday) - 7
	);
	const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取某天所在月的起止（闭区间）。 */
export function getMonthRange(anchor: Date): DateRange {
	const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
	return { start: toDateString(start), end: toDateString(end) };
}

/**
 * 获取紧邻某天所在月之前的那个完整自然月的起止（闭区间）。
 * 按上一个自然月推导（不是 anchor 减 N 天），月末天数取该月实际长度。
 */
export function getLastMonthRange(anchor: Date): DateRange {
	const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
	const end = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取某天所在年的起止（闭区间）。 */
export function getYearRange(anchor: Date): DateRange {
	const start = new Date(anchor.getFullYear(), 0, 1);
	const end = new Date(anchor.getFullYear(), 11, 31);
	return { start: toDateString(start), end: toDateString(end) };
}

/** 获取紧邻某天所在年之前的那个完整自然年的起止（闭区间）。 */
export function getLastYearRange(anchor: Date): DateRange {
	const start = new Date(anchor.getFullYear() - 1, 0, 1);
	const end = new Date(anchor.getFullYear() - 1, 11, 31);
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

/** 获取紧邻某天所在季度之前的那个完整自然季度的起止（闭区间）。Q1 的上一季度为上年 Q4。 */
export function getLastQuarterRange(anchor: Date): DateRange {
	const startMonth = Math.floor(anchor.getMonth() / 3) * 3 - 3;
	const start = new Date(anchor.getFullYear(), startMonth, 1);
	const end = new Date(anchor.getFullYear(), startMonth + 3, 0);
	return { start: toDateString(start), end: toDateString(end) };
}

/**
 * 计算报告的「日期范围」：取所选任务在**日期口径表内全部字段**上的
 * 最早到最晚（均规范化为 YYYY-MM-DD）。创建日期恒存在，故范围恒有定义；
 * 仅当表内字段全缺时才回退到 now 所在周。
 *
 * 字段清单来自 `DATE_FIELD_TABLE`：表内字段都参与推导，加字段不会漏算 `{{range}}`（见 #50）。
 */
export function getReportRange(
	tasks: readonly TaskInfo[],
	weekStartsOnMonday: boolean,
	now: Date
): DateRange {
	const dates: string[] = [];
	for (const task of tasks) {
		for (const { field } of DATE_FIELD_TABLE) {
			const normalized = normalizeDateValue(task[field]);
			if (normalized) dates.push(normalized);
		}
	}
	if (dates.length > 0) {
		dates.sort();
		return { start: dates[0], end: dates[dates.length - 1] };
	}
	return getWeekRange(now, weekStartsOnMonday);
}
