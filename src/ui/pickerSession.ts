/**
 * 「选择任务」窗口的会话状态：Tab / 时间区间 / 标题查询 / 勾选集合。
 *
 * 纯状态值 + 具名转移 + 选择器，无 DOM、无 obsidian，可在 Node 单元测试。
 * 弹窗（TaskPickerModal）只负责把会话渲染成 DOM，所有选择规则都住在这里。
 *
 * 勾选集合（`desiredIds`）表达「确认后希望保留在报告集合中的任务」：已加入任务初始勾选，
 * 取消勾选一个可见的已加入任务，确认后即从报告集合移除。
 * 确认只提交当前可见任务的差异——筛选之外的任务不受影响。
 */

import {
	filterTasksByDateRange,
	filterTasksByTitleQuery,
	isTitleQueryEmpty,
	parseTitleQuery,
	type TitleQuery,
} from "../core/filter";
import type { DateField, DateRange, TaskInfo } from "../types";

export type PickerTab = "time" | "title";

/**
 * 会话状态。`tasks` / `dateFields` / `candidateIds` 是构造时注入、生命周期内恒定的输入，
 * 随会话值携带，供转移内部重算可见任务。
 *
 * `candidateIds` 是打开窗口时主列表中的任务（「已加入」），用于区分「已加入」与「新增」。
 * 可见任务包含已加入任务：它们默认勾选，取消勾选后确认即从主列表移除。
 */
export interface PickerSession {
	tab: PickerTab;
	range: DateRange | null;
	query: string;
	/** 确认后希望保留在报告集合中的任务 id。 */
	desiredIds: Set<string>;
	tasks: TaskInfo[];
	candidateIds: ReadonlySet<string>;
	dateFields: readonly DateField[];
}

/** 确认时要提交的差异（只覆盖当前可见任务）。 */
export interface PickerChanges {
	/** 当前可见、勾选、且尚未加入的任务，按可见顺序。 */
	addedTasks: TaskInfo[];
	/** 当前可见、未勾选、且已加入的任务 id。 */
	removeIds: string[];
}

/** 差异的计数视图，供按钮文案与提示复用。 */
export interface PickerChangeSummary {
	added: number;
	removed: number;
	isEmpty: boolean;
}

export interface SelectAllState {
	checked: boolean;
	indeterminate: boolean;
}

/**
 * 构造初始会话：时间页、无区间、空查询、已加入任务默认勾选。
 * 接收「全部任务 + 已加入集合」，复制后者，避免调用方后续修改影响会话。
 */
export function createSession(
	allTasks: TaskInfo[],
	dateFields: readonly DateField[],
	candidateIds: Set<string>
): PickerSession {
	const candidates = new Set(candidateIds);
	return {
		tab: "time",
		range: null,
		query: "",
		desiredIds: new Set(candidates),
		tasks: allTasks,
		candidateIds: candidates,
		dateFields,
	};
}

// ===== 选择器 =====

/** 当前可见任务：时间页按 `range` 过滤（null 时无可见）；标题页按解析查询过滤。 */
export function visibleTasks(session: PickerSession): TaskInfo[] {
	if (session.tab === "time") {
		return session.range
			? filterTasksByDateRange(session.tasks, session.range, session.dateFields)
			: [];
	}
	return filterTasksByTitleQuery(session.tasks, parsedQuery(session));
}

/**
 * 当前待提交的差异：只检查当前可见任务。
 * 筛选之外的已加入任务既不加入也不移除。
 */
export function pendingChanges(session: PickerSession): PickerChanges {
	const addedTasks: TaskInfo[] = [];
	const removeIds: string[] = [];
	for (const task of visibleTasks(session)) {
		const joined = session.candidateIds.has(task.id);
		const desired = session.desiredIds.has(task.id);
		if (desired && !joined) addedTasks.push(task);
		else if (!desired && joined) removeIds.push(task.id);
	}
	return { addedTasks, removeIds };
}

/** 差异的计数视图，供按钮文案与提示复用。 */
export function summarizeChanges(changes: PickerChanges): PickerChangeSummary {
	const added = changes.addedTasks.length;
	const removed = changes.removeIds.length;
	return { added, removed, isEmpty: added === 0 && removed === 0 };
}

/** 标题查询的解析结果（关键字 / 标签 / 上下文）。 */
export function parsedQuery(session: PickerSession): TitleQuery {
	return parseTitleQuery(session.query);
}

/** 标题查询是否为空（关键字、标签、上下文三个维度均无条件）。 */
export function isQueryEmpty(session: PickerSession): boolean {
	return isTitleQueryEmpty(parsedQuery(session));
}

/** 「全选」复选框三态：全部勾选为全选，部分勾选为半选。 */
export function selectAllState(session: PickerSession): SelectAllState {
	const displayed = visibleTasks(session);
	const checkedCount = displayed.filter((task) => session.desiredIds.has(task.id)).length;
	return {
		checked: displayed.length > 0 && checkedCount === displayed.length,
		indeterminate: checkedCount > 0 && checkedCount < displayed.length,
	};
}

// ===== 具名转移 =====

/** 切换 Tab，并按 Tab 默认重设勾选（时间页全选可见新增；标题页只保留已加入）。 */
export function switchTab(session: PickerSession, tab: PickerTab): PickerSession {
	const next = { ...session, tab };
	return { ...next, desiredIds: defaultSelection(next) };
}

/** 改时间区间，重算可见并全选可见新增。 */
export function setRange(session: PickerSession, range: DateRange | null): PickerSession {
	const next = { ...session, range };
	return { ...next, desiredIds: defaultSelection(next) };
}

/** 改标题查询，重算可见；保留已加入勾选，清空未提交的新增勾选。 */
export function setQuery(session: PickerSession, query: string): PickerSession {
	const next = { ...session, query };
	return { ...next, desiredIds: defaultSelection(next) };
}

/** 勾选 / 取消单个任务（`id` 是任务标识，缝外不透明）。 */
export function toggle(session: PickerSession, id: string): PickerSession {
	const desired = new Set(session.desiredIds);
	if (desired.has(id)) desired.delete(id);
	else desired.add(id);
	return { ...session, desiredIds: desired };
}

/** 对当前可见任务整体全选 / 取消。 */
export function setAll(session: PickerSession, desired: boolean): PickerSession {
	const next = new Set(session.desiredIds);
	for (const task of visibleTasks(session)) {
		if (desired) next.add(task.id);
		else next.delete(task.id);
	}
	return { ...session, desiredIds: next };
}

/** 清空当前可见任务的勾选。 */
export function clearSelection(session: PickerSession): PickerSession {
	const next = new Set(session.desiredIds);
	for (const task of visibleTasks(session)) next.delete(task.id);
	return { ...session, desiredIds: next };
}

/** 当前可见任务中是否还有勾选项（用于「清空选择」的禁用态）。 */
export function hasDesiredVisible(session: PickerSession): boolean {
	return visibleTasks(session).some((task) => session.desiredIds.has(task.id));
}

// ===== 内部 =====

/**
 * 切 Tab / 改筛选后的默认勾选：已加入任务始终勾选；
 * 时间页额外全选可见的新任务，标题页只保留已加入。
 */
function defaultSelection(session: PickerSession): Set<string> {
	const desired = new Set(session.candidateIds);
	if (session.tab === "time") {
		for (const task of visibleTasks(session)) desired.add(task.id);
	}
	return desired;
}
