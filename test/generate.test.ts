import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createGeneration,
	type GenerateDeps,
	type GenerateFailure,
	type GenerateIntent,
	type GenerateResult,
	type GenerateSettings,
} from "../src/report/generate";
import { fakeTaskRepository } from "./fakes/taskRepository";
import { makeTask } from "./fakes/task";
import type { AIClientConfig } from "../src/ai/client";
import type { DateRange } from "../src/types";

function baseSettings(over: Partial<GenerateSettings> = {}): GenerateSettings {
	return {
		language: "中文",
		weekStartsOnMonday: true,
		reportFolder: "TaskNotes/Reports",
		temperature: 0.7,
		maxTokens: 8192,
		timeoutSeconds: 30,
		templates: [],
		...over,
	};
}

/** 模板测试共用的设置查询（含一个 t1 模板），消掉逐字重复的 thunk。 */
function settingsWithTemplate(content = "请生成：{{tasks}}"): () => GenerateSettings {
	return () => baseSettings({ templates: [{ id: "t1", name: "周报", content }] });
}

function baseIntent(over: Partial<GenerateIntent> = {}): GenerateIntent {
	return {
		tasks: [makeTask({ id: "a", title: "A", completedDate: "2026-09-03" })],
		templateId: "",
		...over,
	};
}

interface Captured {
	prompt: string;
	chatConfig: AIClientConfig;
	saved: { folder: string; range: DateRange; content: string; templateName?: string };
}

function setup(
	over: Partial<Omit<GenerateDeps, "settings">> & { settings?: () => GenerateSettings } = {}
): { deps: GenerateDeps; captured: Partial<Captured> } {
	const captured: Partial<Captured> = {};
	const deps: GenerateDeps = {
		repository: fakeTaskRepository({ bodies: { a: "任务正文" } }),
		settings: () => baseSettings(),
		resolveModel: () => ({
			ok: true,
			config: { baseUrl: "https://api.example.com", apiKey: "sk", model: "m" },
		}),
		chat: async (prompt, config) => {
			captured.prompt = prompt;
			captured.chatConfig = config;
			return "生成的报告正文";
		},
		save: async (folder, range, content, templateName) => {
			captured.saved = { folder, range, content, templateName };
			return "TaskNotes/Reports/报告.md";
		},
		now: () => new Date(2026, 8, 3),
		...over,
	};
	return { deps, captured };
}

function failure(result: GenerateResult): GenerateFailure {
	assert.equal(result.ok, false);
	return result as GenerateFailure;
}

test("成功：返回 path，并保存生成的正文", async () => {
	const { deps, captured } = setup();
	const result = await createGeneration(deps)(baseIntent());
	assert.deepEqual(result, { ok: true, path: "TaskNotes/Reports/报告.md" });
	assert.equal(captured.saved?.content, "生成的报告正文");
});

test("无任务 → no-tasks", async () => {
	const { deps } = setup();
	assert.equal(failure(await createGeneration(deps)(baseIntent({ tasks: [] }))).reason, "no-tasks");
});

test("无当前供应商 → no-provider（子原因不塌缩，#51 修订一）", async () => {
	const { deps } = setup({ resolveModel: () => ({ ok: false, reason: "no-provider" }) });
	assert.equal(failure(await createGeneration(deps)(baseIntent())).reason, "no-provider");
});

test("未选模型 → no-model", async () => {
	const { deps } = setup({ resolveModel: () => ({ ok: false, reason: "no-model" }) });
	assert.equal(failure(await createGeneration(deps)(baseIntent())).reason, "no-model");
});

test("缺凭证 → missing-credentials", async () => {
	const { deps } = setup({ resolveModel: () => ({ ok: false, reason: "missing-credentials" }) });
	assert.equal(failure(await createGeneration(deps)(baseIntent())).reason, "missing-credentials");
});

test("模型调用失败 → ai-error 且带原始 error", async () => {
	const { deps } = setup({
		chat: async () => {
			throw new Error("boom");
		},
	});
	const result = failure(await createGeneration(deps)(baseIntent()));
	assert.equal(result.reason, "ai-error");
	assert.ok(result.error instanceof Error);
	assert.equal((result.error as Error).message, "boom");
});

test("保存失败 → save-error", async () => {
	const { deps } = setup({
		save: async () => {
			throw new Error("disk full");
		},
	});
	const result = failure(await createGeneration(deps)(baseIntent()));
	assert.equal(result.reason, "save-error");
	assert.ok(result.error instanceof Error);
});

test("时间范围：取任务最早到最晚", async () => {
	const { deps, captured } = setup();
	await createGeneration(deps)(
		baseIntent({
			tasks: [
				makeTask({ id: "a", completedDate: "2026-09-05" }),
				makeTask({ id: "b", due: "2026-09-01" }),
			],
		})
	);
	assert.deepEqual(captured.saved?.range, { start: "2026-09-01", end: "2026-09-05" });
});

test("时间范围：无日期回退到本周（now 注入）", async () => {
	const { deps, captured } = setup();
	await createGeneration(deps)(baseIntent({ tasks: [makeTask({ id: "a" })] }));
	// now = 2026-09-03（周四），周一为起始 → 2026-08-31 ~ 2026-09-06
	assert.deepEqual(captured.saved?.range, { start: "2026-08-31", end: "2026-09-06" });
});

test("模型参数回退：该模型自带上限优先", async () => {
	const { deps, captured } = setup({
		resolveModel: () => ({
			ok: true,
			config: { baseUrl: "https://x", apiKey: "k", model: "m", maxTokens: 4096 },
		}),
	});
	await createGeneration(deps)(baseIntent());
	assert.equal(captured.chatConfig?.maxTokens, 4096);
});

test("模型参数回退：无自带上限用全局（设置查询）", async () => {
	const { deps, captured } = setup();
	await createGeneration(deps)(baseIntent());
	assert.equal(captured.chatConfig?.maxTokens, 8192);
});

test("装配在 module 内：报告语言与生成参数取自设置查询（#49 修订三）", async () => {
	const { deps, captured } = setup({
		settings: () =>
			baseSettings({
				language: "English",
				temperature: 0.2,
				maxTokens: 1111,
				timeoutSeconds: 7,
			}),
	});
	await createGeneration(deps)(baseIntent());
	assert.ok(captured.prompt?.trimEnd().endsWith("输出语言：English。"));
	assert.equal(captured.chatConfig?.temperature, 0.2);
	assert.equal(captured.chatConfig?.maxTokens, 1111);
	assert.equal(captured.chatConfig?.timeoutSeconds, 7);
});

test("模板名随保存一起交出：与文件名同源（#55）", async () => {
	const { deps, captured } = setup({ settings: settingsWithTemplate() });
	await createGeneration(deps)(baseIntent({ templateId: "t1" }));
	assert.equal(captured.saved?.templateName, "周报");
});

test("重入守卫：进行中重入返回「生成中」，双击只产出一份报告", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let saves = 0;
	const { deps } = setup({
		chat: async () => {
			await gate;
			return "正文";
		},
		save: async () => {
			saves += 1;
			return "p.md";
		},
	});
	const generate = createGeneration(deps);

	const first = generate(baseIntent());
	assert.deepEqual(await generate(baseIntent()), { ok: "generating" }, "进行中重入直接返回「生成中」");
	release();
	assert.equal((await first).ok, true);
	assert.equal(saves, 1, "双击只写一份报告");
});

test("水合：一批补详情回填提示词；缺详情为空串、不中断生成（#48 / #49 修订一）", async () => {
	const { deps, captured } = setup({
		repository: fakeTaskRepository({ bodies: { a: "任务正文" } }),
	});
	const result = await createGeneration(deps)(
		baseIntent({
			tasks: [makeTask({ id: "a", title: "A" }), makeTask({ id: "b", title: "B" })],
		})
	);
	assert.equal(result.ok, true, "缺详情的任务不中断生成");
	assert.ok(captured.prompt?.includes("详情：任务正文"));
	assert.ok(captured.prompt?.includes("标题：B"));
	assert.ok(!captured.prompt?.includes("undefined"));
});

test("占位符：入口把状态目录与 now 传给提示词", async () => {
	const { deps, captured } = setup({
		repository: fakeTaskRepository({
			bodies: {},
			statuses: [{ value: "done", statusClass: "completed" }],
		}),
		settings: settingsWithTemplate("{{completedTasks}}\n{{today}}"),
	});
	await createGeneration(deps)(
		baseIntent({
			tasks: [
				makeTask({ id: "a", title: "A", status: "done" }),
				makeTask({ id: "b", title: "B", status: "open" }),
			],
			templateId: "t1",
		})
	);
	assert.ok(captured.prompt?.includes("标题：A"));
	assert.ok(!captured.prompt?.includes("标题：B"));
	assert.ok(captured.prompt?.includes("2026-09-03"));
});

test("模板命中与未命中：命中含模板内容，未命中走极简模式", async () => {
	const hit = setup({ settings: settingsWithTemplate() });
	await createGeneration(hit.deps)(baseIntent({ templateId: "t1" }));
	assert.ok(hit.captured.prompt?.includes("请生成："));

	const miss = setup({ settings: settingsWithTemplate() });
	await createGeneration(miss.deps)(baseIntent({ templateId: "missing" }));
	assert.ok(!miss.captured.prompt?.includes("请生成："));
});

test("附加要求：透传到被捕获的提示词", async () => {
	const { deps, captured } = setup({ settings: settingsWithTemplate() });
	await createGeneration(deps)(baseIntent({ templateId: "t1", extraRequirements: "请用轻松的语气。" }));
	assert.ok(captured.prompt?.includes("请用轻松的语气。"));
});
