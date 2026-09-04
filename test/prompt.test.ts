import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportPrompt, formatTaskLine, groupTasksByProject } from "../src/core/prompt";
import type { TaskInfo } from "../src/types";

const task: TaskInfo = {
	title: "写周报",
	status: "done",
	priority: "high",
	path: "a",
	archived: false,
	completedDate: "2026-09-01",
	projects: ["项目A"],
	tags: ["汇报"],
	details: "完成周报初稿",
};

test("buildReportPrompt 极简模式（无模板）包含关键内容", () => {
	const prompt = buildReportPrompt([task], {
		range: { start: "2026-08-31", end: "2026-09-06" },
		type: "week",
		language: "中文",
	});
	assert.ok(prompt.includes("周报"));
	assert.ok(prompt.includes("2026-08-31 至 2026-09-06"));
	assert.ok(prompt.includes("写周报"));
});

test("buildReportPrompt 模板占位符替换", () => {
	const template = "类型：{{type}}；范围：{{range}}；任务：{{tasks}}";
	const prompt = buildReportPrompt([task], {
		range: { start: "2026-09-01", end: "2026-09-30" },
		type: "month",
		language: "中文",
		templateContent: template,
	});
	assert.ok(prompt.includes("类型：月报"));
	assert.ok(prompt.includes("2026-09-01 至 2026-09-30"));
	assert.ok(prompt.includes("写周报"));
});

test("buildReportPrompt 模板内容原样保留（不含占位符的部分）", () => {
	const template = "请生成本周工作总结。\n\n{{tasks}}";
	const prompt = buildReportPrompt([task], {
		range: { start: "2026-09-01", end: "2026-09-30" },
		type: "week",
		language: "中文",
		templateContent: template,
	});
	assert.ok(prompt.includes("请生成本周工作总结。"));
	assert.ok(prompt.includes("写周报"));
	assert.ok(!prompt.includes("{{tasks}}"));
});

test("formatTaskLine 包含标题与项目", () => {
	const line = formatTaskLine(task);
	assert.ok(line.includes("写周报"));
	assert.ok(line.includes("项目A"));
	assert.ok(line.includes("done"));
});

test("groupTasksByProject 归类正确", () => {
	const ungrouped: TaskInfo = { ...task, projects: undefined, path: "b" };
	const map = groupTasksByProject([task, ungrouped]);
	assert.equal(map.get("项目A")?.length, 1);
	assert.equal(map.get("（未归属项目）")?.length, 1);
});
