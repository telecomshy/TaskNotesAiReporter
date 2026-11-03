/**
 * 「选择任务」会话：筛选结果与报告集合的唯一真源。
 *
 * 读侧唯一入口 `frame()`——一帧一问：每次现算返回整帧（左栏行与标记、计数、
 * 空态原因、右栏报告集合、筛选摘要），界面每帧只问一次。
 * 状态经 7 个具名转移推进；无操作转移返回同一引用，调用方以此跳过重绘。
 * 筛选（切 Tab / 改区间 / 改查询）只改变左栏呈现，绝不修改报告集合。
 * 加入、加入全部可见、移除、清空是仅有的集合转移。
 * 无 DOM、无 obsidian，可在 Node 单元测试。决策见 ADR-0023。
 */

import {
	filterTasksByDateRange,
	filterTasksByTitleQuery,
	parseTitleQuery,
	type TitleQuery,
} from "../core/filter";
import type { DateField, DateRange, TaskInfo } from "../types";

export type SelectionTab = "time" | "title";

/** 左栏为空的原因：未选区间 / 无命中；全部已加入仍有筛选结果，不算空态。 */
export type LeftEmptyReason = "no-range" | "no-match" | null;

/** 当前筛选区间的来源：快捷周期 / 自定义日历 / 无。 */
export type RangeSource = "preset" | "custom" | null;

/** 改变筛选区间的一次动作；来源随之确定，调用方无需再单独记录。 */
export type RangePick =
	| { kind: "preset"; range: DateRange }
	| { kind: "custom"; range: DateRange }
	| { kind: "open-custom" }
	| { kind: "clear" };

/** 左栏一行的标记：可加入（可点）/ 已加入（留在原位，惰性带标记）。 */
export type RowState = "addable" | "joined";

/** 一帧一问的完整答案：画什么、数多少、空不空、右栏是什么、筛选区回显什么。 */
export interface SelectionFrame {
	/** 左栏：筛选结果（含已加入行），任务快照顺序。 */
	left: {
		rows: Array<{ task: TaskInfo; state: RowState }>;
		/** 空态原因；null ⟺ 有筛选结果（全部已加入不算空态）。 */
		empty: LeftEmptyReason;
	};
	counts: {
		/** 筛选结果条数 = left.rows.length */
		matching: number;
		/** 可加入条数 = rows 中 state === "addable" 的条数 */
		addable: number;
		/** 已加入条数 = right.rows.length */
		joined: number;
		/** 「状态筛选」预留位（ADR-0021）：本版恒 0。 */
		unknownHidden: number;
	};
	/** 右栏：报告集合，按加入顺序。不受当前筛选影响。 */
	right: { rows: TaskInfo[] };
	filter: {
		tab: SelectionTab;
		/** 标题查询原文（搜索框回显、清空按钮显隐）。 */
		query: string;
		/** 标题查询解析（关键字 / 标签 / 上下文）。 */
		parsedQuery: TitleQuery;
		/** 筛选区间：任务列表与区间文字共用的真源。 */
		range: DateRange | null;
		/** 区间来源：preset → 快捷按钮高亮；custom → 自定义按钮高亮。 */
		rangeSource: RangeSource;
		/** 日历初值：仅 custom 来源回填；快捷区间从不预选日历。 */
		calendarSeed: DateRange | null;
	};
}

// ===== 不透明句柄 =====

declare const sessionState: unique symbol;

/** 会话句柄：不透明。调用方只经转移推进、经 `frame` 读取，不读写其内部。 */
export interface SelectionSession {
	readonly [sessionState]: unknown;
}

/**
 * 内部状态。`tasks` / `dateFields` 是打开弹窗时注入、生命周期内恒定的输入。
 * `joined` 保持加入顺序，供右栏与生成共用。
 *
 * 不变式（内部保证，缝外不可见）：`rangeSource === null` 当且仅当 `range === null`；
 * `preset` / `custom` 必有区间。区间只由 `chooseRange` 改变。
 */
interface SessionState {
	tasks: TaskInfo[];
	joined: Map<string, TaskInfo>;
	tab: SelectionTab;
	range: DateRange | null;
	rangeSource: RangeSource;
	query: string;
	dateFields: readonly DateField[];
}

function stateOf(session: SelectionSession): SessionState {
	return session as unknown as SessionState;
}

function sessionOf(state: SessionState): SelectionSession {
	return state as unknown as SelectionSession;
}

/** 构造初始会话：时间页、无区间、空查询、报告集合为空。 */
export function createSelectionSession(
	tasks: TaskInfo[],
	dateFields: readonly DateField[]
): SelectionSession {
	return sessionOf({
		tasks: [...tasks],
		joined: new Map(),
		tab: "time",
		range: null,
		rangeSource: null,
		query: "",
		dateFields,
	});
}

// ===== 唯一读入口 =====

/** 一帧一问：每次现算（无缓存），返回全新数组；同一状态多次投影恒等。 */
export function frame(session: SelectionSession): SelectionFrame {
	const state = stateOf(session);
	const parsed = parseTitleQuery(state.query);

	// 筛选结果：时间页无区间即空；标题页恒筛选（空查询 = 全部非归档）。
	const matching =
		state.tab === "time"
			? state.range
				? filterTasksByDateRange(state.tasks, state.range, state.dateFields)
				: []
			: filterTasksByTitleQuery(state.tasks, parsed);

	const rows: SelectionFrame["left"]["rows"] = matching.map((task) => ({
		task,
		state: state.joined.has(task.id) ? "joined" : "addable",
	}));
	const addable = rows.filter((row) => row.state === "addable").length;

	let empty: LeftEmptyReason = null;
	if (state.tab === "time" && state.range === null) empty = "no-range";
	else if (matching.length === 0) empty = "no-match";

	return {
		left: { rows, empty },
		counts: {
			matching: rows.length,
			addable,
			joined: state.joined.size,
			unknownHidden: 0,
		},
		right: { rows: Array.from(state.joined.values()) },
		filter: {
			tab: state.tab,
			query: state.query,
			parsedQuery: parsed,
			range: state.range,
			rangeSource: state.rangeSource,
			calendarSeed: state.rangeSource === "custom" ? state.range : null,
		},
	};
}

// ===== 具名转移 =====

/** 切换 Tab：只改呈现，不改变报告集合与筛选区间。同页签为无操作。 */
export function switchTab(session: SelectionSession, tab: SelectionTab): SelectionSession {
	const state = stateOf(session);
	if (state.tab === tab) return session;
	return sessionOf({ ...state, tab });
}

/**
 * 改变筛选区间。来源随动作确定，区间与来源始终一起转移：
 * 快捷周期设 preset；自定义选日期设 custom；清空两者归零；
 * 打开自定义时 preset 区间清空，custom 区间保留以便继续挑选。
 */
export function chooseRange(session: SelectionSession, pick: RangePick): SelectionSession {
	const state = stateOf(session);
	switch (pick.kind) {
		case "preset":
			return sessionOf({ ...state, range: pick.range, rangeSource: "preset" });
		case "custom":
			return sessionOf({ ...state, range: pick.range, rangeSource: "custom" });
		case "clear":
			if (state.range === null && state.rangeSource === null) return session;
			return sessionOf({ ...state, range: null, rangeSource: null });
		case "open-custom":
			if (state.rangeSource === "custom") return session;
			if (state.range === null && state.rangeSource === null) return session;
			return sessionOf({ ...state, range: null, rangeSource: null });
	}
}

/** 改标题查询：只改呈现，不改变报告集合。同查询串为无操作。 */
export function setQuery(session: SelectionSession, query: string): SelectionSession {
	const state = stateOf(session);
	if (state.query === query) return session;
	return sessionOf({ ...state, query });
}

/** 加入单个任务；已在报告集合中则无操作。 */
export function addTask(session: SelectionSession, task: TaskInfo): SelectionSession {
	const state = stateOf(session);
	if (state.joined.has(task.id)) return session;
	const joined = new Map(state.joined);
	joined.set(task.id, task);
	return sessionOf({ ...state, joined });
}

/** 加入当前筛选结果中的全部可加入任务；无可加入则无操作。 */
export function addAllAddable(session: SelectionSession): SelectionSession {
	const state = stateOf(session);
	const addable = frame(session)
		.left.rows.filter((row) => row.state === "addable")
		.map((row) => row.task);
	if (addable.length === 0) return session;
	const joined = new Map(state.joined);
	for (const task of addable) joined.set(task.id, task);
	return sessionOf({ ...state, joined });
}

/** 从报告集合移除单个任务；不存在则无操作。 */
export function removeTask(session: SelectionSession, id: string): SelectionSession {
	const state = stateOf(session);
	if (!state.joined.has(id)) return session;
	const joined = new Map(state.joined);
	joined.delete(id);
	return sessionOf({ ...state, joined });
}

/** 清空报告集合；已空则无操作。 */
export function clearJoined(session: SelectionSession): SelectionSession {
	const state = stateOf(session);
	if (state.joined.size === 0) return session;
	return sessionOf({ ...state, joined: new Map() });
}
