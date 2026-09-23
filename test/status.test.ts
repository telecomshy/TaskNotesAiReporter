import { test } from "node:test";
import assert from "node:assert/strict";
import {
	taskNotesStatusClass,
	tasksStatusClass,
	statusClassOf,
	filterTasksBySubset,
} from "../src/core/status";
import { makeTask } from "./fakes/task";
import type { StatusDefinition } from "../src/types";

const statuses: StatusDefinition[] = [
	{ value: "open", statusClass: "todo" },
	{ value: "in-progress", statusClass: "in-progress" },
	{ value: "done", statusClass: "completed" },
];

// ===== TaskNotes 规则（#47 修订二；ADR-0015 的值名限制如实保留） =====

test("taskNotesStatusClass：isCompleted → 已结束；其余未完成 → 待办（不产生「未知」）", () => {
	assert.equal(taskNotesStatusClass("done", true), "completed");
	assert.equal(taskNotesStatusClass("open", false), "todo");
	assert.equal(taskNotesStatusClass("unknown", undefined), "todo");
});

test("taskNotesStatusClass：值名 in-progress → 进行中（大小写/空白不敏感）", () => {
	assert.equal(taskNotesStatusClass("in-progress", false), "in-progress");
	assert.equal(taskNotesStatusClass("In-Progress", false), "in-progress");
	assert.equal(taskNotesStatusClass("open", false), "todo");
});

test("自定义状态名导致进行中为空（已知限制，ADR-0015）", () => {
	assert.equal(taskNotesStatusClass("doing", false), "todo");
});

test("已完成优先于进行中命名冲突", () => {
	assert.equal(taskNotesStatusClass("in-progress", true), "completed");
});

// ===== Obsidian Tasks 规则（#47 修订二；isDone 口径继承 #41） =====

test("tasksStatusClass：DONE / CANCELLED / NON_TASK → 已结束（isDone 口径）", () => {
	assert.equal(tasksStatusClass("DONE"), "completed");
	assert.equal(tasksStatusClass("CANCELLED"), "completed");
	assert.equal(tasksStatusClass("NON_TASK"), "completed");
});

test("tasksStatusClass：IN_PROGRESS → 进行中，TODO → 待办", () => {
	assert.equal(tasksStatusClass("IN_PROGRESS"), "in-progress");
	assert.equal(tasksStatusClass("TODO"), "todo");
});

test("tasksStatusClass：ON_HOLD / EMPTY / 类型缺失 / 不认识 → 未知", () => {
	assert.equal(tasksStatusClass("ON_HOLD"), "unknown");
	assert.equal(tasksStatusClass("EMPTY"), "unknown");
	assert.equal(tasksStatusClass(undefined), "unknown");
	assert.equal(tasksStatusClass("WEIRD"), "unknown");
});

// ===== 四档查询与三子集（#47 修订一） =====

test("statusClassOf 查目录；目录外的值（认不出的状态）→ 未知", () => {
	assert.equal(statusClassOf("done", statuses), "completed");
	assert.equal(statusClassOf("open", statuses), "todo");
	assert.equal(statusClassOf("unknown", statuses), "unknown");
});

test("filterTasksBySubset 切出已完成 / 进行中 / 未完成", () => {
	const tasks = [
		makeTask({ id: "a", status: "done" }),
		makeTask({ id: "b", status: "in-progress" }),
		makeTask({ id: "c", status: "open" }),
	];
	assert.deepEqual(filterTasksBySubset(tasks, "completed", statuses).map((t) => t.id), ["a"]);
	assert.deepEqual(filterTasksBySubset(tasks, "in-progress", statuses).map((t) => t.id), ["b"]);
	assert.deepEqual(filterTasksBySubset(tasks, "open", statuses).map((t) => t.id), ["b", "c"]);
});

test("无状态目录时全部视为未完成", () => {
	const tasks = [makeTask({ id: "a", status: "done" })];
	assert.deepEqual(filterTasksBySubset(tasks, "completed", []), []);
	assert.equal(filterTasksBySubset(tasks, "open", []).length, 1);
});

test("未知的去向：只进未完成，绝不谎报成已完成或进行中（两条不变式）", () => {
	const catalog: StatusDefinition[] = [...statuses, { value: "Unknown", statusClass: "unknown" }];
	const tasks = [
		makeTask({ id: "a", status: "done" }),
		makeTask({ id: "b", status: "in-progress" }),
		makeTask({ id: "c", status: "open" }),
		makeTask({ id: "d", status: "Unknown" }),
		makeTask({ id: "e", status: "认不出的值" }),
	];
	const completed = filterTasksBySubset(tasks, "completed", catalog);
	const inProgress = filterTasksBySubset(tasks, "in-progress", catalog);
	const open = filterTasksBySubset(tasks, "open", catalog);

	// 不变式一：count = completed + open（任何任务都不从三个子集里凭空消失）
	assert.equal(tasks.length, completed.length + open.length);
	// 不变式二：inProgress <= open
	assert.ok(inProgress.length <= open.length);

	assert.deepEqual(open.map((t) => t.id), ["b", "c", "d", "e"]);
	assert.deepEqual(inProgress.map((t) => t.id), ["b"]);
	assert.deepEqual(completed.map((t) => t.id), ["a"]);
});
