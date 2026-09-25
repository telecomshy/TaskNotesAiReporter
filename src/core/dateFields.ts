/**
 * 「日期口径」表：**字段 · 文案键**（两列，见 #50）。
 *
 * 自动筛选（`./filter`）、日期范围推导（`./dates`）、设置页文案（`../settings/generalTab`）
 * 都从这张表取字段——将来加一个日期口径只改这一处，`{{range}}` 推导不会再漏掉表内字段。
 *
 * 本表只陈述「插件统一任务模型有哪些日期字段」。
 */

import type { DateField } from "../types";

export interface DateFieldEntry {
	/** 统一任务模型上的日期字段名。 */
	field: DateField;
	/** 设置页该行的文案键。 */
	labelKey: string;
}

/** 日期口径表（顺序即设置页展示顺序）。 */
export const DATE_FIELD_TABLE: readonly DateFieldEntry[] = [
	{ field: "completedDate", labelKey: "settings.dateFieldCompletedDate" },
	{ field: "due", labelKey: "settings.dateFieldDue" },
	{ field: "scheduled", labelKey: "settings.dateFieldScheduled" },
	{ field: "dateCreated", labelKey: "settings.dateFieldCreated" },
];

/** 表内的全部日期字段（顺序与表一致）。 */
export const DATE_FIELDS: readonly DateField[] = DATE_FIELD_TABLE.map((entry) => entry.field);
