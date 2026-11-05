import { test } from "node:test";
import assert from "node:assert/strict";
import {
	taskNotesStatusClass,
	statusClassOf,
	filterTasksBySubset,
	filterTasksByStatusClasses,
} from "../src/core/status";
import { makeTask } from "./fakes/task";
import type { StatusDefinition } from "../src/types";

const statuses: StatusDefinition[] = [
	{ value: "open", statusClass: "todo" },
	{ value: "in-progress", statusClass: "in-progress" },
	{ value: "done", statusClass: "completed" },
];

// ===== 状态归类（#47 修订二；ADR-0015 的值名限制如实保留） =====

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

// ===== 状态筛选的三档投影（#75 / ADR-0021） =====

test("filterTasksByStatusClasses：档间 OR；未知不设档，选中任一档即被排除并计数", () => {
	const tasks = [
		makeTask({ id: "a", status: "open" }),
		makeTask({ id: "b", status: "in-progress" }),
		makeTask({ id: "c", status: "done" }),
		makeTask({ id: "d", status: "认不出的值" }),
	];
	const todoOnly = filterTasksByStatusClasses(tasks, ["todo"], statuses);
	assert.deepEqual(todoOnly.matching.map((t) => t.id), ["a"]);
	assert.equal(todoOnly.unknownHidden, 1);

	// 待办 + 已结束 = 两者并集；进行中与未知都不出现
	const union = filterTasksByStatusClasses(tasks, ["todo", "completed"], statuses);
	assert.deepEqual(union.matching.map((t) => t.id), ["a", "c"]);
	assert.equal(union.unknownHidden, 1);
});

test("filterTasksByStatusClasses：自定义状态按目录归类命中对应档；悬空值 → 未知", () => {
	const catalog: StatusDefinition[] = [
		{ value: "open", statusClass: "todo" },
		{ value: "doing", statusClass: "in-progress" },
		{ value: "done", statusClass: "completed" },
	];
	const tasks = [
		makeTask({ id: "a", status: "doing" }),
		makeTask({ id: "b", status: "renamed-away" }),
	];
	const inProgress = filterTasksByStatusClasses(tasks, ["in-progress"], catalog);
	assert.deepEqual(inProgress.matching.map((t) => t.id), ["a"]);
	assert.equal(inProgress.unknownHidden, 1);
});
