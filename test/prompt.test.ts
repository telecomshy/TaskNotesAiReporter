import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportPrompt, formatTaskLine } from "../src/core/prompt";
import { task as makeTask } from "./fakes/task";
import type { StatusDefinition, TaskInfo } from "../src/types";

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

test("buildReportPrompt 极简模式：输出语言声明位于末尾", () => {
	const prompt = buildReportPrompt([task], {
		range: { start: "2026-08-31", end: "2026-09-06" },
		type: "week",
		language: "English",
	});
	assert.ok(prompt.trimEnd().endsWith("输出语言：English。"));
});

test("buildReportPrompt 模板模式：同样声明输出语言且位于末尾", () => {
	const prompt = buildReportPrompt([task], {
		range: { start: "2026-09-01", end: "2026-09-30" },
		type: "month",
		language: "English",
		templateContent: "请生成月报。\n\n{{tasks}}",
	});
	assert.ok(prompt.includes("输出语言：English。"), "模板模式也应声明输出语言");
	assert.ok(prompt.trimEnd().endsWith("输出语言：English。"));
});

const range = { start: "2026-09-01", end: "2026-09-30" };

const statuses: StatusDefinition[] = [
	{ value: "open" },
	{ value: "in-progress" },
	{ value: "done", isCompleted: true },
];

test("占位符：{{range.start}} / {{range.end}} 引用起止日期", () => {
	const prompt = buildReportPrompt([task], {
		range,
		type: "month",
		language: "中文",
		templateContent: "{{range.start}} ~ {{range.end}}",
	});
	assert.ok(prompt.includes("2026-09-01 ~ 2026-09-30"));
});

test("占位符：{{today}} 取注入的 now", () => {
	const prompt = buildReportPrompt([task], {
		range,
		type: "week",
		language: "中文",
		now: new Date(2026, 8, 7),
		templateContent: "生成于 {{today}}",
	});
	assert.ok(prompt.includes("生成于 2026-09-07"));
});

test("占位符：{{count}} 与各子集计数", () => {
	const tasks = [
		makeTask({ path: "a", status: "done" }),
		makeTask({ path: "b", status: "in-progress" }),
		makeTask({ path: "c", status: "open" }),
	];
	const prompt = buildReportPrompt(tasks, {
		range,
		type: "week",
		language: "中文",
		statuses,
		templateContent:
			"总 {{count}}，完成 {{completedCount}}，进行 {{inProgressCount}}，未完成 {{openCount}}",
	});
	assert.ok(prompt.includes("总 3，完成 1，进行 1，未完成 2"));
});

test("占位符：{{completedTasks}} 只注入已完成任务", () => {
	const tasks = [
		makeTask({ path: "a", status: "done" }),
		makeTask({ path: "b", status: "in-progress" }),
		makeTask({ path: "c", status: "open" }),
	];
	const prompt = buildReportPrompt(tasks, {
		range,
		type: "week",
		language: "中文",
		statuses,
		templateContent: "{{completedTasks}}",
	});
	assert.ok(prompt.includes("标题：a"));
	assert.ok(!prompt.includes("标题：b"));
	assert.ok(!prompt.includes("标题：c"));
});

test("占位符：{{openTasks}} 含进行中与未开始", () => {
	const tasks = [
		makeTask({ path: "a", status: "done" }),
		makeTask({ path: "b", status: "in-progress" }),
		makeTask({ path: "c", status: "open" }),
	];
	const prompt = buildReportPrompt(tasks, {
		range,
		type: "week",
		language: "中文",
		statuses,
		templateContent: "{{openTasks}}",
	});
	assert.ok(!prompt.includes("标题：a"));
	assert.ok(prompt.includes("标题：b"));
	assert.ok(prompt.includes("标题：c"));
});

test("占位符：{{totalTrackedTime}} 汇总耗时", () => {
	const tasks = [makeTask({ path: "a", totalTrackedTime: 90 }), makeTask({ path: "b", totalTrackedTime: 30 })];
	const prompt = buildReportPrompt(tasks, {
		range,
		type: "week",
		language: "中文",
		templateContent: "耗时 {{totalTrackedTime}}",
	});
	assert.ok(prompt.includes("耗时 2小时"));
});

test("占位符：大小写不敏感且容许内部空格", () => {
	const prompt = buildReportPrompt([task], {
		range,
		type: "week",
		language: "中文",
		templateContent: "{{ RANGE }}|{{COUNT}}|{{ Range.Start }}",
	});
	assert.ok(prompt.includes("2026-09-01 至 2026-09-30"));
	assert.ok(prompt.includes("|1|"));
	assert.ok(prompt.includes("|2026-09-01"));
});

test("占位符：未知占位符原样保留", () => {
	const prompt = buildReportPrompt([task], {
		range,
		type: "week",
		language: "中文",
		templateContent: "{{Task}} {{nope}}",
	});
	assert.ok(prompt.includes("{{Task}} {{nope}}"));
});

test("formatTaskLine 包含标题与项目", () => {
	const line = formatTaskLine(task);
	assert.ok(line.includes("写周报"));
	assert.ok(line.includes("项目A"));
	assert.ok(line.includes("done"));
});

test("formatTaskLine 完整保留超长详情（不限 200 字）", () => {
	const longDetail = "很长的详细描述".repeat(60); // 远超 200 字
	const t: TaskInfo = { ...task, details: longDetail };
	const line = formatTaskLine(t);
	assert.ok(line.includes(longDetail), "超长详情应完整出现在行内");
	assert.ok(!line.includes("…"), "不应出现截断省略号");
});

