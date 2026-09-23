import { test } from "node:test";
import assert from "node:assert/strict";
import { createTasksRepository, splitTaskPath } from "../src/tasks/tasksRepository";
import { TASKS_STATUS_DEFINITIONS, type RawTaskLine } from "../src/tasks/tasksLine";

test("list 自扫并映射为统一任务模型，跨笔记多任务互不覆盖", async () => {
	const lines: RawTaskLine[] = [
		{ path: "a.md", line: 0, text: "- [ ] 甲 #t" },
		{ path: "a.md", line: 4, text: "- [x] 乙 ✅ 2026-09-02" },
		{ path: "b.md", line: 1, text: "- [/] 丙" },
	];
	const repo = createTasksRepository({
		listLines: async () => lines,
		readNote: async () => null,
	});

	const tasks = await repo.list();
	assert.equal(tasks?.length, 3);
	assert.deepEqual(
		tasks!.map((t) => t.id),
		["a.md#0", "a.md#4", "b.md#1"],
		"同一笔记里的多条任务以 笔记#行号 区分"
	);
	assert.equal(tasks![0].title, "甲");
	assert.deepEqual(tasks![0].tags, ["t"]);
	assert.equal(tasks![1].status, "Done");
	assert.equal(tasks![2].status, "In Progress");
});

test("listLines 返回 null（来源插件未启用）时 list 返回 null", async () => {
	const repo = createTasksRepository({ listLines: async () => null, readNote: async () => null });
	assert.equal(await repo.list(), null);
});

test("readBody 解析 #行号并返回该行原文（保留未结构化字段，不走 frontmatter-stripping）", async () => {
	const content = "---\ntitle: x\n---\n- [ ] 第一行\n- [ ] 第二行 🛫 2026-09-01 ⛔ abc123";
	const repo = createTasksRepository({
		listLines: async () => [],
		readNote: async (path) => (path === "a.md" ? content : null),
	});

	assert.equal(await repo.readBody("a.md#4"), "- [ ] 第二行 🛫 2026-09-01 ⛔ abc123");
	assert.equal(await repo.readBody("a.md#3"), "- [ ] 第一行");
});

test("readBody 笔记不存在或行号越界时返回空串", async () => {
	const missing = createTasksRepository({ listLines: async () => [], readNote: async () => null });
	assert.equal(await missing.readBody("missing.md#0"), "");

	const short = createTasksRepository({
		listLines: async () => [],
		readNote: async () => "只有一行",
	});
	assert.equal(await short.readBody("a.md#99"), "");
});

test("statuses 返回内置状态表（值名 + 状态归类）", async () => {
	const repo = createTasksRepository({ listLines: async () => [], readNote: async () => null });
	const statuses = await repo.statuses();
	assert.deepEqual(statuses, TASKS_STATUS_DEFINITIONS);
	assert.ok(statuses.every((s) => typeof s.statusClass === "string"));
});

test("splitTaskPath 解析合法路径，非法行号返回 null", () => {
	assert.deepEqual(splitTaskPath("notes/a.md#12"), { notePath: "notes/a.md", line: 12 });
	assert.equal(splitTaskPath("notes/a.md"), null);
	assert.equal(splitTaskPath("notes/a.md#x"), null);
	assert.equal(splitTaskPath("notes/a.md#-1"), null);
});
