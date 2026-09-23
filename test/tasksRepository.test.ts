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
	assert.equal(new Set(tasks!.map((t) => t.id)).size, 3, "同一笔记多行与跨笔记任务的标识互不相同");
	assert.equal(tasks![0].title, "甲");
	assert.deepEqual(tasks![0].tags, ["t"]);
	assert.equal(tasks![1].status, "Done");
	assert.equal(tasks![2].status, "In Progress");
});

test("listLines 返回 null（来源插件未启用）时 list 返回 null", async () => {
	const repo = createTasksRepository({ listLines: async () => null, readNote: async () => null });
	assert.equal(await repo.list(), null);
});

test("details 一批返回行原文（保留未结构化字段），同笔记只读一次文件", async () => {
	const content = "---\ntitle: x\n---\n- [ ] 第一行\n- [ ] 第二行 🛫 2026-09-01 ⛔ abc123";
	let reads = 0;
	const repo = createTasksRepository({
		listLines: async () => [],
		readNote: async (path) => {
			if (path !== "a.md") return null;
			reads += 1;
			return content;
		},
	});

	const details = await repo.details(["a.md#4", "a.md#3", "a.md#4"]);
	assert.equal(details["a.md#4"], "- [ ] 第二行 🛫 2026-09-01 ⛔ abc123");
	assert.equal(details["a.md#3"], "- [ ] 第一行");
	assert.equal(reads, 1, "同笔记多任务只读一次文件");
});

test("details 缺详情为空串（笔记不存在 / 行号越界 / 标识不可解析）", async () => {
	const missing = createTasksRepository({ listLines: async () => [], readNote: async () => null });
	assert.deepEqual(await missing.details(["missing.md#0"]), { "missing.md#0": "" });

	const short = createTasksRepository({
		listLines: async () => [],
		readNote: async () => "只有一行",
	});
	assert.deepEqual(await short.details(["a.md#99", "无行号"]), { "a.md#99": "", "无行号": "" });
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
