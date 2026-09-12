import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createTaskRepository,
	stripFrontmatter,
	applyHydratedDetails,
	hydrateTask,
} from "../src/tasks/repository";
import { fakeTaskRepository } from "./fakes/taskRepository";
import type { TaskInfo } from "../src/types";

function task(over: Partial<TaskInfo> & { path: string }): TaskInfo {
	return { title: over.path, status: "open", priority: "normal", archived: false, ...over };
}

const baseTask: TaskInfo = {
	title: "写周报",
	status: "todo",
	priority: "medium",
	path: "2026/09.md",
	archived: false,
};

// ===== createTaskRepository（底层来源策略） =====

test("createTaskRepository.list 过滤归档与无路径任务", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [
			task({ path: "a" }),
			task({ path: "b", archived: true }),
			task({ path: "" }),
		],
		readNote: async () => null,
	});
	const result = await repo.list();
	assert.deepEqual(result?.map((t) => t.path), ["a"]);
});

test("createTaskRepository.list 在底层不可用时返回 null", async () => {
	const repo = createTaskRepository({ listTasks: async () => null, readNote: async () => null });
	assert.equal(await repo.list(), null);
});

test("createTaskRepository.readBody 去掉 frontmatter", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async () => "---\ntitle: x\nstatus: todo\n---\n\n正文内容",
	});
	assert.equal(await repo.readBody("a"), "正文内容");
});

test("createTaskRepository.readBody 无 frontmatter 时原样返回", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async () => "直接是正文内容",
	});
	assert.equal(await repo.readBody("a"), "直接是正文内容");
});

test("createTaskRepository.readBody 笔记不存在时返回空串", async () => {
	const repo = createTaskRepository({
		listTasks: async () => [],
		readNote: async () => null,
	});
	assert.equal(await repo.readBody("missing"), "");
});

// ===== hydrateTask（越过 seam 的消费行为） =====

test("hydrateTask 越过 seam 用 readBody 回填 details", async () => {
	const repo = fakeTaskRepository({ bodies: { "2026/09.md": "本周完成了报告初稿" } });
	const result = await hydrateTask(repo, baseTask);
	assert.equal(result.details, "本周完成了报告初稿");
	assert.equal(result.title, "写周报");
});

test("hydrateTask 正文为空时保留原 task", async () => {
	const repo = fakeTaskRepository({ bodies: {} });
	const withDetails = { ...baseTask, details: "原始详情" };
	const result = await hydrateTask(repo, withDetails);
	assert.equal(result.details, "原始详情");
});

// ===== 纯逻辑 =====

test("stripFrontmatter 去掉开头的 YAML frontmatter 返回正文", () => {
	const content = "---\ntitle: 测试\nstatus: todo\n---\n\n# 任务正文\n这里是一些详细描述。";
	assert.equal(stripFrontmatter(content), "# 任务正文\n这里是一些详细描述。");
});

test("stripFrontmatter 无 frontmatter 时原样返回（去尾部空白）", () => {
	assert.equal(stripFrontmatter("直接是正文内容  \n"), "直接是正文内容");
});

test("stripFrontmatter 空内容返回空", () => {
	assert.equal(stripFrontmatter(""), "");
	assert.equal(stripFrontmatter("   \n"), "");
});

test("applyHydratedDetails 正文非空时回填 details", () => {
	const result = applyHydratedDetails(baseTask, "详细描述了本周进展");
	assert.equal(result.details, "详细描述了本周进展");
	assert.equal(result.title, "写周报");
});

test("applyHydratedDetails 正文为空时保留原 details", () => {
	const withDetails = { ...baseTask, details: "原始详情" };
	assert.equal(applyHydratedDetails(withDetails, "   ").details, "原始详情");
});
