import { test } from "node:test";
import assert from "node:assert/strict";
import {
	generateReport,
	type GenerateReportDeps,
	type GenerateReportFailure,
	type GenerateReportInput,
	type GenerateReportResult,
} from "../src/report/generate";
import { fakeTaskRepository } from "./fakes/taskRepository";
import { makeTask } from "./fakes/task";
import type { AIClientConfig } from "../src/ai/client";
import type { DateRange, ReportType } from "../src/types";

function baseInput(over: Partial<GenerateReportInput> = {}): GenerateReportInput {
	return {
		tasks: [makeTask({ path: "a", title: "A", completedDate: "2026-09-03" })],
		type: "custom",
		templateId: "",
		templates: [],
		language: "中文",
		weekStartsOnMonday: true,
		reportFolder: "TaskNotes/Reports",
		activeModel: { ok: true, config: { baseUrl: "https://api.example.com", apiKey: "sk", model: "m" } },
		temperature: 0.7,
		maxTokens: 8192,
		timeoutSeconds: 30,
		...over,
	};
}

interface Captured {
	prompt: string;
	chatConfig: AIClientConfig;
	saved: { folder: string; type: ReportType; range: DateRange; content: string; templateName?: string };
}

function setup(over: Partial<GenerateReportDeps> = {}): {
	deps: GenerateReportDeps;
	captured: Partial<Captured>;
} {
	const captured: Partial<Captured> = {};
	const deps: GenerateReportDeps = {
		repository: fakeTaskRepository({ bodies: { a: "任务正文" } }),
		chat: async (prompt, config) => {
			captured.prompt = prompt;
			captured.chatConfig = config;
			return "生成的报告正文";
		},
		save: async (folder, type, range, content, templateName) => {
			captured.saved = { folder, type, range, content, templateName };
			return "TaskNotes/Reports/报告.md";
		},
		now: () => new Date(2026, 8, 3),
		...over,
	};
	return { deps, captured };
}

function failure(result: GenerateReportResult): GenerateReportFailure {
	assert.equal(result.ok, false);
	return result as GenerateReportFailure;
}

test("成功：返回 path，并保存生成的正文", async () => {
	const { deps, captured } = setup();
	const result = await generateReport(baseInput(), deps);
	assert.deepEqual(result, { ok: true, path: "TaskNotes/Reports/报告.md" });
	assert.equal(captured.saved?.content, "生成的报告正文");
});

test("无任务 → no-tasks", async () => {
	const result = await generateReport(baseInput({ tasks: [] }), setup().deps);
	assert.equal(failure(result).reason, "no-tasks");
});

test("未选模型 → no-model", async () => {
	const result = await generateReport(
		baseInput({ activeModel: { ok: false, reason: "no-model" } }),
		setup().deps
	);
	assert.equal(failure(result).reason, "no-model");
});

test("无当前供应商 → no-model（并入）", async () => {
	const result = await generateReport(
		baseInput({ activeModel: { ok: false, reason: "no-provider" } }),
		setup().deps
	);
	assert.equal(failure(result).reason, "no-model");
});

test("缺凭证 → missing-credentials", async () => {
	const result = await generateReport(
		baseInput({ activeModel: { ok: false, reason: "missing-credentials" } }),
		setup().deps
	);
	assert.equal(failure(result).reason, "missing-credentials");
});

test("模型调用失败 → ai-error 且带原始 error", async () => {
	const { deps } = setup({
		chat: async () => {
			throw new Error("boom");
		},
	});
	const result = failure(await generateReport(baseInput(), deps));
	assert.equal(result.reason, "ai-error");
	assert.ok(result.error instanceof Error);
	assert.equal(result.error.message, "boom");
});

test("保存失败 → save-error", async () => {
	const { deps } = setup({
		save: async () => {
			throw new Error("disk full");
		},
	});
	const result = failure(await generateReport(baseInput(), deps));
	assert.equal(result.reason, "save-error");
	assert.ok(result.error instanceof Error);
	assert.equal(result.error.message, "disk full");
});

test("时间范围：取任务最早到最晚", async () => {
	const { deps, captured } = setup();
	await generateReport(
		baseInput({
			tasks: [
				makeTask({ path: "a", completedDate: "2026-09-05" }),
				makeTask({ path: "b", due: "2026-09-01" }),
			],
		}),
		deps
	);
	assert.deepEqual(captured.saved?.range, { start: "2026-09-01", end: "2026-09-05" });
});

test("时间范围：无日期回退到本周（now 注入）", async () => {
	const { deps, captured } = setup();
	await generateReport(baseInput({ tasks: [makeTask({ path: "a" })] }), deps);
	// now = 2026-09-03（周四），周一为起始 → 2026-08-31 ~ 2026-09-06
	assert.deepEqual(captured.saved?.range, { start: "2026-08-31", end: "2026-09-06" });
});

test("模型参数回退：该模型自带上限优先", async () => {
	const { deps, captured } = setup();
	await generateReport(
		baseInput({
			activeModel: {
				ok: true,
				config: { baseUrl: "https://x", apiKey: "k", model: "m", maxTokens: 4096 },
			},
			maxTokens: 8192,
		}),
		deps
	);
	assert.equal(captured.chatConfig?.maxTokens, 4096);
});

test("模型参数回退：无自带上限用全局", async () => {
	const { deps, captured } = setup();
	await generateReport(baseInput({ maxTokens: 8192 }), deps);
	assert.equal(captured.chatConfig?.maxTokens, 8192);
});

test("占位符：generate 把状态目录与 now 传给提示词", async () => {
	const { deps, captured } = setup({
		repository: fakeTaskRepository({
			statuses: [{ value: "done", isCompleted: true }],
		}),
	});
	await generateReport(
		baseInput({
			tasks: [
				makeTask({ path: "a", title: "A", status: "done" }),
				makeTask({ path: "b", title: "B", status: "open" }),
			],
			templateId: "t1",
			templates: [{ id: "t1", name: "周报", content: "{{completedTasks}}\n{{today}}" }],
		}),
		deps
	);
	assert.ok(captured.prompt?.includes("标题：A"));
	assert.ok(!captured.prompt?.includes("标题：B"));
	assert.ok(captured.prompt?.includes("2026-09-03"));
});

test("模板命中：提示词含模板内容", async () => {
	const { deps, captured } = setup();
	await generateReport(
		baseInput({
			templateId: "t1",
			templates: [{ id: "t1", name: "周报", content: "请生成：{{tasks}}" }],
		}),
		deps
	);
	assert.ok(captured.prompt?.includes("请生成："));
});

test("附加要求：透传到被捕获的提示词", async () => {
	const { deps, captured } = setup();
	await generateReport(
		baseInput({
			templateId: "t1",
			templates: [{ id: "t1", name: "周报", content: "请生成：{{tasks}}" }],
			extraRequirements: "请用轻松的语气。",
		}),
		deps
	);
	assert.ok(captured.prompt?.includes("请用轻松的语气。"));
});

test("模板未命中：走极简模式（不含模板内容）", async () => {
	const { deps, captured } = setup();
	await generateReport(baseInput({ templateId: "missing", templates: [] }), deps);
	assert.ok(!captured.prompt?.includes("请生成："));
});
