/**
 * 报告生成编排（依赖注入，可单元测试）。
 *
 * 一次调用完成：时间范围折叠 → 模板查找 → 补任务详情 → 拼提示词 → 调模型 → 保存报告。
 * 校验与错误分类都在此完成，返回判别式结果，不抛异常；主窗口只负责把结果映射成 UI。
 */

import type {
	ActiveModelConfig,
	DateRange,
	ReportTemplate,
	ReportType,
	TaskInfo,
} from "../types";
import type { AIClientConfig } from "../ai/client";
import { hydrateTask, type TaskRepository } from "../tasks/repository";
import { buildReportPrompt } from "../core/prompt";
import { getReportRange } from "../core/dates";

export interface GenerateReportInput {
	tasks: TaskInfo[];
	type: ReportType;
	templateId: string;
	templates: ReportTemplate[];
	language: string;
	weekStartsOnMonday: boolean;
	reportFolder: string;
	activeModel: ActiveModelConfig | null;
	temperature: number;
	maxTokens: number;
	timeoutSeconds: number;
}

export interface GenerateReportDeps {
	repository: TaskRepository;
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

export type GenerateReportFailureReason =
	| "no-tasks"
	| "no-model"
	| "missing-credentials"
	| "ai-error"
	| "save-error";

export type GenerateReportResult =
	| { ok: true; path: string }
	| { ok: false; reason: GenerateReportFailureReason; message?: string };

export async function generateReport(
	input: GenerateReportInput,
	deps: GenerateReportDeps
): Promise<GenerateReportResult> {
	if (input.tasks.length === 0) {
		return { ok: false, reason: "no-tasks" };
	}

	const active = input.activeModel;
	if (!active || !active.model) {
		return { ok: false, reason: "no-model" };
	}
	if (!active.baseUrl || !active.apiKey) {
		return { ok: false, reason: "missing-credentials" };
	}

	const range = getReportRange(input.tasks, input.weekStartsOnMonday, deps.now());
	const template = input.templates.find((t) => t.id === input.templateId);

	let content: string;
	try {
		const tasksWithDetails = await Promise.all(
			input.tasks.map((task) => hydrateTask(deps.repository, task))
		);
		const prompt = buildReportPrompt(tasksWithDetails, {
			range,
			type: input.type,
			language: input.language,
			templateContent: template?.content,
		});
		content = await deps.chat(prompt, {
			baseUrl: active.baseUrl,
			apiKey: active.apiKey,
			model: active.model,
			temperature: input.temperature,
			maxTokens: active.maxTokens ?? input.maxTokens,
			timeoutSeconds: input.timeoutSeconds,
		});
	} catch (error) {
		return { ok: false, reason: "ai-error", message: messageOf(error) };
	}

	try {
		const path = await deps.save(input.reportFolder, input.type, range, content, template?.name);
		return { ok: true, path };
	} catch (error) {
		return { ok: false, reason: "save-error", message: messageOf(error) };
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
