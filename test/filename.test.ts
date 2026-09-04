import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportFilename } from "../src/core/filename";

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
