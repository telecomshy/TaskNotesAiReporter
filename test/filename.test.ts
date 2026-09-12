import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDatedReportFilename } from "../src/core/filename";

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
