/**
 * 报告提示词构造。纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateRange, StatusDefinition, TaskInfo } from "../types";
import { toDateString } from "./dates";
import { filterTasksBySubset } from "./status";

/**
 * 遗留占位符 `{{type}}` 的取值：恒为「报告」。
 *
 * 这是刻意保留的兼容占位符（ADR-0009「保留以兼容」）——旧模板可能引用它，
 * 而占位符替换对未识别名称**原样保留**，删掉取值会让旧模板文字漏进提示词。
 * 产物本就不分周期类型（#55），故它是常量、与任何设置无关。
 *
 * 它与 `core/filename` 里「报告名兜底」的「报告」是同一个词，但**刻意不共享常量**：
 * 这里是一个**冻结**的兼容取值（不会再变），那里是**命名规则**的兜底（可能随命名调整），
 * 两者的变更理由不同，绑在一起反而让改名牵动兼容面。
 */
const v = "报告";

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
	language: string;
	templateContent?: string; // 模板内容（含占位符）；为空则极简模式
	/** 本次生成追加在模板之后的额外指令；按字面拼接，不参与占位符替换。纯空白视为缺省。 */
	extraRequirements?: string;
	/** 生成时刻，用于 {{today}}；缺省用当前时间。 */
	now?: Date;
	/** 状态目录，用于把任务归类为已完成 / 进行中 / 未完成；缺省视为空。 */
	statuses?: readonly StatusDefinition[];
}

/** 占位符书写形式：{{ 名字 }}（名字内部容许空格）。 */
const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

/** 汇总所选任务的总耗时（分钟）。 */
function totalTrackedMinutes(tasks: readonly TaskInfo[]): number {
	return tasks.reduce((sum, task) => sum + computeTrackedMinutes(task), 0);
}

/**
 * 构造占位符 → 文本的取值表；键统一小写，以支持大小写不敏感。
 * 只列出「模型算不准或拿不到」的信息与状态子集，不做纯重述的项目 / 标签汇总。
 */
function buildPlaceholderValues(
	tasks: readonly TaskInfo[],
	options: BuildPromptOptions,
	rangeText: string
): Record<string, string> {
	const { range } = options;
	const statuses = options.statuses ?? [];
	const now = options.now ?? new Date();

	const completed = filterTasksBySubset(tasks, "completed", statuses);
	const inProgress = filterTasksBySubset(tasks, "in-progress", statuses);
	const open = filterTasksBySubset(tasks, "open", statuses);
	const renderTasks = (list: readonly TaskInfo[]) => list.map(formatTaskLine).join("\n");

	return {
		tasks: renderTasks(tasks),
		range: rangeText,
		"range.start": range.start,
		"range.end": range.end,
		type: v,
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
export function buildReportPrompt(tasks: readonly TaskInfo[], options: BuildPromptOptions): string {
	const { range, language, templateContent, extraRequirements } = options;
	const rangeText = `${range.start} 至 ${range.end}`;

	let body: string;
	if (templateContent && templateContent.trim()) {
		body = renderPlaceholders(templateContent, buildPlaceholderValues(tasks, options, rangeText));
	} else {
		// 极简模式：不加多余修饰，仅提供任务数据让模型自由生成
		body = [
			`请根据以下任务数据，生成一份${v}（时间范围：${rangeText}）。`,
			`请客观基于给定数据，使用 Markdown 格式，条理清晰即可。`,
			``,
			`任务数据如下：`,
			tasks.map(formatTaskLine).join("\n"),
		].join("\n");
	}

	// 本次附加要求按字面追加在正文之后、语言行之前；纯空白等同没有该功能
	if (extraRequirements && extraRequirements.trim()) {
		body = `${body}\n\n${extraRequirements}`;
	}

	// 两种模式统一在末尾声明输出语言（模板模式下同样生效）
	return `${body}\n\n输出语言：${language}。`;
}
