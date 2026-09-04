import { test } from "node:test";
import assert from "node:assert/strict";
import {
	toDateString,
	fromDateString,
	getWeekRange,
	getMonthRange,
	getYearRange,
	getQuarterRange,
	getISOWeekNumber,
} from "../src/core/dates";

test("toDateString 格式化正确", () => {
	assert.equal(toDateString(new Date(2026, 0, 5)), "2026-01-05");
	assert.equal(toDateString(new Date(2026, 11, 31)), "2026-12-31");
});

test("fromDateString 解析正确", () => {
	const d = fromDateString("2026-09-03");
	assert.equal(d.getFullYear(), 2026);
	assert.equal(d.getMonth(), 8);
	assert.equal(d.getDate(), 3);
});

test("getWeekRange 周一为起始日", () => {
	// 2026-09-03 是周四
	const range = getWeekRange(new Date(2026, 8, 3), true);
	assert.equal(range.start, "2026-08-31"); // 周一
	assert.equal(range.end, "2026-09-06"); // 周日
});

test("getWeekRange 周日为起始日", () => {
	const range = getWeekRange(new Date(2026, 8, 3), false);
	assert.equal(range.start, "2026-08-30"); // 周日
	assert.equal(range.end, "2026-09-05"); // 周六
});

test("getWeekRange 周日时周一为起始日回退到上周一", () => {
	// 2026-09-06 是周日
	const range = getWeekRange(new Date(2026, 8, 6), true);
	assert.equal(range.start, "2026-08-31");
	assert.equal(range.end, "2026-09-06");
});

test("getMonthRange 正确", () => {
	const range = getMonthRange(new Date(2026, 8, 15));
	assert.equal(range.start, "2026-09-01");
	assert.equal(range.end, "2026-09-30");
});

test("getYearRange 正确", () => {
	const range = getYearRange(new Date(2026, 5, 15));
	assert.equal(range.start, "2026-01-01");
	assert.equal(range.end, "2026-12-31");
});

test("getQuarterRange 正确", () => {
	// 2026-09-03 属于 Q3（7-9月）
	const q3 = getQuarterRange(new Date(2026, 8, 3));
	assert.equal(q3.start, "2026-07-01");
	assert.equal(q3.end, "2026-09-30");
	// 2026-01-15 属于 Q1（1-3月）
	const q1 = getQuarterRange(new Date(2026, 0, 15));
	assert.equal(q1.start, "2026-01-01");
	assert.equal(q1.end, "2026-03-31");
	// 2026-12-20 属于 Q4（10-12月）
	const q4 = getQuarterRange(new Date(2026, 11, 20));
	assert.equal(q4.start, "2026-10-01");
	assert.equal(q4.end, "2026-12-31");
});

test("getISOWeekNumber 正确", () => {
	// 2026-01-01 属于 2026 年第 1 周
	assert.equal(getISOWeekNumber(new Date(2026, 0, 1)), 1);
	// 2026-09-03 属于第 36 周
	assert.equal(getISOWeekNumber(new Date(2026, 8, 3)), 36);
});
