/**
 * 日历的区间选择：状态值 + 具名转移 + 选择器；另有「pick → 日历处置」的
 * 映射 `calendarEffect`（视图指令，ADR-0023）。
 *
 * 纯模块——无 DOM、无 obsidian、无 Date，日期一律为 YYYY-MM-DD 字符串，
 * 可在 Node 单元测试。`CalendarWidget` 只负责渲染与把点击翻译成日字符串。
 */

import type { DateRange } from "../types";
import type { RangePick } from "./selectionSession";

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

/** 是否已完成两次点击的区间选择；单击得到的单日区间尚未完成。 */
export function isRangeComplete(selection: CalendarSelection): boolean {
	return selection.end !== null;
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

/** pick → 日历处置：rebuild（重建＋收起）/ clear（清选择）/ keep（不动，complete 时收起）。 */
export type CalendarEffect = "rebuild" | "clear" | "keep";

/**
 * pick → 日历处置：「怎么调日历」的知识（ADR-0023）：快捷周期与清空把区间整个换掉，重建并收起；
 * 打开自定义时 preset 来源的区间让位，清掉日历上已点的选择；日历内点击不能重建——
 * 两次点击的起点由组件自己保留，重建会丢。
 */
export function calendarEffect(pick: RangePick): CalendarEffect {
	switch (pick.kind) {
		case "preset":
		case "clear":
			return "rebuild";
		case "open-custom":
			return "clear";
		case "custom":
			return "keep";
	}
}
