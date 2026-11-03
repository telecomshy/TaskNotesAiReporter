/**
 * diagnosing-bugs Phase 1 计时回路（throwaway，Phase 6 清理）。
 *
 * 症状：生成周报耗时长 → 回路按环节计时生成管线，归因「时间花在哪」。
 * 插件侧环节（水合 / 组提示词）确定性实测；模型环节 --live 实测（密钥只走环境变量，绝不打印）。
 *
 * 用法：
 *   node --import tsx scripts/perf-loop.ts                 # 插件侧分环节计时（确定性）
 *   node --import tsx scripts/perf-loop.ts --live          # 追加真实模型调用计时
 * 旋钮：--tasks N（默认 30） --detail BYTES（默认 800） --iters N（默认 20）
 *       --budget MS（插件侧总预算，默认 300） --data PATH（data.json，默认取本机 vault）
 * 环境：PERF_API_KEY（--live 必需） PERF_BASE_URL（默认 https://api.deepseek.com）
 *       PERF_MODEL（默认 deepseek-flash）
 */
import { readFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createGeneration, type GenerateDeps } from "../src/report/generate";
import { hydrateTasks } from "../src/tasks/repository";
import { buildReportPrompt } from "../src/core/prompt";
import { getReportRange } from "../src/core/dates";
import { buildChatCompletionsUrl } from "../src/core/aiUrl";
import { fakeTaskRepository } from "../test/fakes/taskRepository";
import { makeTask } from "../test/fakes/task";
import type { TaskInfo } from "../src/types";

// ===== 参数 =====
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const live = args.includes("--live");
const taskCount = Number(flag("--tasks") ?? 30);
const detailBytes = Number(flag("--detail") ?? 800);
const iters = Number(flag("--iters") ?? 20);
const budgetMs = Number(flag("--budget") ?? 300);
const dataPath =
	flag("--data") ?? "D:\\study\\我的笔记\\.obsidian\\plugins\\tasknotes-aireporter\\data.json";

// ===== 设置（绝不打印密钥；data.json 只存密钥名，密钥在 SecretStorage） =====
let language = "中文";
let templateContent = "写一份周报：\n{{tasks}}";
let temperature = 0.7;
let maxTokens = 8192;
let timeoutSeconds = 60;
let baseUrl = process.env.PERF_BASE_URL ?? "https://api.deepseek.com";
let model = process.env.PERF_MODEL ?? "deepseek-flash";
if (existsSync(dataPath)) {
	const data = JSON.parse(readFileSync(dataPath, "utf8"));
	language = data.language ?? language;
	const tpl = (data.templates ?? []).find((t: { id: string }) => t.id === data.selectedTemplateId);
	if (tpl?.content) templateContent = tpl.content;
	temperature = data.temperature ?? temperature;
	maxTokens = data.maxTokens ?? maxTokens;
	timeoutSeconds = data.timeoutSeconds ?? timeoutSeconds;
	const provider = (data.providers ?? []).find(
		(p: { id: string }) => p.id === data.activeProviderId
	);
	if (provider?.baseUrl && !process.env.PERF_BASE_URL) baseUrl = provider.baseUrl;
	model = process.env.PERF_MODEL ?? data.activeModel ?? model;
}
console.log(`配置：model=${model} maxTokens=${maxTokens} temperature=${temperature}（密钥 <REDACTED>）`);

// ===== 夹具：确定性任务 + 详情正文 =====
const filler = "这是一段用于模拟任务详情正文的示例文字，包含背景、进展与结论等信息。".repeat(
	Math.ceil(detailBytes / 32)
);
const tasks: TaskInfo[] = Array.from({ length: taskCount }, (_, i) =>
	makeTask({
		id: `task-${i}`,
		title: `周报任务 ${i}：推进某项工作并跟进结果`,
		status: i % 3 === 0 ? "done" : i % 3 === 1 ? "in-progress" : "open",
		due: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
		tags: ["工作", `模块${i % 5}`],
		contexts: ["办公"],
	})
);
const bodies: Record<string, string> = Object.fromEntries(
	tasks.map((t) => [t.id, filler.slice(0, detailBytes)])
);
const repo = fakeTaskRepository({ tasks, bodies });
const now = new Date("2026-03-27T10:00:00");

// ===== 分环节计时 =====
async function runStages(): Promise<{ hydrate: number; prompt: number; total: number; promptChars: number }> {
	const t0 = performance.now();
	const hydrated = await hydrateTasks(repo, tasks);
	await repo.statuses();
	const t1 = performance.now();
	const prompt = buildReportPrompt(hydrated, {
		range: getReportRange(tasks, true, now),
		language,
		templateContent,
		now,
		statuses: [],
	});
	const t2 = performance.now();
	return { hydrate: t1 - t0, prompt: t2 - t1, total: t2 - t0, promptChars: prompt.length };
}

const rows: Awaited<ReturnType<typeof runStages>>[] = [];

async function main(): Promise<void> {
	for (let i = 0; i < iters; i++) rows.push(await runStages());
	const stat = (pick: (r: (typeof rows)[number]) => number): number => {
		const xs = rows.map(pick).sort((a, b) => a - b);
		return xs[Math.floor(xs.length / 2)];
	};
	const hydrateMs = stat((r) => r.hydrate);
	const promptMs = stat((r) => r.prompt);
	const totalMs = stat((r) => r.total);
	const promptChars = rows[0].promptChars;

	console.log(`\n夹具：${taskCount} 任务 × ${detailBytes}B 详情 · 中位数/${iters} 轮`);
	console.log(`  hydrateTasks（含 statuses）：${hydrateMs.toFixed(1)} ms`);
	console.log(`  buildReportPrompt：         ${promptMs.toFixed(1)} ms`);
	console.log(`  插件侧合计：                ${totalMs.toFixed(1)} ms（预算 ${budgetMs} ms）`);
	console.log(`  提示词规模：${promptChars} 字符`);

	const pluginRed = totalMs > budgetMs;
	console.log(pluginRed ? `\n[RED] 插件侧超出预算` : `\n[GREEN] 插件侧在预算内`);

	// ===== 端到端（注入依赖走真实 createGeneration，chat/save 为桩）=====
	const deps: GenerateDeps = {
		repository: repo,
		settings: () => ({
			language,
			weekStartsOnMonday: true,
			reportFolder: "TaskNotes/Reports",
			temperature,
			maxTokens,
			timeoutSeconds,
			templates: [{ id: "tpl", name: "周报", content: templateContent }],
		}),
		resolveModel: () => ({
			ok: true,
			config: { baseUrl, apiKey: "", model, temperature, maxTokens, timeoutSeconds },
		}),
		chat: async () => "（桩）",
		save: async () => "stub.md",
		now: () => now,
	};
	const gen = createGeneration(deps);
	const e2eStart = performance.now();
	await gen({ tasks, templateId: "tpl" });
	console.log(`  createGeneration 全程（桩 chat/save）：${(performance.now() - e2eStart).toFixed(1)} ms`);

	// ===== --live：真实模型调用计时 + 假设探测（密钥只从环境变量取）=====
	if (live) {
		const apiKey = process.env.PERF_API_KEY;
		if (!apiKey) {
			console.log("\n[LIVE 跳过] 未设 PERF_API_KEY（请自行 setx PERF_API_KEY，勿贴进对话）。");
			process.exit(pluginRed ? 1 : 0);
		}
		interface LiveResult {
			label: string;
			ms: number;
			chars: number;
			reasonChars: number;
			promptTokens: number;
			completionTokens: number;
			reasoningTokens: number;
		}
		async function timed(label: string, prompt: string, extra?: Record<string, unknown>): Promise<LiveResult> {
			const t = performance.now();
			// 与 src/ai/client 同款载荷；Node 侧走 fetch（Obsidian 内是 requestUrl），网络计时等价。
			const res = await fetch(buildChatCompletionsUrl(baseUrl), {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
				body: JSON.stringify({
					model,
					messages: [{ role: "user", content: prompt }],
					temperature,
					max_tokens: maxTokens,
					stream: false,
					...extra,
				}),
				signal: AbortSignal.timeout(timeoutSeconds * 1000),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
			const data = (await res.json()) as {
				choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
				usage?: {
					prompt_tokens?: number;
					completion_tokens?: number;
					completion_tokens_details?: { reasoning_tokens?: number };
				};
			};
			const msg = data.choices?.[0]?.message ?? {};
			const usage = data.usage ?? {};
			return {
				label,
				ms: performance.now() - t,
				chars: (msg.content ?? "").length,
				reasonChars: (msg.reasoning_content ?? "").length,
				promptTokens: usage.prompt_tokens ?? -1,
				completionTokens: usage.completion_tokens ?? -1,
				reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? -1,
			};
		}

		const promptFor = (subset: TaskInfo[], bodiesFor: Record<string, string>): string => {
			const hydrated = subset.map((t) => ({ ...t, details: bodiesFor[t.id] ?? "" }));
			return buildReportPrompt(hydrated, {
				range: getReportRange(subset, true, now),
				language,
				templateContent,
				now,
				statuses: [],
			});
		};

		const half = tasks.slice(0, Math.ceil(taskCount / 2));
		const tiny = tasks.slice(0, 1);
		const probes: Array<[string, string]> = [
			[`baseline ${taskCount} 任务`, promptFor(tasks, bodies)],
			[`半量输入 ${half.length} 任务`, promptFor(half, bodies)],
			[`极小输入 1 任务`, promptFor(tiny, bodies)],
			[`baseline 复测（方差）`, promptFor(tasks, bodies)],
		];
		console.log(`\n[LIVE] <REDACTED> · ${model} · 超时 ${timeoutSeconds}s`);
		const results: LiveResult[] = [];
		for (const [label, prompt] of probes) {
			const r = await timed(label, prompt);
			results.push(r);
			console.log(
				`  ${r.label}：${r.ms.toFixed(0)} ms · 输出 ${r.chars} 字符 · 推理痕迹 ${r.reasonChars} 字符 · tokens 入 ${r.promptTokens} / 出 ${r.completionTokens}（含推理 ${r.reasoningTokens}）`
			);
		}
		const worst = Math.max(...results.map((r) => r.ms));
		if (worst > budgetMs) console.log("[RED] 模型环节超出预算");

		// ===== --probe-thinking：一参一探，找"关思考"的旋钮 =====
		if (args.includes("--probe-thinking")) {
			const knobs: Array<[string, Record<string, unknown>]> = [
				['reasoning_effort:"none"', { reasoning_effort: "none" }],
				["enable_thinking:false", { enable_thinking: false }],
				['thinking:{type:"disabled"}', { thinking: { type: "disabled" } }],
				["reasoning:{enabled:false}", { reasoning: { enabled: false } }],
			];
			console.log("\n[PROBE] 关思考旋钮逐个试（baseline 对照见上）：");
			for (const [label, extra] of knobs) {
				try {
					const r = await timed(label, promptFor(tasks, bodies), extra);
					console.log(
						`  ${r.label}：${r.ms.toFixed(0)} ms · 推理 ${r.reasoningTokens} tok · 输出 ${r.chars} 字符 → ${r.reasoningTokens === 0 ? "✅ 思考已关" : "❌ 无效或未关"}`
					);
				} catch (e) {
					console.log(`  ${label}：参数不被接受（${(e as Error).message.slice(0, 80)}）`);
				}
			}
		}
	}

	process.exit(pluginRed ? 1 : 0);
}

void main();
