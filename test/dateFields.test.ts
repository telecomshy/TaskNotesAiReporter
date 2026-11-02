import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasksByDateRange } from "../src/core/filter";
import { getReportRange } from "../src/core/dates";
import { createTranslator, BUNDLES, dateFieldLabelKey } from "../src/i18n";
import { DATE_FIELDS, type DateField, type TaskInfo } from "../src/types";
import { makeTask } from "./fakes/task";

const RANGE = { start: "2026-09-01", end: "2026-09-30" };
const NOW = new Date("2026-01-05T08:00:00");

/** 只填一个日期字段的任务。 */
function taskWith(field: DateField): TaskInfo {
	return makeTask({ id: "a", [field]: "2026-09-05" } as Partial<TaskInfo> & { id: string });
}

// ===== #50 / #81：清单内字段都参与，加字段不会漏接 =====

test("清单内字段都参与自动筛选", () => {
	for (const field of DATE_FIELDS) {
		const result = filterTasksByDateRange([taskWith(field)], RANGE, [field]);
		assert.deepEqual(
			result.map((t) => t.id),
			["a"],
			`日期口径清单里的 ${field} 未参与自动筛选`
		);
	}
});

test("清单内字段都参与日期范围推导（{{range}} 不再漏算）", () => {
	for (const field of DATE_FIELDS) {
		const range = getReportRange([taskWith(field)], true, NOW);
		assert.deepEqual(
			range,
			{ start: "2026-09-05", end: "2026-09-05" },
			`日期口径清单里的 ${field} 未参与日期范围推导`
		);
	}
});

test("清单内每个文案键在两种界面语言下都已登记（防止加口径漏文案）", () => {
	for (const bundle of [BUNDLES.en, BUNDLES.zh]) {
		const t = createTranslator(bundle);
		for (const field of DATE_FIELDS) {
			const labelKey = dateFieldLabelKey(field);
			assert.notEqual(t(labelKey), labelKey, `${field} 的文案键 ${labelKey} 未登记`);
		}
	}
});

test("无任何日期字段时回退到 now 所在周", () => {
	const range = getReportRange([makeTask({ id: "a" })], true, NOW);
	assert.deepEqual(range, { start: "2026-01-05", end: "2026-01-11" });
});

// ===== 修改时间（dateModified）口径（#80） =====

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

// ===== 编译期约束类型测试（#81）：验证手段是 npm run typecheck =====
// `@ts-expect-error` 未命中即报错（本块与其所钉的保证同生共死）。
// 钉的是三处「非法字段名应编译失败」：清单声明处的约束形状（与 src/types.ts 同构）、
// 口径清单的派生类型、`DateField`。防线不止本块：清单内容真写错时，
// `task[field]` 的下游索引在 typecheck 同样报错。

// @ts-expect-error 非法字段名过不了清单声明处的 satisfies 约束（keyof TaskInfo）
const _badConstraint = ["bogusField"] as const satisfies readonly (keyof TaskInfo)[];

// @ts-expect-error 非法字段名进不了口径清单的派生类型
const _badIntoList: typeof DATE_FIELDS = ["bogusField", "due", "scheduled", "dateCreated", "dateModified"] as const;

// @ts-expect-error 非法字段名不是 DateField，进不了日期口径取值
const _badIntoType: DateField = "bogusField";

void _badConstraint;
void _badIntoList;
void _badIntoType;
