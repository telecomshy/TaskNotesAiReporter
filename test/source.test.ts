import { test } from "node:test";
import assert from "node:assert/strict";
import { stripFrontmatter, applyHydratedDetails } from "../src/tasks/source";
import type { TaskInfo } from "../src/types";

const baseTask: TaskInfo = {
	title: "写周报",
	status: "todo",
	priority: "medium",
	path: "2026/09.md",
	archived: false,
};

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
