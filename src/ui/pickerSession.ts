/**
 * 「选择任务」窗口的会话状态：Tab / 时间区间 / 标题查询 / 勾选集合。
 *
 * 纯状态值 + 具名转移 + 选择器，无 DOM、无 obsidian，可在 Node 单元测试。
 * 弹窗（TaskPickerModal）只负责把会话渲染成 DOM，所有选择规则都住在这里。
 *
 * 勾选集合（`desiredIds`）表达「确认后希望保留在报告集合中的任务」：已加入任务初始勾选，
 * 取消勾选一个已加入任务，确认后即从报告集合移除。
 * 勾选只由用户操作改变：切 Tab / 改查询只改变呈现；改时间区间只追加当前可见、
 * 且未被用户手动取消的「可加入」任务（时间页的批量挑取），从不取消或重勾已加入任务。
 * 确认提交 `desiredIds` 相对「已加入」的差异——跨筛选累计的勾选一并生效。
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
	/**
	 * 用户手动取消、且尚未重新勾选的任务 id。
	 * 时间页按区间自动勾选时跳过它们，避免「取消」因换区间被悄悄撤销。
	 */
	manuallyUncheckedIds: Set<string>;
	tasks: TaskInfo[];
	candidateIds: ReadonlySet<string>;
	dateFields: readonly DateField[];
}

/** 确认时要提交的差异：勾选集合相对「已加入」的差集。 */
export interface PickerChanges {
	/** 勾选、且尚未加入的任务，按任务顺序。 */
	addedTasks: TaskInfo[];
	/** 未勾选、且已加入的任务 id。 */
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
		manuallyUncheckedIds: new Set(),
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
 * 当前待提交的差异：勾选集合相对「已加入」的差集。
 * 筛选只影响呈现，因此筛选之外的勾选 / 取消也是用户意图，一并提交。
 */
export function pendingChanges(session: PickerSession): PickerChanges {
	const addedTasks: TaskInfo[] = [];
	const removeIds: string[] = [];
	for (const task of session.tasks) {
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

/** 已加入任务的徽标状态；未加入任务不显示徽标。 */
export type JoinedBadgeState = "joined" | "removing" | "none";

/**
 * 徽标状态：已加入且勾选为 `joined`，已加入但取消勾选为 `removing`；
 * 未加入为 `none`（是否勾选由复选框表达，不额外加徽标）。
 */
export function joinedBadgeState(session: PickerSession, id: string): JoinedBadgeState {
	if (!session.candidateIds.has(id)) return "none";
	return session.desiredIds.has(id) ? "joined" : "removing";
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

/**
 * 切换 Tab：只改呈现，不改变勾选。
 * 保留为具名转移（而非让弹窗直接改字段）：选择规则属于会话，
 * 将来若切 Tab 需要附加规则，调用方无需改动。
 */
export function switchTab(session: PickerSession, tab: PickerTab): PickerSession {
	return { ...session, tab };
}

/**
 * 改时间区间：保留既有勾选；可见、且未被用户手动取消的「可加入」任务自动勾选。
 * 已加入任务不因区间变化被重新勾上（取消只能是用户操作）。
 */
export function setRange(session: PickerSession, range: DateRange | null): PickerSession {
	const next = { ...session, range };
	if (next.tab !== "time") return next;
	const desired = new Set(next.desiredIds);
	for (const task of visibleTasks(next)) {
		if (!next.candidateIds.has(task.id) && !next.manuallyUncheckedIds.has(task.id)) {
			desired.add(task.id);
		}
	}
	return { ...next, desiredIds: desired };
}

/**
 * 改标题查询：只改呈现，不改变勾选。
 * 同样保留为具名转移，让弹窗只表达意图、不拥有选择规则。
 */
export function setQuery(session: PickerSession, query: string): PickerSession {
	return { ...session, query };
}

/** 勾选 / 取消单个任务（`id` 是任务标识，缝外不透明）。 */
export function toggle(session: PickerSession, id: string): PickerSession {
	const desired = new Set(session.desiredIds);
	const unchecked = new Set(session.manuallyUncheckedIds);
	if (desired.has(id)) {
		desired.delete(id);
		unchecked.add(id);
	} else {
		desired.add(id);
		unchecked.delete(id);
	}
	return { ...session, desiredIds: desired, manuallyUncheckedIds: unchecked };
}

/** 对当前可见任务整体全选 / 取消。 */
export function setAll(session: PickerSession, desired: boolean): PickerSession {
	const next = new Set(session.desiredIds);
	const unchecked = new Set(session.manuallyUncheckedIds);
	for (const task of visibleTasks(session)) {
		if (desired) {
			next.add(task.id);
			unchecked.delete(task.id);
		} else {
			next.delete(task.id);
			unchecked.add(task.id);
		}
	}
	return { ...session, desiredIds: next, manuallyUncheckedIds: unchecked };
}

/** 清空当前可见任务的勾选。 */
export function clearSelection(session: PickerSession): PickerSession {
	const next = new Set(session.desiredIds);
	const unchecked = new Set(session.manuallyUncheckedIds);
	for (const task of visibleTasks(session)) {
		next.delete(task.id);
		unchecked.add(task.id);
	}
	return { ...session, desiredIds: next, manuallyUncheckedIds: unchecked };
}

/** 当前可见任务中是否还有勾选项（用于「清空选择」的禁用态）。 */
export function hasDesiredVisible(session: PickerSession): boolean {
	return visibleTasks(session).some((task) => session.desiredIds.has(task.id));
}
