/**
 * 日期工具：范围计算（周/月/年）与格式化。
 * 全部为纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateRange } from "../types";

/** 将 Date 格式化为本地时区的 YYYY-MM-DD */
export function toDateString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** 解析 YYYY-MM-DD 为本地时区的 Date */
export function fromDateString(s: string): Date {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, m - 1, d);
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

/** 计算 ISO 8601 周数（用于文件名，如 W36）。 */
export function getISOWeekNumber(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** 计算某天所在 ISO 周对应的年份（处理跨年周，如 12 月底属于下一年第 1 周）。 */
export function getISOWeekYear(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	return d.getUTCFullYear();
}

/** 判断两个 DateRange 是否相等 */
export function rangesEqual(a: DateRange, b: DateRange): boolean {
	return a.start === b.start && a.end === b.end;
}
