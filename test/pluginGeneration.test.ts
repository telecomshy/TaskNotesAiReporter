/**
 * 「生成」装配工厂（#101）：`createPluginGeneration` 的接缝测试。
 * 只测装配本身：7 字段投影、chat / save 缺省包装与绑定、resolveActive 失败上浮。
 * 生成流程细节归 generate.test.ts（22 test 不动）；ReportModal 本体不加 DOM 测试（#101 裁决）。
 *
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --experimental-test-module-mocks --test test/pluginGeneration.test.ts
 */

import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import type { SettingsSnapshot } from "../src/settings/owner";
import type { ActiveModelResolution, DateRange } from "../src/types";
import type { AIClientConfig } from "../src/ai/client";
import type { PluginGenerationDeps } from "../src/report/pluginGeneration";
import { makeTask } from "./fakes/task";
import { fakeTaskRepository } from "./fakes/taskRepository";

// ===== 模块缝：先 mock transport（chat 缺省包装）与 writer（save 缺省绑定）再动态 import =====

const transportPath = new URL("../src/ai/transport.ts", import.meta.url).href;
const writerPath = new URL("../src/report/writer.ts", import.meta.url).href;
type PluginGenerationModule = typeof import("../src/report/pluginGeneration");
let createPluginGeneration: PluginGenerationModule["createPluginGeneration"];

interface CapturedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}
let capturedRequests: CapturedRequest[] = [];
let respond: (req: CapturedRequest) => unknown;

/** 缺省 save 的绑定捕获（writer 模块缝）。 */
let savedBinding: {
	app: unknown;
	folder: string;
	range: DateRange;
	content: string;
	templateName?: string;
} | null = null;
let saveResult = "Reports/绑定/报告.md";

before(async () => {
	mock.module(transportPath, {
		defaultExport: {
			requestUrlTransport: async (req: CapturedRequest) => {
				capturedRequests.push(req);
				const body: any = respond(req) ?? {};
				return {
					status: (body?.status as number) ?? 200,
					json: body?.json ?? {},
					text: typeof body?.text === "string" ? body.text : "",
				};
			},
		},
	});
	mock.module(writerPath, {
		namedExports: {
			saveReport: async (app: unknown, folder: string, range: DateRange, content: string, templateName?: string) => {
				savedBinding = { app, folder, range, content, templateName };
				return saveResult;
			},
		},
	});
	createPluginGeneration = (await import("../src/report/pluginGeneration")).createPluginGeneration;
});

beforeEach(() => {
	capturedRequests = [];
	respond = () => ({});
	saveResult = "Reports/绑定/报告.md";
	savedBinding = null;
});

// ===== 假件：设置快照切片 + resolveActive 桩 + chat / save 缝 =====

/** 全字段假快照（SettingsSnapshot 形状）；生成相关 7 字段用可辨识值，其余占位。 */
function fakeSnapshot(over: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
	return {
		providers: [],
		activeProviderId: "p",
		activeModel: "m",
		temperature: 0.7,
		maxTokens: 8192,
		timeoutSeconds: 60,
		reportFolder: "Reports/Factory",
		dateFields: [],
		weekStartsOnMonday: true,
		language: "中文",
		uiLanguage: "zh",
		templates: [],
		selectedTemplateId: "",
		...over,
	};
}

/** resolveActive 成功桩（形状照 generate.test.ts 的 setup）。 */
function resolveOk(): ActiveModelResolution {
	return {
		ok: true,
		providerId: "p",
		config: {
			baseUrl: "https://api.example.com",
			apiKey: "sk",
			model: "m",
			thinking: { setting: "off", param: null, note: "unknown", learned: null },
		},
	};
}

interface Captured {
	prompt: string;
	chatConfig: AIClientConfig;
	saved: { folder: string; range: DateRange; content: string; templateName?: string };
}

function setup(
	over: Partial<PluginGenerationDeps> & { snapshot?: Partial<SettingsSnapshot> } = {}
): { deps: PluginGenerationDeps; captured: Partial<Captured> } {
	const { snapshot, ...depsOver } = over;
	const captured: Partial<Captured> = {};
	const deps: PluginGenerationDeps = {
		app: {} as App,
		settings: () => fakeSnapshot(snapshot),
		providers: { resolveActive: () => resolveOk() },
		repository: fakeTaskRepository({ bodies: { a: "任务详情" } }),
		chat: async (prompt, config) => {
			captured.prompt = prompt;
			captured.chatConfig = config;
			return { content: "生成的报告正文", hasReasoning: false };
		},
		save: async (folder, range, content, templateName) => {
			captured.saved = { folder, range, content, templateName };
			return "Reports/Factory/报告.md";
		},
		// 显式传 undefined 的缝＝走缺省包装 / 缺省绑定（测试 2 / 3）
		...depsOver,
	};
	return { deps, captured };
}

function baseIntent(templateId = ""): { tasks: ReturnType<typeof makeTask>[]; templateId: string } {
	return { tasks: [makeTask({ id: "a", completedDate: "2026-09-03" })], templateId };
}

// ===== 测试（#101 测试政策） =====

test("投影字段流：生成参数进入 chat config，报告目录与周起始进入 save", async () => {
	const run = async (weekStartsOnMonday: boolean): Promise<Partial<Captured>> => {
		const { deps, captured } = setup({
			now: () => new Date(2026, 8, 3),
			snapshot: {
				language: "English",
				weekStartsOnMonday,
				temperature: 0.2,
				maxTokens: 1111,
				timeoutSeconds: 7,
				reportFolder: "Reports/X",
			},
		});
		const result = await createPluginGeneration(deps)({
			tasks: [makeTask({ id: "a" })],
			templateId: "",
		});
		assert.equal(result.ok, true);
		return captured;
	};
	const withMonday = await run(true);
	const withSunday = await run(false);
	// 报告语言：投影后由 module 拼进提示词（与 generate.test.ts 的断言同源）
	assert.ok(withMonday.prompt?.trimEnd().endsWith("输出语言：English。"));
	assert.equal(withMonday.chatConfig?.temperature, 0.2);
	assert.equal(withMonday.chatConfig?.maxTokens, 1111);
	assert.equal(withMonday.chatConfig?.timeoutSeconds, 7);
	assert.equal(withMonday.saved?.folder, "Reports/X");
	// 周起始：投影值真的流入——无日期任务回退本周（字面量照 generate.test.ts 的工作示例）
	assert.deepEqual(withMonday.saved?.range, { start: "2026-08-31", end: "2026-09-06" });
	assert.deepEqual(withSunday.saved?.range, { start: "2026-08-30", end: "2026-09-05" });
});

test("chat 缺省包装：恰一条 user 消息，正文即生成提示词", async () => {
	respond = () => ({ json: { choices: [{ message: { content: "缺省正文" } }] } });
	const { deps, captured } = setup({ chat: undefined });
	const result = await createPluginGeneration(deps)(baseIntent());
	assert.equal(result.ok, true);
	assert.equal(captured.saved?.content, "缺省正文");
	const req = capturedRequests[0];
	assert.ok(req?.body, "缺省 chat 应走真实传输（被 mock 的 transport 捕获）");
	const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: string }> };
	assert.equal(body.messages.length, 1);
	assert.equal(body.messages[0].role, "user");
	assert.ok(body.messages[0].content.includes("输出语言：中文。"));
});

test("save 缺省绑定：绑定工厂收到的 app，folder / range / content / templateName 逐一交出", async () => {
	saveResult = "Reports/绑定/报告.md";
	const { deps, captured } = setup({
		snapshot: { templates: [{ id: "t1", name: "周报", content: "请生成：{{tasks}}" }] },
		save: undefined,
	});
	const result = await createPluginGeneration(deps)(baseIntent("t1"));
	assert.deepEqual(result, { ok: true, path: "Reports/绑定/报告.md", fakeOff: false });
	assert.ok(savedBinding, "缺省 save 应落到（被 mock 的）writer");
	assert.equal(savedBinding.app, deps.app);
	assert.equal(savedBinding.folder, "Reports/Factory");
	assert.deepEqual(savedBinding.range, { start: "2026-09-03", end: "2026-09-03" });
	assert.equal(savedBinding.content, "生成的报告正文");
	assert.equal(savedBinding.templateName, "周报");
	assert.equal(captured.saved, undefined);
});

test("resolveActive 失败原样上浮（不塌缩；细节归 generate.test）", async () => {
	const { deps } = setup({
		providers: { resolveActive: () => ({ ok: false, reason: "no-model" }) },
	});
	const result = await createPluginGeneration(deps)(baseIntent());
	assert.deepEqual(result, { ok: false, reason: "no-model" });
});
