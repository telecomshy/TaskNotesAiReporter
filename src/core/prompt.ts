/**
 * 报告提示词构造。纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateRange, ReportType, TaskInfo } from "../types";

const REPORT_TYPE_LABEL: Record<ReportType, string> = {
	week: "周报",
	month: "月报",
	year: "年报",
	custom: "报告",
};

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
		parts.push(`详情：${detail.length > 200 ? detail.slice(0, 200) + "…" : detail}`);
	}
	return parts.join("，");
}

/** 按项目分组任务（供模板按项目归类等场景使用） */
export function groupTasksByProject(tasks: TaskInfo[]): Map<string, TaskInfo[]> {
	const map = new Map<string, TaskInfo[]>();
	for (const task of tasks) {
		if (task.projects && task.projects.length > 0) {
			for (const project of task.projects) {
				if (!map.has(project)) map.set(project, []);
				map.get(project)!.push(task);
			}
		} else {
			if (!map.has("（未归属项目）")) map.set("（未归属项目）", []);
			map.get("（未归属项目）")!.push(task);
		}
	}
	return map;
}

export interface BuildPromptOptions {
	range: DateRange;
	type: ReportType;
	language: string;
	templateContent?: string; // 模板内容（含 {{tasks}} / {{range}} 占位符）；为空则极简模式
}

/**
 * 构造发送给 AI 的完整提示词。
 * - 若提供模板内容：替换 {{tasks}} 与 {{range}} 占位符后作为提示词。
 * - 否则（极简模式）：仅提供任务列表与时间范围，让模型自由生成报告。
 */
export function buildReportPrompt(tasks: TaskInfo[], options: BuildPromptOptions): string {
	const { range, type, language, templateContent } = options;
	const tasksText = tasks.map(formatTaskLine).join("\n");
	const rangeText = `${range.start} 至 ${range.end}`;

	if (templateContent && templateContent.trim()) {
		return templateContent
			.replace(/\{\{tasks\}\}/g, tasksText)
			.replace(/\{\{range\}\}/g, rangeText)
			.replace(/\{\{type\}\}/g, REPORT_TYPE_LABEL[type]);
	}

	// 极简模式：不加多余修饰，仅提供任务数据让模型自由生成
	return [
		`请根据以下任务数据，生成一份${REPORT_TYPE_LABEL[type]}（时间范围：${rangeText}）。`,
		`输出语言：${language}。`,
		`请客观基于给定数据，使用 Markdown 格式，条理清晰即可。`,
		``,
		`任务数据如下：`,
		tasksText,
	].join("\n");
}
