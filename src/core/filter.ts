/**
 * 任务筛选：按日期范围自动筛选，以及「按标题」查询（关键字 / 标签 / 上下文）。
 * 纯函数，无 Obsidian 依赖，可单元测试。
 */

import type { DateField, DateRange, TaskInfo } from "../types";

/**
 * 从任务某个日期字段值中提取标准化的 YYYY-MM-DD。
 * 兼容 "YYYY-MM-DD" 以及 "YYYY-MM-DDTHH:mm:ssZ"（ISO 时间戳）等格式。
 */
export function normalizeDateValue(value: string | undefined): string | null {
	if (!value) return null;
	const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
	return m ? m[1] : null;
}

/** 判断一个日期值是否落在给定闭区间内。 */
function inRange(value: string | undefined, range: DateRange): boolean {
	const dateStr = normalizeDateValue(value);
	if (!dateStr) return false;
	return dateStr >= range.start && dateStr <= range.end;
}

/**
 * 按日期范围自动筛选任务：任一选定的日期字段落在范围内即命中，按 path 去重，排除已归档任务。
 */
export function filterTasksByDateRange(
	tasks: TaskInfo[],
	range: DateRange,
	dateFields: DateField[]
): TaskInfo[] {
	const result: TaskInfo[] = [];
	const seen = new Set<string>();
	for (const task of tasks) {
		if (task.archived) continue;
		const matched = dateFields.some((field) => inRange(task[field] as string | undefined, range));
		if (matched && !seen.has(task.path)) {
			seen.add(task.path);
			result.push(task);
		}
	}
	return result;
}

/**
 * 标题搜索查询：把用户输入拆成关键字 / 标签 / 上下文三类条件。
 * - 裸词 → 标题关键字
 * - #标签 → 标签条件（去 # 前缀）
 * - @上下文 → 上下文条件（去 @ 前缀）
 * 三者用空格区分；大小写不敏感，统一转小写保存。
 */
export interface TitleQuery {
	keywords: string[];
	tags: string[];
	contexts: string[];
}

/** 解析标题搜索输入。 */
export function parseTitleQuery(input: string): TitleQuery {
	const keywords: string[] = [];
	const tags: string[] = [];
	const contexts: string[] = [];
	for (const token of input.trim().split(/\s+/)) {
		if (!token) continue;
		if (token.startsWith("#")) {
			const t = token.slice(1).toLowerCase();
			if (t) tags.push(t);
		} else if (token.startsWith("@")) {
			const c = token.slice(1).toLowerCase();
			if (c) contexts.push(c);
		} else {
			keywords.push(token.toLowerCase());
		}
	}
	return { keywords, tags, contexts };
}

/** 判断标题查询是否为空（关键字、标签、上下文三个维度均无条件）。 */
export function isTitleQueryEmpty(query: TitleQuery): boolean {
	return query.keywords.length === 0 && query.tags.length === 0 && query.contexts.length === 0;
}

/** 标签是否命中查询：支持层级前缀匹配（#work 命中 work 及 work/xxx 子级）。 */
function matchesTag(taskTag: string, queryTag: string): boolean {
	return taskTag === queryTag || taskTag.startsWith(queryTag + "/");
}

/**
 * 按标题搜索查询筛选任务（纯函数）：
 * - 关键字、标签、上下文三个维度之间为 AND，均需满足；
 * - 同一维度内多个条件为 OR（关键字任一命中即可；标签带层级前缀匹配；上下文精确匹配）；
 * - 仅有关键字时退化为标题包含关键字（兼容原行为）。
 */
export function filterTasksByTitleQuery(tasks: TaskInfo[], query: TitleQuery): TaskInfo[] {
	const { keywords, tags, contexts } = query;
	return tasks.filter((task) => {
		if (task.archived) return false;
		if (keywords.length > 0) {
			const title = (task.title ?? "").toLowerCase();
			if (!keywords.some((k) => title.includes(k))) return false;
		}
		if (tags.length > 0) {
			const taskTags = (task.tags ?? []).map((t) => t.toLowerCase());
			const hit = taskTags.some((t) => tags.some((q) => matchesTag(t, q)));
			if (!hit) return false;
		}
		if (contexts.length > 0) {
			const taskCtx = (task.contexts ?? []).map((c) => c.toLowerCase());
			if (!contexts.some((q) => taskCtx.some((c) => c === q))) return false;
		}
		return true;
	});
}
