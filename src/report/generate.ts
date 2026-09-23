/**
 * 「生成」深 module（#49）：一次生成一个入口。
 *
 * 入口收**用户意图**（已加入 任务集合 + 所选 报告模板 + 报告类型 + 附加要求，#49 修订四）
 * 与**注入依赖**（设置查询、当前模型 解析、chat / save、时间源）；输入校验、报告语言与
 * 生成参数的读取、任务水合（按 #48 批补）、提示词组装、调模型、写入都在 module 内——
 * 界面只收集输入与反馈，不拼参数。
 *
 * 失败归因是单一判别式结果（#51）：四类六值，当前模型 的子原因不塌缩；由一个描述器消费。
 * 一次生成 一份、不可取消；进行中重入直接返回「生成中」，不排队。
 */

import type {
	ActiveModelResolution,
	DateRange,
	ReportTemplate,
	ReportType,
	TaskInfo,
} from "../types";
import type { AIClientConfig } from "../ai/client";
import { hydrateTasks, type TaskRepository } from "../tasks/repository";
import { buildReportPrompt } from "../core/prompt";
import { getReportRange } from "../core/dates";

/** 用户意图：界面只收集这四样（#49 修订四：三样 + 报告类型）。 */
export interface GenerateIntent {
	/** 已加入 的任务集合（即 报告任务集合）。 */
	tasks: readonly TaskInfo[];
	/** 所选 报告模板 id（空串 = 不选模板，极简模式）。 */
	templateId: string;
	/** 报告类型：用户在界面选定，是本次生成的意图而非持久化设置。 */
	reportType: ReportType;
	/** 附加要求；纯空白视为缺省。 */
	extraRequirements?: string;
}

/** 设置查询的形状（仅持久化设置）：报告语言与生成参数在生成时读取（#49 修订三）。 */
export interface GenerateSettings {
	language: string;
	weekStartsOnMonday: boolean;
	reportFolder: string;
	temperature: number;
	maxTokens: number;
	timeoutSeconds: number;
	templates: readonly ReportTemplate[];
}

/** 注入依赖（装配层接线）。 */
export interface GenerateDeps {
	/** 界面打开时已打开的仓库；生成期间沿用它，不重判 来源缺失（#45 / #49 修订一）。 */
	repository: TaskRepository;
	/** 设置查询。 */
	settings(): GenerateSettings;
	/** 供应商模块对当前模型 的解析结果（ADR-0010）。 */
	resolveModel(): ActiveModelResolution;
	/** 调用模型，返回生成正文。 */
	chat(prompt: string, config: AIClientConfig): Promise<string>;
	/** 保存报告，返回最终文件路径。 */
	save(
		folder: string,
		type: ReportType,
		range: DateRange,
		content: string,
		templateName?: string
	): Promise<string>;
	/** 当前时间（注入以便测试范围兜底）。 */
	now(): Date;
}

/** 失败原因：四类六值；当前模型 解析失败的子原因不塌缩（#51 修订一）。 */
export type GenerateFailureReason =
	| "no-tasks"
	| "no-provider"
	| "no-model"
	| "missing-credentials"
	| "ai-error"
	| "save-error";

export type GenerateResult =
	| { ok: true; path: string }
	| { ok: "generating" }
	| { ok: false; reason: GenerateFailureReason; error?: unknown };

/** 生成失败结果（判别式失败分支）。 */
export type GenerateFailure = Extract<GenerateResult, { ok: false }>;

/**
 * 一次生成 一个入口（#49）：进行中重入直接返回「生成中」，不排队——双击只产出一份 报告。
 * 重入守卫状态由本入口自持；装配层建一次、界面重复调用同一个入口。
 */
export function createGeneration(
	deps: GenerateDeps
): (intent: GenerateIntent) => Promise<GenerateResult> {
	let running = false;
	return async (intent) => {
		if (running) return { ok: "generating" };
		running = true;
		try {
			return await runGeneration(intent, deps);
		} finally {
			running = false;
		}
	};
}

async function runGeneration(intent: GenerateIntent, deps: GenerateDeps): Promise<GenerateResult> {
	if (intent.tasks.length === 0) {
		return { ok: false, reason: "no-tasks" };
	}

	const active = deps.resolveModel();
	if (!active.ok) {
		// 子原因原样交出（不塌缩）；描述器仍把 no-provider 与 no-model 渲染成同一句（#51 修订二）。
		return { ok: false, reason: active.reason };
	}
	const config = active.config;

	// 报告语言与生成参数在 module 内从设置查询读取——界面不拼参数（#49 修订三）。
	const s = deps.settings();
	const now = deps.now();
	const range = getReportRange(intent.tasks, s.weekStartsOnMonday, now);
	const template = s.templates.find((t) => t.id === intent.templateId);

	let content: string;
	try {
		// 任务水合：按 #48 一批补 详情；缺详情为空串、不中断生成，不重判 来源缺失（#49 修订一）。
		const tasksWithDetails = await hydrateTasks(deps.repository, intent.tasks);
		const statuses = await deps.repository.statuses();
		const prompt = buildReportPrompt(tasksWithDetails, {
			range,
			type: intent.reportType,
			language: s.language,
			templateContent: template?.content,
			extraRequirements: intent.extraRequirements,
			now,
			statuses,
		});
		content = await deps.chat(prompt, {
			baseUrl: config.baseUrl,
			apiKey: config.apiKey,
			model: config.model,
			temperature: s.temperature,
			maxTokens: config.maxTokens ?? s.maxTokens,
			timeoutSeconds: s.timeoutSeconds,
		});
	} catch (error) {
		return { ok: false, reason: "ai-error", error };
	}

	try {
		const path = await deps.save(s.reportFolder, intent.reportType, range, content, template?.name);
		return { ok: true, path };
	} catch (error) {
		return { ok: false, reason: "save-error", error };
	}
}
