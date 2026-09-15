import { test } from "node:test";
import assert from "node:assert/strict";
import { isCompletedStatus, isInProgressStatus, filterTasksBySubset } from "../src/core/status";
import { task } from "./fakes/task";
import type { StatusDefinition } from "../src/types";

const statuses: StatusDefinition[] = [
	{ value: "open", isCompleted: false },
	{ value: "in-progress", isCompleted: false },
	{ value: "done", isCompleted: true },
];

test("isCompletedStatus 依据状态目录的 isCompleted", () => {
	assert.equal(isCompletedStatus("done", statuses), true);
	assert.equal(isCompletedStatus("open", statuses), false);
	assert.equal(isCompletedStatus("unknown", statuses), false);
});

test("isInProgressStatus 按状态值名 in-progress 且未完成", () => {
	assert.equal(isInProgressStatus("in-progress", statuses), true);
	assert.equal(isInProgressStatus("In-Progress", statuses), true);
	assert.equal(isInProgressStatus("open", statuses), false);
});

test("自定义状态名导致进行中为空（已知限制）", () => {
	const custom: StatusDefinition[] = [
		{ value: "doing", isCompleted: false },
		{ value: "done", isCompleted: true },
	];
	assert.equal(isInProgressStatus("doing", custom), false);
});

test("已完成优先于进行中命名冲突", () => {
	const conflict: StatusDefinition[] = [{ value: "in-progress", isCompleted: true }];
	assert.equal(isCompletedStatus("in-progress", conflict), true);
	assert.equal(isInProgressStatus("in-progress", conflict), false);
});

test("filterTasksBySubset 切出已完成 / 进行中 / 未完成", () => {
	const tasks = [
		task({ path: "a", status: "done" }),
		task({ path: "b", status: "in-progress" }),
		task({ path: "c", status: "open" }),
	];
	assert.deepEqual(
		filterTasksBySubset(tasks, "completed", statuses).map((t) => t.path),
		["a"]
	);
	assert.deepEqual(
		filterTasksBySubset(tasks, "in-progress", statuses).map((t) => t.path),
		["b"]
	);
	assert.deepEqual(
		filterTasksBySubset(tasks, "open", statuses).map((t) => t.path),
		["b", "c"]
	);
});

test("无状态目录时全部视为未完成", () => {
	const tasks = [task({ path: "a", status: "done" })];
	assert.deepEqual(filterTasksBySubset(tasks, "completed", []), []);
	assert.equal(filterTasksBySubset(tasks, "open", []).length, 1);
});
