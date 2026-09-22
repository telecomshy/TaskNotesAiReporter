/**
 * 「选择任务」窗口的会话状态：Tab / 时间区间 / 标题查询 / 勾选集合。
 *
 * 纯状态值 + 具名转移 + 选择器，无 DOM、无 obsidian，可在 Node 单元测试。
 * 弹窗（TaskPickerModal）只负责把会话渲染成 DOM，所有选择规则都住在这里。
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
 * 会话状态。`addableTasks` / `dateFields` 是构造时注入、生命周期内恒定的输入，
 * 随会话值携带，供转移内部重算可见任务。
 *
 * `addableTasks` 是「全部任务」减去「已加入」后的「可加入」集合，在构造时一次性派生；
 * 因此会话内的可见 / 可勾选 / 可加入天然不含已加入任务。
 */
export interface PickerSession {
	tab: PickerTab;
	range: DateRange | null;
	query: string;
	checked: Set<string>;
	addableTasks: TaskInfo[];
	dateFields: DateField[];
}

export interface SelectAllState {
	checked: boolean;
	indeterminate: boolean;
}

/**
 * 构造初始会话：时间页、无区间、空查询、无勾选。
 * 接收「全部任务 + 已加入路径集合」，派生「可加入」集合。
 */
export function createSession(
	allTasks: TaskInfo[],
	dateFields: DateField[],
	candidateIds: Set<string>
): PickerSession {
	const addableTasks = allTasks.filter((task) => !candidateIds.has(task.id));
	return { tab: "time", range: null, query: "", checked: new Set(), addableTasks, dateFields };
}

// ===== 选择器 =====

/** 当前可见任务：时间页按 `range` 过滤（null 时无可见）；标题页按解析查询过滤。 */
export function visibleTasks(session: PickerSession): TaskInfo[] {
	if (session.tab === "time") {
		return session.range
			? filterTasksByDateRange(session.addableTasks, session.range, session.dateFields)
			: [];
	}
	return filterTasksByTitleQuery(session.addableTasks, parsedQuery(session));
}

/** 当前可见且已勾选的任务（「加入」的实际结果）。 */
export function selectedTasks(session: PickerSession): TaskInfo[] {
	return visibleTasks(session).filter((task) => session.checked.has(task.id));
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
	const checkedCount = displayed.filter((task) => session.checked.has(task.id)).length;
	return {
		checked: displayed.length > 0 && checkedCount === displayed.length,
		indeterminate: checkedCount > 0 && checkedCount < displayed.length,
	};
}

// ===== 具名转移 =====

/** 切换 Tab，并按 Tab 默认重设勾选（时间页全选可见；标题页全不选）。 */
export function switchTab(session: PickerSession, tab: PickerTab): PickerSession {
	const next = { ...session, tab };
	return { ...next, checked: defaultSelection(next) };
}

/** 改时间区间，重算可见并全选。 */
export function setRange(session: PickerSession, range: DateRange | null): PickerSession {
	const next = { ...session, range };
	return { ...next, checked: selectAll(visibleTasks(next)) };
}

/** 改标题查询，重算可见并清空勾选。 */
export function setQuery(session: PickerSession, query: string): PickerSession {
	return { ...session, query, checked: new Set() };
}

/** 勾选 / 取消单个任务。 */
export function toggle(session: PickerSession, path: string): PickerSession {
	const checked = new Set(session.checked);
	if (checked.has(path)) checked.delete(path);
	else checked.add(path);
	return { ...session, checked };
}

/** 对当前可见任务整体全选 / 取消。 */
export function setAll(session: PickerSession, checked: boolean): PickerSession {
	const next = new Set(session.checked);
	for (const task of visibleTasks(session)) {
		if (checked) next.add(task.id);
		else next.delete(task.id);
	}
	return { ...session, checked: next };
}

/** 清空当前可见任务的勾选。 */
export function clearSelection(session: PickerSession): PickerSession {
	const next = new Set(session.checked);
	for (const task of visibleTasks(session)) next.delete(task.id);
	return { ...session, checked: next };
}

// ===== 内部 =====

/** 切 Tab / 改区间后的默认勾选：时间页全选可见，标题页空集。 */
function defaultSelection(session: PickerSession): Set<string> {
	return session.tab === "time" ? selectAll(visibleTasks(session)) : new Set();
}

function selectAll(tasks: TaskInfo[]): Set<string> {
	return new Set(tasks.map((task) => task.id));
}
