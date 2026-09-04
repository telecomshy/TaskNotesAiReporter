import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportFilename, buildDatedReportFilename } from "../src/core/filename";

test("周报文件名", () => {
	assert.equal(
		buildReportFilename("week", { start: "2026-08-31", end: "2026-09-06" }),
		"周报-2026-W36"
	);
});

test("月报文件名", () => {
	assert.equal(buildReportFilename("month", { start: "2026-08-01", end: "2026-08-31" }), "月报-2026-08");
});

test("年报文件名", () => {
	assert.equal(buildReportFilename("year", { start: "2026-01-01", end: "2026-12-31" }), "年报-2026");
});

test("自定义范围文件名", () => {
	assert.equal(
		buildReportFilename("custom", { start: "2026-08-01", end: "2026-08-15" }),
		"报告-2026-08-01_2026-08-15"
	);
});

test("带模板名的生成文件名 = 模板名+YYYYMMDDHHMM", () => {
	// 2026-09-04 16:05
	const date = new Date(2026, 8, 4, 16, 5, 30);
	assert.equal(buildDatedReportFilename("周报", date), "周报202609041605");
});

test("无模板名时用「报告」兜底", () => {
	const date = new Date(2026, 8, 4, 9, 3);
	assert.equal(buildDatedReportFilename("", date), "报告202609040903");
});

test("模板名首尾空白会被修剪", () => {
	const date = new Date(2026, 0, 2, 7, 8);
	assert.equal(buildDatedReportFilename("  月报  ", date), "月报202601020708");
});
