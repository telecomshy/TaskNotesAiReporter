import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_TYPE_LABEL } from "../src/core/reportType";

test("REPORT_TYPE_LABEL 覆盖所有报告类型", () => {
	assert.equal(REPORT_TYPE_LABEL.week, "周报");
	assert.equal(REPORT_TYPE_LABEL.month, "月报");
	assert.equal(REPORT_TYPE_LABEL.year, "年报");
	assert.equal(REPORT_TYPE_LABEL.custom, "报告");
});
