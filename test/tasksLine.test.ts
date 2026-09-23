import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskLine, TASKS_STATUS_DEFINITIONS } from "../src/tasks/tasksLine";
import { statusClassOf, filterTasksBySubset } from "../src/core/status";

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

test("parseTaskLine 状态符号映射为可读名，未知符号归入「未知」档", () => {
	const statusOf = (text: string) => parseTaskLine({ path: "a.md", line: 0, text }).status;
	assert.equal(statusOf("- [ ] x"), "Todo");
	assert.equal(statusOf("- [x] x"), "Done");
	assert.equal(statusOf("- [X] x"), "Done");
	assert.equal(statusOf("- [/] x"), "In Progress");
	assert.equal(statusOf("- [-] x"), "Cancelled");
	assert.equal(statusOf("- [?] x"), "Unknown", "未知符号 → 未知档（isDone 口径不含它）");
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

test("parseTaskLine 同一笔记不同行得到互不覆盖的唯一标识（不解释其内部格式）", () => {
	const first = parseTaskLine({ path: "a.md", line: 3, text: "- [ ] 甲" });
	const second = parseTaskLine({ path: "a.md", line: 7, text: "- [ ] 乙" });
	const other = parseTaskLine({ path: "b.md", line: 3, text: "- [ ] 丙" });
	assert.equal(new Set([first.id, second.id, other.id]).size, 3, "跨笔记与同笔记多行的标识都互不相同");
});

test("同笔记多任务按 id 移除互不牵连（#53 验收：移除单项不牵连同文件任务）", () => {
	const first = parseTaskLine({ path: "a.md", line: 3, text: "- [ ] 甲" });
	const second = parseTaskLine({ path: "a.md", line: 7, text: "- [ ] 乙" });
	// 「已加入」列表以标识为键（ReportModal 的候选 Map 同此语义）：删一键只去一项
	const joined = new Map([[first.id, first], [second.id, second]]);
	joined.delete(first.id);
	assert.deepEqual([...joined.keys()], [second.id], "同文件另一任务不受牵连");
});

test("TASKS_STATUS_DEFINITIONS 内置表产出状态归类四档（isDone 口径）", () => {
	const classOf = (value: string) => statusClassOf(value, TASKS_STATUS_DEFINITIONS);
	assert.equal(classOf("Todo"), "todo");
	assert.equal(classOf("Done"), "completed");
	assert.equal(classOf("In Progress"), "in-progress");
	assert.equal(classOf("Cancelled"), "completed", "isDone 口径：Cancelled 归已结束");
	assert.equal(classOf("Unknown"), "unknown");
	assert.equal(classOf("认不出的值"), "unknown", "目录外的值归「未知」");
});

test("内置表驱动子集划分：`/` 任务命中 in-progress 子集", () => {
	const tasks = [
		parseTaskLine({ path: "a.md", line: 0, text: "- [/] 进行中的事" }),
		parseTaskLine({ path: "a.md", line: 1, text: "- [ ] 待办的事" }),
		parseTaskLine({ path: "a.md", line: 2, text: "- [x] 完成的事" }),
	];
	assert.deepEqual(
		filterTasksBySubset(tasks, "in-progress", TASKS_STATUS_DEFINITIONS).map((t) => t.id),
		[tasks[0].id]
	);
	assert.deepEqual(
		filterTasksBySubset(tasks, "completed", TASKS_STATUS_DEFINITIONS).map((t) => t.id),
		[tasks[2].id]
	);
	assert.deepEqual(
		filterTasksBySubset(tasks, "open", TASKS_STATUS_DEFINITIONS).map((t) => t.id),
		[tasks[0].id, tasks[1].id]
	);
});

test("内置表缝外无来源词汇（StatusType 不出缝，ADR-0015）", () => {
	for (const entry of TASKS_STATUS_DEFINITIONS) {
		assert.deepEqual(Object.keys(entry).sort(), ["statusClass", "value"]);
	}
});
