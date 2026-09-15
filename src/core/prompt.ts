/**
 * 报告提示词构造。纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateRange, ReportType, StatusDefinition, TaskInfo } from "../types";
import { REPORT_TYPE_LABEL } from "./reportType";
import { toDateString } from "./dates";
import { filterTasksBySubset } from "./status";

/** 将耗时分钟数格式化为可读文本 */
function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}分钟`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m === 0 ? `${h}小时` : `${h}小时${m}分钟`;
}

/** 计算任务的总耗时（分钟），优先用 totalTrackedTime，否则从 timeEntries 累加 */
function computeTrackedMinutes(task: TaskInfo): number {
	if (typeof task.totalTrackedTime === "number") return task.totalTrackedTime;
	if (!task.timeEntries || task.timeEntries.length === 0) return 0;
	let total = 0;
	for (const entry of task.timeEntries) {
		if (entry.duration) {
			total += entry.duration;
		} else if (entry.startTime && entry.endTime) {
			const s = new Date(entry.startTime).getTime();
			const e = new Date(entry.endTime).getTime();
			if (!isNaN(s) && !isNaN(e) && e >= s) total += Math.round((e - s) / 60000);
		}
	}
	return total;
}

/** 将单个任务格式化为给 AI 看的文本行 */
export function formatTaskLine(task: TaskInfo): string {
	const parts: string[] = [];
	parts.push(`- 标题：${task.title}`);
	parts.push(`  状态：${task.status}`);
	if (task.priority) parts.push(`优先级：${task.priority}`);
	if (task.completedDate) parts.push(`完成日期：${task.completedDate}`);
	if (task.due) parts.push(`到期日：${task.due}`);
	if (task.scheduled) parts.push(`计划日期：${task.scheduled}`);
	if (task.projects && task.projects.length > 0) parts.push(`项目：${task.projects.join(", ")}`);
	if (task.tags && task.tags.length > 0) parts.push(`标签：${task.tags.join(", ")}`);
	const minutes = computeTrackedMinutes(task);
	if (minutes > 0) parts.push(`耗时：${formatMinutes(minutes)}`);
	if (task.details && task.details.trim()) {
		const detail = task.details.trim().replace(/\s+/g, " ");
		parts.push(`详情：${detail}`);
	}
	return parts.join("，");
}

export interface BuildPromptOptions {
	range: DateRange;
	type: ReportType;
	language: string;
	templateContent?: string; // 模板内容（含占位符）；为空则极简模式
	/** 生成时刻，用于 {{today}}；缺省用当前时间。 */
	now?: Date;
	/** 状态目录，用于把任务归类为已完成 / 进行中 / 未完成；缺省视为空。 */
	statuses?: StatusDefinition[];
}

/** 占位符书写形式：{{ 名字 }}（名字内部容许空格）。 */
const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

/** 汇总所选任务的总耗时（分钟）。 */
function totalTrackedMinutes(tasks: TaskInfo[]): number {
	return tasks.reduce((sum, task) => sum + computeTrackedMinutes(task), 0);
}

/**
 * 构造占位符 → 文本的取值表；键统一小写，以支持大小写不敏感。
 * 只列出「模型算不准或拿不到」的信息与状态子集，不做纯重述的项目 / 标签汇总。
 */
function buildPlaceholderValues(
	tasks: TaskInfo[],
	options: BuildPromptOptions,
	rangeText: string
): Record<string, string> {
	const { range, type } = options;
	const statuses = options.statuses ?? [];
	const now = options.now ?? new Date();

	const completed = filterTasksBySubset(tasks, "completed", statuses);
	const inProgress = filterTasksBySubset(tasks, "in-progress", statuses);
	const open = filterTasksBySubset(tasks, "open", statuses);
	const renderTasks = (list: TaskInfo[]) => list.map(formatTaskLine).join("\n");

	return {
		tasks: renderTasks(tasks),
		range: rangeText,
		"range.start": range.start,
		"range.end": range.end,
		type: REPORT_TYPE_LABEL[type],
		today: toDateString(now),
		count: String(tasks.length),
		totaltrackedtime: formatMinutes(totalTrackedMinutes(tasks)),
		completedtasks: renderTasks(completed),
		inprogresstasks: renderTasks(inProgress),
		opentasks: renderTasks(open),
		completedcount: String(completed.length),
		inprogresscount: String(inProgress.length),
		opencount: String(open.length),
	};
}

/** 扁平替换占位符：名字大小写不敏感、容许内部空格；未知占位符原样保留。 */
function renderPlaceholders(template: string, values: Record<string, string>): string {
	return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
		const key = name.trim().toLowerCase();
		return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
	});
}

/**
 * 构造发送给 AI 的完整提示词。
 * - 若提供模板内容：替换占位符后作为提示词。
 * - 否则（极简模式）：仅提供任务列表与时间范围，让模型自由生成报告。
 */
export function buildReportPrompt(tasks: TaskInfo[], options: BuildPromptOptions): string {
	const { range, type, language, templateContent } = options;
	const rangeText = `${range.start} 至 ${range.end}`;

	let body: string;
	if (templateContent && templateContent.trim()) {
		body = renderPlaceholders(templateContent, buildPlaceholderValues(tasks, options, rangeText));
	} else {
		// 极简模式：不加多余修饰，仅提供任务数据让模型自由生成
		body = [
			`请根据以下任务数据，生成一份${REPORT_TYPE_LABEL[type]}（时间范围：${rangeText}）。`,
			`请客观基于给定数据，使用 Markdown 格式，条理清晰即可。`,
			``,
			`任务数据如下：`,
			tasks.map(formatTaskLine).join("\n"),
		].join("\n");
	}

	// 两种模式统一在末尾声明输出语言（模板模式下同样生效）
	return `${body}\n\n输出语言：${language}。`;
}
