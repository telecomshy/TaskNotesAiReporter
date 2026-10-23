import { test } from "node:test";
import assert from "node:assert/strict";
import {
	calendarInitialRange,
	clearRange,
	clickDay,
	containsDay,
	emptySelection,
	isEdgeDay,
	isRangeComplete,
	rangeOf,
	selectionFromRange,
} from "../src/ui/calendarSelection";
import type { DateRange } from "../src/types";

const march: DateRange = { start: "2024-03-05", end: "2024-03-10" };

test("空选择：无区间、不含任何日、无边界", () => {
	const selection = emptySelection();
	assert.equal(rangeOf(selection), null);
	assert.equal(containsDay(selection, "2024-03-05"), false);
	assert.equal(isEdgeDay(selection, "2024-03-05"), false);
});

test("从区间构造：保留两端，反向区间归一", () => {
	assert.deepEqual(selectionFromRange(march), { start: "2024-03-05", end: "2024-03-10" });
	assert.deepEqual(rangeOf(selectionFromRange(march)), march);

	const reversed = selectionFromRange({ start: "2024-03-10", end: "2024-03-05" });
	assert.deepEqual(rangeOf(reversed), march);
});

test("首次点击：单日区间，该日即边界", () => {
	const selection = clickDay(emptySelection(), "2024-03-05");
	assert.deepEqual(rangeOf(selection), { start: "2024-03-05", end: "2024-03-05" });
	assert.equal(containsDay(selection, "2024-03-05"), true);
	assert.equal(isEdgeDay(selection, "2024-03-05"), true);
});

test("次击较晚：闭区间两端及中间日都被包含，两端为边界", () => {
	let selection = clickDay(emptySelection(), "2024-03-05");
	selection = clickDay(selection, "2024-03-10");
	assert.deepEqual(rangeOf(selection), march);
	assert.equal(containsDay(selection, "2024-03-05"), true);
	assert.equal(containsDay(selection, "2024-03-07"), true);
	assert.equal(containsDay(selection, "2024-03-10"), true);
	assert.equal(containsDay(selection, "2024-03-04"), false);
	assert.equal(containsDay(selection, "2024-03-11"), false);
	assert.equal(isEdgeDay(selection, "2024-03-05"), true);
	assert.equal(isEdgeDay(selection, "2024-03-10"), true);
	assert.equal(isEdgeDay(selection, "2024-03-07"), false);
});

test("次击较早：与反向点击得到同一区间", () => {
	let selection = clickDay(emptySelection(), "2024-03-10");
	selection = clickDay(selection, "2024-03-05");
	assert.deepEqual(rangeOf(selection), march);
	assert.equal(isEdgeDay(selection, "2024-03-05"), true);
	assert.equal(isEdgeDay(selection, "2024-03-10"), true);
	assert.equal(isEdgeDay(selection, "2024-03-07"), false);
});

test("区间完成后再次点击：重新开始选择", () => {
	let selection = clickDay(emptySelection(), "2024-03-05");
	selection = clickDay(selection, "2024-03-10");
	selection = clickDay(selection, "2024-03-20");
	assert.deepEqual(rangeOf(selection), { start: "2024-03-20", end: "2024-03-20" });
	assert.equal(isEdgeDay(selection, "2024-03-20"), true);
	assert.equal(isEdgeDay(selection, "2024-03-05"), false);
});

test("isRangeComplete：两次点击后才完成，单击仍可选择终点", () => {
	assert.equal(isRangeComplete(emptySelection()), false);

	const first = clickDay(emptySelection(), "2024-03-05");
	assert.equal(isRangeComplete(first), false);

	const second = clickDay(first, "2024-03-10");
	assert.equal(isRangeComplete(second), true);

	// 已完成区间后再次点击会重新开始，不应再视为完成
	const restart = clickDay(second, "2024-03-20");
	assert.equal(isRangeComplete(restart), false);
});

test("calendarInitialRange：周期快捷区间不回填自定义日历", () => {
	// 点过「本月 / 本年」等快捷按钮后，打开自定义日历应从空白开始
	assert.equal(calendarInitialRange(march, false), null);
	// 自定义选择本身在重新打开时保留
	assert.equal(calendarInitialRange(march, true), march);
	assert.equal(calendarInitialRange(null, true), null);
	assert.equal(calendarInitialRange(null, false), null);
});

test("clearRange：清空为无区间、无包含、无边界", () => {
	const selection = clearRange(clickDay(emptySelection(), "2024-03-05"));
	assert.equal(rangeOf(selection), null);
	assert.equal(containsDay(selection, "2024-03-05"), false);
	assert.equal(isEdgeDay(selection, "2024-03-05"), false);
});

test("转移不改动原值", () => {
	const original = clickDay(emptySelection(), "2024-03-05");
	const next = clickDay(original, "2024-03-10");
	assert.deepEqual(rangeOf(original), { start: "2024-03-05", end: "2024-03-05" });
	assert.deepEqual(rangeOf(next), march);
});
