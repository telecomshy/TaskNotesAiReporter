import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addAllAddable,
	addTask,
	addableTasks,
	clearSelected,
	createSelectionSession,
	isQueryEmpty,
	isSelected,
	leftEmptyReason,
	matchingTasks,
	parsedQuery,
	removeTask,
	selectedCount,
	selectedTasks,
	setQuery,
	setRange,
	switchTab,
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

test("初值：时间页、无区间、空查询、报告集合为空", () => {
	const session = createSelectionSession(tasks, dateFields);
	assert.equal(session.tab, "time");
	assert.equal(session.range, null);
	assert.equal(session.query, "");
	assert.equal(selectedCount(session), 0);
	assert.deepEqual(selectedTasks(session), []);
	assert.deepEqual(addableTasks(session), []);
	assert.deepEqual(matchingTasks(session), []);
	assert.deepEqual(session.tasks, tasks);
	assert.equal(session.dateFields, dateFields);
});

test("时间筛选：命中区间任务，左栏排除已加入", () => {
	let session = setRange(createSelectionSession(tasks, dateFields), march);
	assert.deepEqual(ids(matchingTasks(session)), ["a", "b"]);
	assert.deepEqual(ids(addableTasks(session)), ["a", "b"]);

	session = addTask(session, a);
	assert.deepEqual(ids(matchingTasks(session)), ["a", "b"]);
	assert.deepEqual(ids(addableTasks(session)), ["b"]);
	assert.equal(isSelected(session, "a"), true);
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
	assert.deepEqual(ids(selectedTasks(session)), ["c", "a"]);
	assert.deepEqual(ids(addableTasks(session)), ["b"]);

	const again = addTask(session, c);
	assert.deepEqual(ids(selectedTasks(again)), ["c", "a"]);
	assert.equal(selectedCount(again), 2);
});

test("加入全部可见：只加入当前筛选结果中的可加入任务", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = setQuery(session, "#work");
	assert.deepEqual(ids(addableTasks(session)), ["a", "c"]);

	session = addAllAddable(session);
	assert.deepEqual(ids(selectedTasks(session)), ["a", "c"]);
	assert.deepEqual(addableTasks(session), []);

	// 换查询后只出现新的可加入任务；全选不会重复加入已有任务
	session = setQuery(session, "");
	assert.deepEqual(ids(addableTasks(session)), ["b"]);
	session = addAllAddable(session);
	assert.deepEqual(ids(selectedTasks(session)), ["a", "c", "b"]);
});

test("移除与清空：只作用于报告集合", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = addTask(addTask(session, a), b);
	session = removeTask(session, a.id);
	assert.deepEqual(ids(selectedTasks(session)), ["b"]);
	assert.deepEqual(ids(addableTasks(session)), ["a", "c"]);

	session = clearSelected(session);
	assert.equal(selectedCount(session), 0);
	assert.deepEqual(ids(addableTasks(session)), ["a", "b", "c"]);
});

test("筛选转移不改变报告集合：切 Tab / 改区间 / 改查询", () => {
	let session = createSelectionSession(tasks, dateFields);
	session = addTask(session, a);
	assert.deepEqual(ids(selectedTasks(session)), ["a"]);

	session = switchTab(session, "title");
	assert.deepEqual(ids(selectedTasks(session)), ["a"]);

	session = setQuery(session, "beta");
	assert.deepEqual(ids(selectedTasks(session)), ["a"]);
	assert.deepEqual(ids(addableTasks(session)), ["b"]);

	session = switchTab(session, "time");
	session = setRange(session, april);
	assert.deepEqual(ids(selectedTasks(session)), ["a"]);
	assert.deepEqual(ids(addableTasks(session)), ["c"]);

	session = setRange(session, null);
	assert.deepEqual(ids(selectedTasks(session)), ["a"]);
	assert.deepEqual(addableTasks(session), []);
});

test("空态原因：未选区间 / 无命中 / 全部已加入", () => {
	let session = createSelectionSession(tasks, dateFields);
	assert.equal(leftEmptyReason(session), "no-range");

	session = setRange(session, may);
	assert.equal(leftEmptyReason(session), "no-match");

	session = setRange(session, april);
	assert.equal(leftEmptyReason(session), null);
	session = addAllAddable(session);
	assert.equal(leftEmptyReason(session), "all-selected");

	const title = setQuery(switchTab(createSelectionSession(tasks, dateFields), "title"), "zzz");
	assert.equal(leftEmptyReason(title), "no-match");

	const titleAll = switchTab(createSelectionSession(tasks, dateFields), "title");
	assert.equal(leftEmptyReason(titleAll), null);
	assert.equal(leftEmptyReason(addAllAddable(titleAll)), "all-selected");
});

test("归档任务不进入筛选结果", () => {
	const archived = makeTask({ id: "z", title: "Archived", due: "2024-03-15", archived: true });
	const session = setRange(createSelectionSession([a, archived], dateFields), march);
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
	assert.equal(isQueryEmpty(session), false);
	assert.equal(isQueryEmpty(setQuery(session, "   ")), true);
	assert.equal(isQueryEmpty(setQuery(session, "#")), true);
});
