/**
 * 报告文件名生成。纯函数，无 Obsidian 依赖。
 */

import type { DateRange, ReportType } from "../types";
import { fromDateString, getISOWeekNumber, getISOWeekYear } from "./dates";

/** 报告类型的中文前缀 */
const REPORT_TYPE_LABEL: Record<ReportType, string> = {
	week: "周报",
	month: "月报",
	year: "年报",
	custom: "报告",
};

/**
 * 根据报告类型与日期范围生成文件名（不含扩展名）。
 * - week:   周报-2026-W36
 * - month:  月报-2026-08
 * - year:   年报-2026
 * - custom: 报告-2026-08-01_2026-08-31
 */
export function buildReportFilename(type: ReportType, range: DateRange): string {
	const start = fromDateString(range.start);
	switch (type) {
		case "week": {
			const week = getISOWeekNumber(start);
			const year = getISOWeekYear(start);
			return `${REPORT_TYPE_LABEL.week}-${year}-W${String(week).padStart(2, "0")}`;
		}
		case "month": {
			const m = range.start.slice(0, 7); // YYYY-MM
			return `${REPORT_TYPE_LABEL.month}-${m}`;
		}
		case "year": {
			const y = range.start.slice(0, 4);
			return `${REPORT_TYPE_LABEL.year}-${y}`;
		}
		case "custom":
		default: {
			return `${REPORT_TYPE_LABEL.custom}-${range.start}_${range.end}`;
		}
	}
}
