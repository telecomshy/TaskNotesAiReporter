import { test } from "node:test";
import assert from "node:assert/strict";
import {
	toDateString,
	getWeekRange,
	getLastWeekRange,
	getMonthRange,
	getLastMonthRange,
	getYearRange,
	getLastYearRange,
	getQuarterRange,
	getLastQuarterRange,
	getReportRange,
} from "../src/core/dates";
import { makeTask } from "./fakes/task";

test("toDateString 格式化正确", () => {
	assert.equal(toDateString(new Date(2026, 0, 5)), "2026-01-05");
	assert.equal(toDateString(new Date(2026, 11, 31)), "2026-12-31");
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

test("getLastWeekRange 周一为起始日取紧邻的上一个完整自然周", () => {
	// 2026-09-03 是周四，本周 2026-08-31 ~ 2026-09-06
	const range = getLastWeekRange(new Date(2026, 8, 3), true);
	assert.equal(range.start, "2026-08-24"); // 周一
	assert.equal(range.end, "2026-08-30"); // 周日
});

test("getLastWeekRange 周日为起始日", () => {
	// 2026-09-03 是周四，本周 2026-08-30 ~ 2026-09-05
	const range = getLastWeekRange(new Date(2026, 8, 3), false);
	assert.equal(range.start, "2026-08-23"); // 周日
	assert.equal(range.end, "2026-08-29"); // 周六
});

test("getLastWeekRange 周跨年（周一为起始日）", () => {
	// 2026-01-02 是周五，本周 2025-12-29 ~ 2026-01-04
	const range = getLastWeekRange(new Date(2026, 0, 2), true);
	assert.equal(range.start, "2025-12-22");
	assert.equal(range.end, "2025-12-28");
});

test("getLastWeekRange 周跨年（周日为起始日）", () => {
	// 2026-01-02 是周五，本周 2025-12-28 ~ 2026-01-03
	const range = getLastWeekRange(new Date(2026, 0, 2), false);
	assert.equal(range.start, "2025-12-21");
	assert.equal(range.end, "2025-12-27");
});

test("getMonthRange 正确", () => {
	const range = getMonthRange(new Date(2026, 8, 15));
	assert.equal(range.start, "2026-09-01");
	assert.equal(range.end, "2026-09-30");
});

test("getLastMonthRange 普通月取上一个自然月", () => {
	// 不是最近 30 天（那样会是 2026-08-16 起）
	const range = getLastMonthRange(new Date(2026, 8, 15));
	assert.equal(range.start, "2026-08-01");
	assert.equal(range.end, "2026-08-31");
});

test("getLastMonthRange 月末短月按上一个自然月推导", () => {
	// 2026-03-30 的上一月是 2 月（平年），不是 anchor 减 N 天
	const range = getLastMonthRange(new Date(2026, 2, 30));
	assert.equal(range.start, "2026-02-01");
	assert.equal(range.end, "2026-02-28");
});

test("getLastMonthRange 1 月跨年回到上年 12 月", () => {
	const range = getLastMonthRange(new Date(2026, 0, 15));
	assert.equal(range.start, "2025-12-01");
	assert.equal(range.end, "2025-12-31");
});

test("getLastMonthRange 闰年 2 月止于 29 日、平年止于 28 日", () => {
	// 2024 是闰年
	const leap = getLastMonthRange(new Date(2024, 2, 15));
	assert.equal(leap.start, "2024-02-01");
	assert.equal(leap.end, "2024-02-29");
	// 2026 是平年
	const common = getLastMonthRange(new Date(2026, 2, 15));
	assert.equal(common.start, "2026-02-01");
	assert.equal(common.end, "2026-02-28");
});

test("getYearRange 正确", () => {
	const range = getYearRange(new Date(2026, 5, 15));
	assert.equal(range.start, "2026-01-01");
	assert.equal(range.end, "2026-12-31");
});

test("getLastYearRange 取上一自然年", () => {
	const range = getLastYearRange(new Date(2026, 8, 15));
	assert.equal(range.start, "2025-01-01");
	assert.equal(range.end, "2025-12-31");
});

test("getLastYearRange 年初 anchor 同样回到上一自然年", () => {
	const range = getLastYearRange(new Date(2026, 0, 15));
	assert.equal(range.start, "2025-01-01");
	assert.equal(range.end, "2025-12-31");
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

test("getLastQuarterRange 取上一个完整自然季度", () => {
	// 2026-09-15 属于 Q3，上一季度是 Q2
	const q2 = getLastQuarterRange(new Date(2026, 8, 15));
	assert.equal(q2.start, "2026-04-01");
	assert.equal(q2.end, "2026-06-30");
	// 2026-05-10 属于 Q2，上一季度是 Q1
	const q1 = getLastQuarterRange(new Date(2026, 4, 10));
	assert.equal(q1.start, "2026-01-01");
	assert.equal(q1.end, "2026-03-31");
});

test("getLastQuarterRange 季度跨年：Q1 的上一季度是上年 Q4", () => {
	const range = getLastQuarterRange(new Date(2026, 0, 15));
	assert.equal(range.start, "2025-10-01");
	assert.equal(range.end, "2025-12-31");
});

test("getReportRange 取任务最早到最晚日期", () => {
	const tasks = [
		makeTask({ id: "a", completedDate: "2026-09-05" }),
		makeTask({ id: "b", due: "2026-09-01" }),
	];
	assert.deepEqual(getReportRange(tasks, true, new Date(2026, 8, 3)), {
		start: "2026-09-01",
		end: "2026-09-05",
	});
});

test("getReportRange 纳入创建时间（ISO 时间戳）并规范化为日期", () => {
	const tasks = [
		makeTask({ id: "a", dateCreated: "2026-09-10T08:30:00" }),
		makeTask({ id: "b", completedDate: "2026-09-05" }),
	];
	assert.deepEqual(getReportRange(tasks, true, new Date(2026, 8, 3)), {
		start: "2026-09-05",
		end: "2026-09-10",
	});
});

test("getReportRange 仅有创建时间时也恒有定义", () => {
	const tasks = [makeTask({ id: "a", dateCreated: "2026-09-10T08:30:00" })];
	assert.deepEqual(getReportRange(tasks, true, new Date(2026, 8, 3)), {
		start: "2026-09-10",
		end: "2026-09-10",
	});
});

test("getReportRange 无日期任务回退到 now 所在周", () => {
	const tasks = [makeTask({ id: "a" })];
	// now = 2026-09-03（周四），周一为起始 → 2026-08-31 ~ 2026-09-06
	assert.deepEqual(getReportRange(tasks, true, new Date(2026, 8, 3)), {
		start: "2026-08-31",
		end: "2026-09-06",
	});
});
