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

test("taskNotesStatusClass：isSkipped → 已取消（认标志不认名字，改名不影响，ADR-0027）", () => {
	assert.equal(taskNotesStatusClass("cancelled", false, true), "cancelled");
	assert.equal(taskNotesStatusClass("skipped", undefined, true), "cancelled");
	assert.equal(taskNotesStatusClass("moved-aside", false, true), "cancelled");
});

test("taskNotesStatusClass：优先级 isCompleted > isSkipped > 值名 in-progress", () => {
	// 既勾完成又勾跳过 → 已结束
	assert.equal(taskNotesStatusClass("weird", true, true), "completed");
	// isSkipped 压过值名 in-progress
	assert.equal(taskNotesStatusClass("in-progress", false, true), "cancelled");
	// 未勾 isSkipped 照旧（升级兼容：存量判定不变）
	assert.equal(taskNotesStatusClass("in-progress", false, false), "in-progress");
	assert.equal(taskNotesStatusClass("open", false, false), "todo");
});

test("自定义状态名导致进行中为空（已知限制，ADR-0015）", () => {
	assert.equal(taskNotesStatusClass("doing", false), "todo");
});

test("已完成优先于进行中命名冲突", () => {
	assert.equal(taskNotesStatusClass("in-progress", true), "completed");
});

// ===== 五档查询与四子集（#47 修订一；#76 / ADR-0027 扩「已取消」） =====

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

	// 不变式一：无取消档时 count = completed + open（含取消档后重述为三段和，见下）
	assert.equal(tasks.length, completed.length + open.length);
	// 不变式二：inProgress <= open
	assert.ok(inProgress.length <= open.length);

	assert.deepEqual(open.map((t) => t.id), ["b", "c", "d", "e"]);
	assert.deepEqual(inProgress.map((t) => t.id), ["b"]);
	assert.deepEqual(completed.map((t) => t.id), ["a"]);
});

test("已取消的去向：进 cancelled 子集、不进 open（open 口径重述，ADR-0027）", () => {
	const catalog: StatusDefinition[] = [
		...statuses,
		{ value: "cancelled", statusClass: "cancelled" },
		{ value: "Unknown", statusClass: "unknown" },
	];
	const tasks = [
		makeTask({ id: "a", status: "done" }),
		makeTask({ id: "b", status: "in-progress" }),
		makeTask({ id: "c", status: "open" }),
		makeTask({ id: "d", status: "cancelled" }),
		makeTask({ id: "e", status: "Unknown" }),
	];
	const completed = filterTasksBySubset(tasks, "completed", catalog);
	const inProgress = filterTasksBySubset(tasks, "in-progress", catalog);
	const cancelled = filterTasksBySubset(tasks, "cancelled", catalog);
	const open = filterTasksBySubset(tasks, "open", catalog);

	// 不变式重述（原 count = completed + open 破除）：
	// count = 已结束 + 未完成 + 已取消；未知仍进未完成，取消项不进任何旧子集
	assert.equal(tasks.length, completed.length + open.length + cancelled.length);
	assert.ok(inProgress.length <= open.length);
	assert.deepEqual(cancelled.map((t) => t.id), ["d"]);
	assert.deepEqual(open.map((t) => t.id), ["b", "c", "e"]);
	assert.deepEqual(completed.map((t) => t.id), ["a"]);
});

test("悬空值 → 未知，绝不进「已取消」（认不出的状态绝不谎报）", () => {
	const tasks = [makeTask({ id: "x", status: "renamed-away" })];
	assert.deepEqual(filterTasksBySubset(tasks, "cancelled", statuses), []);
	assert.deepEqual(filterTasksBySubset(tasks, "open", statuses).map((t) => t.id), ["x"]);
});

// ===== 状态筛选的四档投影（#75 / ADR-0021；#76 / ADR-0027 扩第四 chip） =====

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

test("filterTasksByStatusClasses：单选「已取消」恰命中取消项；四档全选 = 除未知外全部", () => {
	const catalog: StatusDefinition[] = [
		{ value: "open", statusClass: "todo" },
		{ value: "in-progress", statusClass: "in-progress" },
		{ value: "done", statusClass: "completed" },
		{ value: "cancelled", statusClass: "cancelled" },
	];
	const tasks = [
		makeTask({ id: "a", status: "open" }),
		makeTask({ id: "b", status: "in-progress" }),
		makeTask({ id: "c", status: "done" }),
		makeTask({ id: "d", status: "cancelled" }),
		makeTask({ id: "e", status: "认不出的值" }),
	];
	const onlyCancelled = filterTasksByStatusClasses(tasks, ["cancelled"], catalog);
	assert.deepEqual(onlyCancelled.matching.map((t) => t.id), ["d"]);
	assert.equal(onlyCancelled.unknownHidden, 1);

	// 四档全选（OR）= 除未知外全部命中
	const all = filterTasksByStatusClasses(
		tasks,
		["todo", "in-progress", "completed", "cancelled"],
		catalog
	);
	assert.deepEqual(all.matching.map((t) => t.id), ["a", "b", "c", "d"]);
	assert.equal(all.unknownHidden, 1);
});
