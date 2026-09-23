import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createTaskRepository,
	stripFrontmatter,
	applyDetails,
	hydrateTasks,
} from "../src/tasks/repository";
import { fakeTaskRepository } from "./fakes/taskRepository";
import { makeTask } from "./fakes/task";
import type { TaskInfo } from "../src/types";

const baseTask: TaskInfo = {
	title: "写周报",
	status: "todo",
	priority: "medium",
	id: "2026/09.md",
	archived: false,
};

// ===== createTaskRepository（底层来源策略） =====

test("createTaskRepository.list 过滤归档与无标识任务", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [makeTask({ id: "a" }), makeTask({ id: "b", archived: true }), makeTask({ id: "" })],
		readNote: async () => null,
	});
	const result = await repo.list();
	assert.deepEqual(result?.map((t) => t.id), ["a"]);
});

test("createTaskRepository.list 在底层不可用时返回 null", async () => {
	const repo = createTaskRepository({ listTasks: async () => null, readNote: async () => null });
	assert.equal(await repo.list(), null);
});

test("createTaskRepository.statuses 返回状态目录", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async () => null,
		listStatuses: async () => [{ value: "done", statusClass: "completed" }],
	});
	assert.deepEqual(await repo.statuses(), [{ value: "done", statusClass: "completed" }]);
});

test("createTaskRepository.statuses 底层不可用时返回空数组", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async () => null,
		listStatuses: async () => null,
	});
	assert.deepEqual(await repo.statuses(), []);
});

// ===== details（#48：一批补 + 一种缺失约定） =====

test("createTaskRepository.details 一批返回去 frontmatter 的正文", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async (path) =>
			path === "a" ? "---\ntitle: x\n---\n\n正文内容" : "直接是正文内容",
	});
	assert.deepEqual(await repo.details(["a", "b"]), { a: "正文内容", b: "直接是正文内容" });
});

test("createTaskRepository.details 同一标识只读一次，缺详情为空串", async () => {
	let reads = 0;
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async (path) => {
			if (path !== "a") return null;
			reads += 1;
			return "正文";
		},
	});
	assert.deepEqual(await repo.details(["a", "a", "missing"]), { a: "正文", missing: "" });
	assert.equal(reads, 1);
});

test("createTaskRepository.details 请求的每个标识都有返回项（缺失即空串）", async () => {
	const repo = createTaskRepository({ listTasks: async () => [], readNote: async () => null });
	const details = await repo.details(["x", "y"]);
	assert.deepEqual(Object.keys(details).sort(), ["x", "y"]);
	assert.ok(Object.values(details).every((v) => v === ""));
});

// ===== applyDetails / hydrateTasks（越过 seam 的消费行为） =====

test("applyDetails 非空详情回填 details，保留其它字段", () => {
	const result = applyDetails([baseTask], { "2026/09.md": "详细描述了本周进展" });
	assert.equal(result[0].details, "详细描述了本周进展");
	assert.equal(result[0].title, "写周报");
});

test("applyDetails 空详情保留原 details（缺详情不抹掉已有内容）", () => {
	const withDetails = { ...baseTask, details: "原始详情" };
	assert.equal(applyDetails([withDetails], { "2026/09.md": "   " })[0].details, "原始详情");
	assert.equal(applyDetails([withDetails], {})[0].details, "原始详情");
});

test("hydrateTasks 一次一批越过 seam 补详情", async () => {
	const repo = fakeTaskRepository({ bodies: { "2026/09.md": "本周完成了报告初稿" } });
	const result = await hydrateTasks(repo, [baseTask]);
	assert.equal(result[0].details, "本周完成了报告初稿");
	assert.equal(result[0].title, "写周报");
});

test("hydrateTasks 缺详情时保留原 task 不变", async () => {
	const repo = fakeTaskRepository({ bodies: {} });
	const withDetails = { ...baseTask, details: "原始详情" };
	const result = await hydrateTasks(repo, [withDetails]);
	assert.equal(result[0].details, "原始详情");
});

// ===== 纯逻辑 =====

test("stripFrontmatter 去掉开头的 YAML frontmatter 返回正文", () => {
	const content = "---\ntitle: 测试\nstatus: todo\n---\n\n# 任务正文\n这里是一些详细描述。";
	assert.equal(stripFrontmatter(content), "# 任务正文\n这里是一些详细描述。");
});

test("stripFrontmatter 无 frontmatter 时原样返回（去尾部空白）", () => {
	assert.equal(stripFrontmatter("直接是正文内容 \n"), "直接是正文内容");
});

test("stripFrontmatter 空内容返回空", () => {
	assert.equal(stripFrontmatter(""), "");
	assert.equal(stripFrontmatter("   \n"), "");
});
