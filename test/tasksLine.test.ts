import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskLine, TASKS_STATUS_DEFINITIONS } from "../src/tasks/tasksLine";
import { isCompletedStatus, isInProgressStatus, filterTasksBySubset } from "../src/core/status";
import type { StatusDefinition } from "../src/types";

test("parseTaskLine 映射完整字段（状态/优先级/日期/标签/唯一路径）", () => {
	const task = parseTaskLine({
		path: "notes/2026-09.md",
		line: 12,
		text: "- [ ] 写周报 🔺 📅 2026-09-30 ⏳ 2026-09-28 ➕ 2026-09-01 #work #a/b",
	});

	assert.equal(task.title, "写周报");
	assert.equal(task.status, "Todo");
	assert.equal(task.priority, "Highest");
	assert.equal(task.due, "2026-09-30");
	assert.equal(task.scheduled, "2026-09-28");
	assert.equal(task.dateCreated, "2026-09-01");
	assert.deepEqual(task.tags, ["work", "a/b"]);
	assert.equal(task.path, "notes/2026-09.md#12", "path 承载「笔记#行号」唯一性");
	assert.equal(task.archived, false);
	assert.deepEqual(task.contexts, []);
	assert.deepEqual(task.projects, []);
});

test("parseTaskLine 完成日期与默认优先级", () => {
	const task = parseTaskLine({ path: "a.md", line: 0, text: "- [x] 完成事项 ✅ 2026-09-02" });
	assert.equal(task.status, "Done");
	assert.equal(task.completedDate, "2026-09-02");
	assert.equal(task.priority, "Normal");
	assert.equal(task.title, "完成事项");
});

test("parseTaskLine 状态符号映射为可读名，未知符号兜底 Todo", () => {
	const statusOf = (text: string) => parseTaskLine({ path: "a.md", line: 0, text }).status;
	assert.equal(statusOf("- [ ] x"), "Todo");
	assert.equal(statusOf("- [x] x"), "Done");
	assert.equal(statusOf("- [X] x"), "Done");
	assert.equal(statusOf("- [/] x"), "In Progress");
	assert.equal(statusOf("- [-] x"), "Cancelled");
	assert.equal(statusOf("- [?] x"), "Todo", "未知符号视为未完成（TODO 兜底）");
});

test("parseTaskLine 优先级箭号映射，缺省 Normal", () => {
	const priorityOf = (text: string) => parseTaskLine({ path: "a.md", line: 0, text }).priority;
	assert.equal(priorityOf("- [ ] x 🔺"), "Highest");
	assert.equal(priorityOf("- [ ] x ⏫"), "High");
	assert.equal(priorityOf("- [ ] x 🔼"), "Medium");
	assert.equal(priorityOf("- [ ] x 🔽"), "Low");
	assert.equal(priorityOf("- [ ] x ⏬"), "Lowest");
	assert.equal(priorityOf("- [ ] x"), "Normal");
});

test("parseTaskLine 标题去字段、去标签，保留未结构化字段", () => {
	const task = parseTaskLine({
		path: "a.md",
		line: 0,
		text: "  * [ ] 做事情 🔼 📅 2026-09-30 #标签",
	});
	assert.equal(task.title, "做事情");
	assert.deepEqual(task.tags, ["标签"]);
});

test("parseTaskLine 支持有序列表标记（1. [x] 亦被 metadataCache 视为清单行）", () => {
	const task = parseTaskLine({ path: "a.md", line: 0, text: "1. [x] 已完成 ✅ 2026-09-02" });
	assert.equal(task.status, "Done");
	assert.equal(task.title, "已完成");
	assert.equal(task.completedDate, "2026-09-02");
});

test("parseTaskLine 同一笔记不同行得到互不覆盖的唯一路径", () => {
	const first = parseTaskLine({ path: "a.md", line: 3, text: "- [ ] 甲" });
	const second = parseTaskLine({ path: "a.md", line: 7, text: "- [ ] 乙" });
	assert.notEqual(first.path, second.path);
	assert.equal(first.path, "a.md#3");
	assert.equal(second.path, "a.md#7");
});

test("TASKS_STATUS_DEFINITIONS 内置表带 type 且按 isDone 口径计算 isCompleted", () => {
	const byValue = new Map(TASKS_STATUS_DEFINITIONS.map((d) => [d.value, d.type]));
	assert.equal(byValue.get("Todo"), "TODO");
	assert.equal(byValue.get("Done"), "DONE");
	assert.equal(byValue.get("In Progress"), "IN_PROGRESS");
	assert.equal(byValue.get("Cancelled"), "CANCELLED");

	assert.equal(isCompletedStatus("Done", TASKS_STATUS_DEFINITIONS), true);
	assert.equal(isCompletedStatus("Cancelled", TASKS_STATUS_DEFINITIONS), true, "isDone 口径：Cancelled 视为已完成");
	assert.equal(isCompletedStatus("Todo", TASKS_STATUS_DEFINITIONS), false);
	assert.equal(isCompletedStatus("In Progress", TASKS_STATUS_DEFINITIONS), false);
});

test("内置表 type 驱动进行中判定：`/` 任务命中 in-progress 子集", () => {
	const tasks = [
		parseTaskLine({ path: "a.md", line: 0, text: "- [/] 进行中的事" }),
		parseTaskLine({ path: "a.md", line: 1, text: "- [ ] 待办的事" }),
		parseTaskLine({ path: "a.md", line: 2, text: "- [x] 完成的事" }),
	];
	assert.deepEqual(
		filterTasksBySubset(tasks, "in-progress", TASKS_STATUS_DEFINITIONS).map((t) => t.path),
		["a.md#0"]
	);
	assert.deepEqual(
		filterTasksBySubset(tasks, "completed", TASKS_STATUS_DEFINITIONS).map((t) => t.path),
		["a.md#2"]
	);
	assert.deepEqual(
		filterTasksBySubset(tasks, "open", TASKS_STATUS_DEFINITIONS).map((t) => t.path),
		["a.md#0", "a.md#1"]
	);
});

test("type 存在但不是 IN_PROGRESS：不冒充进行中", () => {
	const definitions: StatusDefinition[] = [{ value: "Doing", isCompleted: false, type: "TODO" }];
	assert.equal(isInProgressStatus("Doing", definitions), false);
});
