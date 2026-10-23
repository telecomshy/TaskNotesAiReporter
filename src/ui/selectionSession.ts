/**
 * 「选择任务」会话：筛选结果与报告集合的唯一真源。
 *
 * 左栏是当前筛选命中、且尚未「已加入」的「可加入」任务；右栏是报告集合。
 * 筛选（切 Tab / 改区间 / 改查询）只改变左栏呈现，绝不修改报告集合。
 * 加入、加入全部可见、移除、清空是仅有的集合转移。
 * 无 DOM、无 obsidian，可在 Node 单元测试。
 */

import {
	filterTasksByDateRange,
	filterTasksByTitleQuery,
	parseTitleQuery,
	type TitleQuery,
} from "../core/filter";
import type { DateField, DateRange, TaskInfo } from "../types";

export type SelectionTab = "time" | "title";

/** 左栏为空的原因：未选区间 / 无命中 / 命中项都已加入。 */
export type LeftEmptyReason = "no-range" | "no-match" | "all-joined" | null;

/**
 * 会话状态。`tasks` / `dateFields` 是打开弹窗时注入、生命周期内恒定的输入。
 * `joined` 保持加入顺序，供右栏与生成共用。
 */
export interface SelectionSession {
	tasks: TaskInfo[];
	joined: Map<string, TaskInfo>;
	tab: SelectionTab;
	range: DateRange | null;
	query: string;
	dateFields: readonly DateField[];
}

/** 构造初始会话：时间页、无区间、空查询、报告集合为空。 */
export function createSelectionSession(
	tasks: TaskInfo[],
	dateFields: readonly DateField[]
): SelectionSession {
	return {
		tasks: [...tasks],
		joined: new Map(),
		tab: "time",
		range: null,
		query: "",
		dateFields,
	};
}

// ===== 选择器 =====

/** 右栏：报告集合，按加入顺序。 */
export function joinedTasks(session: SelectionSession): TaskInfo[] {
	return Array.from(session.joined.values());
}

export function joinedCount(session: SelectionSession): number {
	return session.joined.size;
}

export function isJoined(session: SelectionSession, id: string): boolean {
	return session.joined.has(id);
}

/** 当前筛选命中的全部任务（含已加入）。 */
export function matchingTasks(session: SelectionSession): TaskInfo[] {
	if (session.tab === "time") {
		return session.range
			? filterTasksByDateRange(session.tasks, session.range, session.dateFields)
			: [];
	}
	return filterTasksByTitleQuery(session.tasks, parsedQuery(session));
}

/** 左栏：命中且尚未加入。 */
export function addableTasks(session: SelectionSession): TaskInfo[] {
	return matchingTasks(session).filter((task) => !session.joined.has(task.id));
}

/** 左栏空态原因；有可加入任务时返回 null。 */
export function leftEmptyReason(session: SelectionSession): LeftEmptyReason {
	if (session.tab === "time" && session.range === null) return "no-range";
	if (matchingTasks(session).length === 0) return "no-match";
	return addableTasks(session).length === 0 ? "all-joined" : null;
}

/** 标题查询的解析结果（关键字 / 标签 / 上下文）。 */
export function parsedQuery(session: SelectionSession): TitleQuery {
	return parseTitleQuery(session.query);
}

// ===== 具名转移 =====

/** 切换 Tab：只改呈现，不改变报告集合。 */
export function switchTab(session: SelectionSession, tab: SelectionTab): SelectionSession {
	return { ...session, tab };
}

/** 改筛选区间：只改呈现，不改变报告集合。 */
export function setRange(session: SelectionSession, range: DateRange | null): SelectionSession {
	return { ...session, range };
}

/** 改标题查询：只改呈现，不改变报告集合。 */
export function setQuery(session: SelectionSession, query: string): SelectionSession {
	return { ...session, query };
}

/** 加入单个任务；已在报告集合中则原样返回。 */
export function addTask(session: SelectionSession, task: TaskInfo): SelectionSession {
	if (session.joined.has(task.id)) return session;
	const joined = new Map(session.joined);
	joined.set(task.id, task);
	return { ...session, joined };
}

/** 加入当前左栏可见的全部可加入任务。 */
export function addAllAddable(session: SelectionSession): SelectionSession {
	const addable = addableTasks(session);
	if (addable.length === 0) return session;
	const joined = new Map(session.joined);
	for (const task of addable) joined.set(task.id, task);
	return { ...session, joined };
}

/** 从报告集合移除单个任务；不存在则原样返回。 */
export function removeTask(session: SelectionSession, id: string): SelectionSession {
	if (!session.joined.has(id)) return session;
	const joined = new Map(session.joined);
	joined.delete(id);
	return { ...session, joined };
}

/** 清空报告集合。 */
export function clearJoined(session: SelectionSession): SelectionSession {
	if (session.joined.size === 0) return session;
	return { ...session, joined: new Map() };
}
