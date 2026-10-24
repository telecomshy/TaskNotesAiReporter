import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addAllAddable,
	addTask,
	addableTasks,
	calendarSeed,
	chooseRange,
	clearJoined,
	createSelectionSession,
	filterRange,
	isJoined,
	leftEmptyReason,
	matchingTasks,
	parsedQuery,
	removeTask,
	joinedCount,
	joinedTasks,
	setQuery,
	switchTab,
	type SelectionSession,
} from "../src/ui/selectionSession";
import { makeTask } from "./fakes/task";
import type { DateField, DateRange } from "../src/types";

const dateFields: DateField[] = ["due"];

const a = makeTask({ id: "a", title: "Alpha", due: "2024-03-05", tags: ["work"] });
const b = makeTask({ id: "b", title: "Beta", due: "2024-03-10", tags: ["home"], contexts: ["home"] });
const c = makeTask({ id: "c", title: "Gamma", due: "2024-04-01", tags: ["work/proj"] });
const tasks = [a, b, c];

const march: DateRange = { start: "2024-03-01", end: "2024-03-31" };
const april: DateRange = { start: "2024-04-01", end: "2024-04-30" };
const may: DateRange = { start: "2024-05-01", end: "2024-05-31" };

function ids(list: { id: string }[]): string[] {
	return list.map((task) => task.id);
}

/** 快捷周期按钮的效果：区间来自预设。 */
function preset(session: SelectionSession, range: DateRange): SelectionSession {
	return chooseRange(session, { kind: "preset", range });
}

function custom(session: SelectionSession, range: DateRange): SelectionSession {
	return chooseRange(session, { kind: "custom", range });
}

test("初值：时间页、无区间与来源、空查询、报告集合为空", () => {
	const session = createSelectionSession(tasks, dateFields);
	assert.equal(session.tab, "time");
	assert.equal(session.range, null);
	assert.equal(session.rangeSource, null);
	assert.equal(session.query, "");
	assert.equal(joinedCount(session), 0);
	assert.deepEqual(joinedTasks(session), []);
	assert.deepEqual(addableTasks(session), []);
	assert.deepEqual(matchingTasks(session), []);
	assert.deepEqual(session.tasks, tasks);
	assert.equal(session.dateFields, dateFields);
});

test("时间筛选：命中区间任务，左栏排除已加入", () => {
	let session = preset(createSelectionSession(tasks, dateFields), march);
	assert.deepEqual(ids(matchingTasks(session)), ["a", "b"]);
	assert.deepEqual(ids(addableTasks(session)), ["a", "b"]);

	session = addTask(session, a);
	assert.deepEqual(ids(matchingTasks(session)), ["a", "b"]);
	assert.deepEqual(ids(addableTasks(session)), ["b"]);
	assert.equal(isJoined(session, "a"), true);
});

test("标题筛选：关键字、标签、上下文", () => {
	const base = switchTab(createSelectionSession(tasks, dateFields), "title");
	assert.deepEqual(ids(addableTasks(base)), ["a", "b", "c"]);

	assert.deepEqual(ids(addableTasks(setQuery(base, "beta"))), ["b"]);
	assert.deepEqual(ids(addableTasks(setQuery(base, "#work"))), ["a", "c"]);
	assert.deepEqual(ids(addableTasks(setQuery(base, "@home"))), ["b"]);
});

test("加入：按加入顺序进入右栏，左栏消失；重复加入无副作用", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = addTask(session, c);
	session = addTask(session, a);
	assert.deepEqual(ids(joinedTasks(session)), ["c", "a"]);
	assert.deepEqual(ids(addableTasks(session)), ["b"]);

	const again = addTask(session, c);
	assert.deepEqual(ids(joinedTasks(again)), ["c", "a"]);
	assert.equal(joinedCount(again), 2);
});

test("加入全部可见：只加入当前筛选结果中的可加入任务", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = setQuery(session, "#work");
	assert.deepEqual(ids(addableTasks(session)), ["a", "c"]);

	session = addAllAddable(session);
	assert.deepEqual(ids(joinedTasks(session)), ["a", "c"]);
	assert.deepEqual(addableTasks(session), []);

	// 换查询后只出现新的可加入任务；全选不会重复加入已有任务
	session = setQuery(session, "");
	assert.deepEqual(ids(addableTasks(session)), ["b"]);
	session = addAllAddable(session);
	assert.deepEqual(ids(joinedTasks(session)), ["a", "c", "b"]);
});

test("移除与清空：只作用于报告集合", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = addTask(addTask(session, a), b);
	session = removeTask(session, a.id);
	assert.deepEqual(ids(joinedTasks(session)), ["b"]);
	assert.deepEqual(ids(addableTasks(session)), ["a", "c"]);

	session = clearJoined(session);
	assert.equal(joinedCount(session), 0);
	assert.deepEqual(ids(addableTasks(session)), ["a", "b", "c"]);
});

test("筛选转移不改变报告集合：切 Tab / 改区间 / 改查询", () => {
	let session = createSelectionSession(tasks, dateFields);
	session = addTask(session, a);
	assert.deepEqual(ids(joinedTasks(session)), ["a"]);

	session = switchTab(session, "title");
	assert.deepEqual(ids(joinedTasks(session)), ["a"]);

	session = setQuery(session, "beta");
	assert.deepEqual(ids(joinedTasks(session)), ["a"]);
	assert.deepEqual(ids(addableTasks(session)), ["b"]);

	session = switchTab(session, "time");
	session = preset(session, april);
	assert.deepEqual(ids(joinedTasks(session)), ["a"]);
	assert.deepEqual(ids(addableTasks(session)), ["c"]);

	session = chooseRange(session, { kind: "clear" });
	assert.deepEqual(ids(joinedTasks(session)), ["a"]);
	assert.deepEqual(addableTasks(session), []);
});

test("空态原因：未选区间 / 无命中；全部已加入不算空态", () => {
	let session = createSelectionSession(tasks, dateFields);
	assert.equal(leftEmptyReason(session), "no-range");

	session = preset(session, may);
	assert.equal(leftEmptyReason(session), "no-match");

	session = preset(session, april);
	assert.equal(leftEmptyReason(session), null);
	session = addAllAddable(session);
	assert.equal(leftEmptyReason(session), null);
	assert.deepEqual(ids(matchingTasks(session)), ["c"]);
	assert.deepEqual(addableTasks(session), []);

	const title = setQuery(switchTab(createSelectionSession(tasks, dateFields), "title"), "zzz");
	assert.equal(leftEmptyReason(title), "no-match");

	const titleAll = switchTab(createSelectionSession(tasks, dateFields), "title");
	assert.equal(leftEmptyReason(titleAll), null);
	const joinedTitleAll = addAllAddable(titleAll);
	assert.equal(leftEmptyReason(joinedTitleAll), null);
	assert.deepEqual(ids(matchingTasks(joinedTitleAll)), ["a", "b", "c"]);
	assert.deepEqual(addableTasks(joinedTitleAll), []);
});

test("归档任务不进入筛选结果", () => {
	const archived = makeTask({ id: "z", title: "Archived", due: "2024-03-15", archived: true });
	const session = preset(createSelectionSession([a, archived], dateFields), march);
	assert.deepEqual(ids(matchingTasks(session)), ["a"]);
	assert.deepEqual(ids(addableTasks(session)), ["a"]);
});

test("parsedQuery / isQueryEmpty：解析关键字、标签、上下文", () => {
	const session = setQuery(createSelectionSession(tasks, dateFields), "#work @home alpha");
	assert.deepEqual(parsedQuery(session), {
		keywords: ["alpha"],
		tags: ["work"],
		contexts: ["home"],
	});
	assert.deepEqual(parsedQuery(setQuery(session, "   ")), { keywords: [], tags: [], contexts: [] });
	assert.deepEqual(parsedQuery(setQuery(session, "#")), { keywords: [], tags: [], contexts: [] });
});

// ===== 筛选区间与来源 =====

test("周期快捷：区间生效、来源为 preset，日历初值为空", () => {
	const session = preset(createSelectionSession(tasks, dateFields), march);
	assert.equal(session.rangeSource, "preset");
	assert.deepEqual(filterRange(session), march);
	assert.equal(calendarSeed(session), null);
	assert.deepEqual(ids(addableTasks(session)), ["a", "b"]);
});

test("回归：周期区间不回填日历；打开自定义时区间与左栏任务一起清空", () => {
	let session = preset(createSelectionSession(tasks, dateFields), march);
	assert.deepEqual(ids(matchingTasks(session)), ["a", "b"]);

	session = chooseRange(session, { kind: "open-custom" });
	assert.equal(session.range, null);
	assert.equal(session.rangeSource, null);
	assert.equal(filterRange(session), null);
	assert.equal(calendarSeed(session), null);
	assert.deepEqual(matchingTasks(session), []);
	assert.equal(leftEmptyReason(session), "no-range");
});

test("回归：自定义区间重开时保留区间与左栏任务", () => {
	let session = custom(createSelectionSession(tasks, dateFields), march);
	session = chooseRange(session, { kind: "open-custom" });
	assert.deepEqual(session.range, march);
	assert.equal(session.rangeSource, "custom");
	assert.deepEqual(filterRange(session), march);
	assert.deepEqual(calendarSeed(session), march);
	assert.deepEqual(ids(matchingTasks(session)), ["a", "b"]);
});

test("自定义选日期：区间合法、来源为 custom；单日区间原样保留", () => {
	const day: DateRange = { start: "2024-03-05", end: "2024-03-05" };
	let session = custom(createSelectionSession(tasks, dateFields), day);
	assert.equal(session.rangeSource, "custom");
	assert.deepEqual(filterRange(session), day);
	assert.deepEqual(calendarSeed(session), day);
	assert.deepEqual(ids(matchingTasks(session)), ["a"]);

	session = custom(session, march);
	assert.equal(session.rangeSource, "custom");
	assert.deepEqual(calendarSeed(session), march);
});

test("清空范围：区间与来源原子归零", () => {
	const session = chooseRange(custom(createSelectionSession(tasks, dateFields), march), {
		kind: "clear",
	});
	assert.equal(session.range, null);
	assert.equal(session.rangeSource, null);
	assert.equal(filterRange(session), null);
	assert.equal(calendarSeed(session), null);
	assert.deepEqual(matchingTasks(session), []);
});

test("其他转移不改变区间与来源：切 Tab / 改查询 / 加入 / 移除 / 清空", () => {
	let session = custom(createSelectionSession(tasks, dateFields), march);
	session = switchTab(session, "title");
	session = setQuery(session, "alpha");
	session = addTask(session, a);
	session = addAllAddable(session);
	session = removeTask(session, a.id);
	session = clearJoined(session);

	assert.equal(session.rangeSource, "custom");
	assert.deepEqual(session.range, march);
	assert.deepEqual(filterRange(session), march);
	assert.deepEqual(calendarSeed(session), march);
});

test("不变式：有来源当且仅当有区间", () => {
	const initial = createSelectionSession(tasks, dateFields);
	const cases: SelectionSession[] = [
		initial,
		preset(initial, march),
		custom(initial, march),
		chooseRange(initial, { kind: "open-custom" }),
		chooseRange(initial, { kind: "clear" }),
		chooseRange(preset(initial, march), { kind: "open-custom" }),
		chooseRange(custom(initial, march), { kind: "open-custom" }),
	];
	for (const session of cases) {
		assert.equal(session.range === null, session.rangeSource === null);
	}
});
