import { test } from "node:test";
import assert from "node:assert/strict";
import {
	normalizeDateValue,
	filterTasksByDateRange,
	filterTasksWithoutDate,
	hasNoDate,
} from "../src/core/filter";
import type { DateField, TaskInfo } from "../src/types";

function makeTask(overrides: Partial<TaskInfo> & { path: string; title: string }): TaskInfo {
	return {
		status: "open",
		priority: "normal",
		archived: false,
		...overrides,
	};
}

const dateFields: DateField[] = ["completedDate", "due", "scheduled"];

test("normalizeDateValue 提取 YYYY-MM-DD", () => {
	assert.equal(normalizeDateValue("2026-09-03"), "2026-09-03");
	assert.equal(normalizeDateValue("2026-09-03T10:30:00Z"), "2026-09-03");
	assert.equal(normalizeDateValue(undefined), null);
	assert.equal(normalizeDateValue(""), null);
});

test("filterTasksByDateRange 按完成日期筛选", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({ path: "a", title: "A", completedDate: "2026-09-01" }),
		makeTask({ path: "b", title: "B", completedDate: "2026-09-10" }),
		makeTask({ path: "c", title: "C", due: "2026-09-02" }),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.deepEqual(
		result.map((t) => t.path).sort(),
		["a", "c"]
	);
});

test("filterTasksByDateRange 排除已归档任务", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({ path: "a", title: "A", completedDate: "2026-09-01" }),
		makeTask({ path: "b", title: "B", completedDate: "2026-09-02", archived: true }),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.deepEqual(result.map((t) => t.path), ["a"]);
});

test("filterTasksByDateRange 多字段命中去重", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({
			path: "a",
			title: "A",
			completedDate: "2026-09-01",
			due: "2026-09-03",
		}),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.equal(result.length, 1);
});

test("filterTasksWithoutDate 识别无日期任务", () => {
	const tasks = [
		makeTask({ path: "a", title: "A" }), // 无任何日期
		makeTask({ path: "b", title: "B", completedDate: "2026-09-01" }),
	];
	const result = filterTasksWithoutDate(tasks, dateFields);
	assert.deepEqual(result.map((t) => t.path), ["a"]);
});

test("hasNoDate 判断正确", () => {
	assert.equal(hasNoDate(makeTask({ path: "a", title: "A" }), dateFields), true);
	assert.equal(
		hasNoDate(makeTask({ path: "b", title: "B", due: "2026-09-01" }), dateFields),
		false
	);
});
