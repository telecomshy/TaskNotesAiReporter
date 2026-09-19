/**
 * 日历的区间选择：状态值 + 具名转移 + 选择器。
 *
 * 纯模块——无 DOM、无 obsidian、无 Date，日期一律为 YYYY-MM-DD 字符串，
 * 可在 Node 单元测试。`CalendarWidget` 只负责渲染与把点击翻译成日字符串。
 */

import type { DateRange } from "../types";

export interface CalendarSelection {
	start: string | null;
	end: string | null;
}

/** 空选择：既无起点也无终点。 */
export function emptySelection(): CalendarSelection {
	return { start: null, end: null };
}

/** 由已有区间构造选择（反向区间归一为升序）。 */
export function selectionFromRange(range: DateRange): CalendarSelection {
	const normalized = normalize(range.start, range.end);
	return { start: normalized.start, end: normalized.end };
}

/**
 * 点击某日：已有起点而尚无终点时设终点；否则重新以该日为起点。
 * 单次点击即已构成单日区间（见 rangeOf）。
 */
export function clickDay(selection: CalendarSelection, day: string): CalendarSelection {
	if (selection.start !== null && selection.end === null) {
		return { start: selection.start, end: day };
	}
	return { start: day, end: null };
}

/** 清空选择。 */
export function clearRange(_selection: CalendarSelection): CalendarSelection {
	return { start: null, end: null };
}

/** 归一化区间：仅起点时为单日区间，反向时升序；无起点时为 null。 */
export function rangeOf(selection: CalendarSelection): DateRange | null {
	if (selection.start === null) return null;
	return normalize(selection.start, selection.end ?? selection.start);
}

/** 某日是否落在选择区间内（闭区间，与点击顺序无关）。 */
export function containsDay(selection: CalendarSelection, day: string): boolean {
	const range = rangeOf(selection);
	if (range === null) return false;
	return day >= range.start && day <= range.end;
}

/** 某日是否为区间的边界（起点或终点；单日区间两端重合）。 */
export function isEdgeDay(selection: CalendarSelection, day: string): boolean {
	if (selection.start === null) return false;
	if (day === selection.start) return true;
	return selection.end !== null && day === selection.end;
}

/** 把两个日字符串归一为升序区间（YYYY-MM-DD 的字典序即时间序）。 */
function normalize(start: string, end: string): DateRange {
	return start <= end ? { start, end } : { start: end, end: start };
}
