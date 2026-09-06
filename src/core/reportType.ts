/**
 * 报告类型中文标签的唯一来源。
 * 供 prompt / filename / writer 复用，避免多处重复定义。
 * 纯数据，无 Obsidian 依赖，可单元测试。
 */

import type { ReportType } from "../types";

/** 报告类型的中文前缀 */
export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
	week: "周报",
	month: "月报",
	year: "年报",
	custom: "报告",
};
