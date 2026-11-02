import { test } from "node:test";
import assert from "node:assert/strict";
import { DATE_FIELD_TABLE, DATE_FIELDS } from "../src/core/dateFields";
import { filterTasksByDateRange } from "../src/core/filter";
import { getReportRange } from "../src/core/dates";
import { createTranslator, BUNDLES } from "../src/i18n";
import type { DateField, TaskInfo } from "../src/types";
import { makeTask } from "./fakes/task";

const RANGE = { start: "2026-09-01", end: "2026-09-30" };
const NOW = new Date("2026-01-05T08:00:00");

/** 只填一个日期字段的任务。 */
function taskWith(field: DateField): TaskInfo {
	return makeTask({ id: "a", [field]: "2026-09-05" } as Partial<TaskInfo> & { id: string });
}

// ===== #50：表内字段都参与，加字段不会漏接 =====

test("表内字段都参与自动筛选", () => {
	for (const { field } of DATE_FIELD_TABLE) {
		const result = filterTasksByDateRange([taskWith(field)], RANGE, [field]);
		assert.deepEqual(
			result.map((t) => t.id),
			["a"],
			`日期口径表里的 ${field} 未参与自动筛选`
		);
	}
});

test("表内字段都参与日期范围推导（{{range}} 不再漏算）", () => {
	for (const { field } of DATE_FIELD_TABLE) {
		const range = getReportRange([taskWith(field)], true, NOW);
		assert.deepEqual(
			range,
			{ start: "2026-09-05", end: "2026-09-05" },
			`日期口径表里的 ${field} 未参与日期范围推导`
		);
	}
});

test("日期范围与自动筛选同源：表的字段清单即两者的字段清单", () => {
	assert.deepEqual(DATE_FIELDS, DATE_FIELD_TABLE.map((e) => e.field));
	// 表里的字段名必须都是统一任务模型上的合法键（防手滑写出取不到值的字段）
	for (const { field } of DATE_FIELD_TABLE) {
		const task = taskWith(field);
		assert.ok(
			field in task && task[field] === "2026-09-05",
			`日期口径表的 ${field} 不是统一任务模型上可读的日期字段`
		);
	}
});

test("表内每个文案键在两种界面语言下都已登记（防止加口径漏文案）", () => {
	for (const bundle of [BUNDLES.en, BUNDLES.zh]) {
		const t = createTranslator(bundle);
		for (const { field, labelKey } of DATE_FIELD_TABLE) {
			assert.notEqual(t(labelKey), labelKey, `${field} 的文案键 ${labelKey} 未登记`);
		}
	}
});

test("无任何日期字段时回退到 now 所在周", () => {
	const range = getReportRange([makeTask({ id: "a" })], true, NOW);
	assert.deepEqual(range, { start: "2026-01-05", end: "2026-01-11" });
});

// ===== 修改时间（dateModified）口径（#80） =====

test("「修改时间」是日期口径之一（设置页可勾选）", () => {
	assert.ok(DATE_FIELDS.includes("dateModified"), "日期口径表应含 dateModified（修改时间）");
});

test("dateModified 的 ISO 时间戳（含毫秒与偏移）参与自动筛选", () => {
	const inside = filterTasksByDateRange(
		[makeTask({ id: "a", dateModified: "2026-09-05T09:15:42.123+08:00" })],
		RANGE,
		["dateModified"]
	);
	assert.deepEqual(inside.map((t) => t.id), ["a"], "区间内的修改时间应命中");
	const outside = filterTasksByDateRange(
		[makeTask({ id: "b", dateModified: "2026-08-31T23:59:59.999+08:00" })],
		RANGE,
		["dateModified"]
	);
	assert.deepEqual(outside, [], "区间外的修改时间不应命中");
});

test("dateModified 参与日期范围推导", () => {
	const range = getReportRange(
		[makeTask({ id: "a", dateModified: "2026-09-05T09:15:42.123+08:00" })],
		true,
		NOW
	);
	assert.deepEqual(range, { start: "2026-09-05", end: "2026-09-05" });
});
