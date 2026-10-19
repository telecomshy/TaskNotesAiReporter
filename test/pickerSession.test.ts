import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clearSelection,
	createSession,
	hasDesiredVisible,
	isQueryEmpty,
	joinedBadgeState,
	parsedQuery,
	pendingChanges,
	selectAllState,
	setAll,
	setQuery,
	setRange,
	summarizeChanges,
	switchTab,
	toggle,
	visibleTasks,
} from "../src/ui/pickerSession";
import { makeTask } from "./fakes/task";
import type { DateField, DateRange } from "../src/types";

const dateFields: DateField[] = ["due"];

const a = makeTask({ id: "a", title: "Alpha", due: "2024-03-05", tags: ["work"] });
const b = makeTask({ id: "b", title: "Beta", due: "2024-03-10", tags: ["home"], contexts: ["home"] });
const c = makeTask({ id: "c", title: "Gamma", due: "2024-04-01", tags: ["work/proj"] });
const tasks = [a, b, c];

const march: DateRange = { start: "2024-03-01", end: "2024-03-31" };

function ids(list: { id: string }[]): string[] {
	return list.map((task) => task.id);
}

function sorted(set: Set<string>): string[] {
	return [...set].sort();
}

test("初值：时间页、无区间、空查询、已加入任务默认勾选", () => {
	const session = createSession(tasks, dateFields, new Set(["b"]));
	assert.equal(session.tab, "time");
	assert.equal(session.range, null);
	assert.equal(session.query, "");
	assert.deepEqual(sorted(session.desiredIds), ["b"]);
	assert.deepEqual(visibleTasks(session), []);
	assert.deepEqual(session.tasks, tasks);
	assert.deepEqual([...session.candidateIds], ["b"]);
	assert.equal(session.dateFields, dateFields);
});

test("createSession：复制已加入集合，外部修改不影响会话", () => {
	const candidates = new Set(["b"]);
	const session = createSession(tasks, dateFields, candidates);
	candidates.add("c");
	assert.equal(session.candidateIds.has("c"), false);
	assert.deepEqual(sorted(session.desiredIds), ["b"]);
});

test("可见任务包含已加入任务：时间页与标题页一致", () => {
	const timed = setRange(createSession(tasks, dateFields, new Set(["b"])), march);
	assert.deepEqual(ids(visibleTasks(timed)), ["a", "b"]);

	const title = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	assert.deepEqual(ids(visibleTasks(title)), ["a", "b", "c"]);
});

test("时间页默认全选可见任务（含已加入）", () => {
	const session = setRange(createSession(tasks, dateFields, new Set(["a"])), march);
	assert.deepEqual(ids(visibleTasks(session)), ["a", "b"]);
	assert.deepEqual(sorted(session.desiredIds), ["a", "b"]);
});

test("时间页默认保留筛选外的已加入勾选", () => {
	const session = setRange(createSession(tasks, dateFields, new Set(["c"])), march);
	assert.deepEqual(ids(visibleTasks(session)), ["a", "b"]);
	assert.deepEqual(sorted(session.desiredIds), ["a", "b", "c"]);
});

test("标题页默认只勾选已加入任务，不自动勾选新任务", () => {
	const session = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	assert.deepEqual(ids(visibleTasks(session)), ["a", "b", "c"]);
	assert.deepEqual(sorted(session.desiredIds), ["b"]);
});

test("switchTab：时间页全选可见新增，标题页保留已加入", () => {
	const timed = setRange(createSession(tasks, dateFields, new Set(["b"])), march);
	assert.deepEqual(sorted(timed.desiredIds), ["a", "b"]);

	const title = switchTab(timed, "title");
	assert.equal(title.tab, "title");
	assert.deepEqual(sorted(title.desiredIds), ["b"]);
	assert.deepEqual(ids(visibleTasks(title)), ["a", "b", "c"]);

	const backToTime = switchTab(title, "time");
	assert.equal(backToTime.tab, "time");
	assert.deepEqual(sorted(backToTime.desiredIds), ["a", "b"]);
});

test("setQuery：保留已加入勾选，清空未提交的新增勾选", () => {
	let session = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	session = toggle(session, "a");
	assert.deepEqual(sorted(session.desiredIds), ["a", "b"]);

	const byKeyword = setQuery(session, "alpha");
	assert.deepEqual(sorted(byKeyword.desiredIds), ["b"]);
	assert.deepEqual(ids(visibleTasks(byKeyword)), ["a"]);

	const byTag = setQuery(session, "#work");
	assert.deepEqual(ids(visibleTasks(byTag)), ["a", "c"]);
});

test("pendingChanges：无变化时为空", () => {
	const session = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	assert.deepEqual(pendingChanges(session), { addedTasks: [], removeIds: [] });
});

test("pendingChanges：勾选新任务只产生新增", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set()), "title");
	const session = toggle(title, "c");
	const changes = pendingChanges(session);
	assert.deepEqual(ids(changes.addedTasks), ["c"]);
	assert.deepEqual(changes.removeIds, []);
});

test("pendingChanges：取消已加入任务只产生移除", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	const session = toggle(title, "b");
	const changes = pendingChanges(session);
	assert.deepEqual(changes.addedTasks, []);
	assert.deepEqual(changes.removeIds, ["b"]);
});

test("pendingChanges：同时新增与移除", () => {
	let session = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	session = toggle(session, "c");
	session = toggle(session, "b");
	const changes = pendingChanges(session);
	assert.deepEqual(ids(changes.addedTasks), ["c"]);
	assert.deepEqual(changes.removeIds, ["b"]);
});

test("pendingChanges：只提交当前可见任务的差异", () => {
	const timed = setRange(createSession(tasks, dateFields, new Set(["a", "c"])), march);
	assert.deepEqual(sorted(timed.desiredIds), ["a", "b", "c"]);
	assert.deepEqual(ids(visibleTasks(timed)), ["a", "b"]);

	let session = toggle(timed, "a");
	session = toggle(session, "b");
	const changes = pendingChanges(session);
	assert.deepEqual(changes.addedTasks, []);
	assert.deepEqual(changes.removeIds, ["a"]);
	// 筛选外的已加入任务保持勾选，不参与本次差异
	assert.equal(session.desiredIds.has("c"), true);
});

test("setAll：对当前可见任务整体勾选 / 取消，含已加入任务", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	const all = setAll(title, true);
	assert.deepEqual(sorted(all.desiredIds), ["a", "b", "c"]);
	assert.deepEqual(ids(pendingChanges(all).addedTasks), ["a", "c"]);
	assert.deepEqual(pendingChanges(all).removeIds, []);

	const none = setAll(all, false);
	assert.deepEqual(sorted(none.desiredIds), []);
	assert.deepEqual(pendingChanges(none).addedTasks, []);
	assert.deepEqual(pendingChanges(none).removeIds, ["b"]);
});

test("clearSelection：清空当前可见任务的勾选，含已加入任务", () => {
	const session = setRange(createSession(tasks, dateFields, new Set(["b"])), march);
	const cleared = clearSelection(session);
	assert.deepEqual(sorted(cleared.desiredIds), []);
	assert.deepEqual(pendingChanges(cleared).addedTasks, []);
	assert.deepEqual(pendingChanges(cleared).removeIds, ["b"]);
});

test("toggle：勾选与取消单个任务，且不改变原会话", () => {
	const title = setQuery(switchTab(createSession(tasks, dateFields, new Set()), "title"), "beta");
	const on = toggle(title, "b");
	assert.deepEqual(sorted(on.desiredIds), ["b"]);

	const off = toggle(on, "b");
	assert.deepEqual(sorted(off.desiredIds), []);
	assert.deepEqual(sorted(title.desiredIds), []);
});

test("visibleTasks：时间页按区间过滤、标题页按解析查询过滤", () => {
	const timed = setRange(createSession(tasks, dateFields, new Set()), {
		start: "2024-04-01",
		end: "2024-04-30",
	});
	assert.deepEqual(ids(visibleTasks(timed)), ["c"]);

	const title = switchTab(createSession(tasks, dateFields, new Set()), "title");
	assert.deepEqual(ids(visibleTasks(title)), ["a", "b", "c"]);

	const byContext = setQuery(title, "@home");
	assert.deepEqual(ids(visibleTasks(byContext)), ["b"]);
});

test("visibleTasks：排除已归档任务", () => {
	const archived = makeTask({ id: "z", title: "Archived", due: "2024-03-15", archived: true });
	const session = setRange(createSession([a, archived], dateFields, new Set()), march);
	assert.deepEqual(ids(visibleTasks(session)), ["a"]);
});

test("parsedQuery / isQueryEmpty：解析关键字、标签、上下文", () => {
	const session = setQuery(createSession(tasks, dateFields, new Set()), "#work @home alpha");
	assert.deepEqual(parsedQuery(session), { keywords: ["alpha"], tags: ["work"], contexts: ["home"] });
	assert.equal(isQueryEmpty(session), false);
	assert.equal(isQueryEmpty(setQuery(session, "   ")), true);
	assert.equal(isQueryEmpty(setQuery(session, "#")), true);
});

test("selectAllState：三态包含已加入任务", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	assert.deepEqual(selectAllState(title), { checked: false, indeterminate: true });
	assert.deepEqual(selectAllState(setAll(title, true)), { checked: true, indeterminate: false });
	assert.deepEqual(selectAllState(setAll(title, false)), { checked: false, indeterminate: false });
	assert.deepEqual(selectAllState(setQuery(title, "zzz")), { checked: false, indeterminate: false });
});

test("任何筛选转移都不会取消已加入任务", () => {
	let session = createSession(tasks, dateFields, new Set(["a", "b", "c"]));
	assert.deepEqual(sorted(session.desiredIds), ["a", "b", "c"]);

	session = setRange(session, march);
	assert.deepEqual(sorted(session.desiredIds), ["a", "b", "c"]);

	session = switchTab(session, "title");
	assert.deepEqual(sorted(session.desiredIds), ["a", "b", "c"]);

	session = setQuery(session, "alpha");
	assert.deepEqual(sorted(session.desiredIds), ["a", "b", "c"]);

	session = setRange(session, null);
	assert.deepEqual(sorted(session.desiredIds), ["a", "b", "c"]);
});

test("重新打开窗口：同一筛选下已加入任务仍可见且保持勾选", () => {
	// 第一次：本周没有已加入任务，默认全选并加入 a、b
	const first = setRange(createSession(tasks, dateFields, new Set()), march);
	const joined = new Set(ids(pendingChanges(first).addedTasks));
	assert.deepEqual([...joined].sort(), ["a", "b"]);

	// 再次打开：a、b 已成为「已加入」，同一筛选下仍应可见且勾选
	const reopened = setRange(createSession(tasks, dateFields, joined), march);
	assert.deepEqual(ids(visibleTasks(reopened)), ["a", "b"]);
	assert.deepEqual(sorted(reopened.desiredIds), ["a", "b"]);
	assert.deepEqual(pendingChanges(reopened), { addedTasks: [], removeIds: [] });
});

test("重新打开窗口：同一标题筛选下已加入任务仍可见且保持勾选", () => {
	// 第一次：按标题筛出 #work，全选后加入 a、c
	const first = setAll(
		setQuery(switchTab(createSession(tasks, dateFields, new Set()), "title"), "#work"),
		true
	);
	const joined = new Set(ids(pendingChanges(first).addedTasks));
	assert.deepEqual([...joined].sort(), ["a", "c"]);

	// 再次打开：同一查询下 a、c 已成为「已加入」，仍应可见且勾选
	const reopened = setQuery(
		switchTab(createSession(tasks, dateFields, joined), "title"),
		"#work"
	);
	assert.deepEqual(ids(visibleTasks(reopened)), ["a", "c"]);
	assert.deepEqual(sorted(reopened.desiredIds), ["a", "c"]);
	assert.deepEqual(pendingChanges(reopened), { addedTasks: [], removeIds: [] });
});

test("summarizeChanges：计数与空差异", () => {
	assert.deepEqual(
		summarizeChanges({ addedTasks: [a], removeIds: ["b"] }),
		{ added: 1, removed: 1, isEmpty: false }
	);
	assert.deepEqual(
		summarizeChanges({ addedTasks: [], removeIds: [] }),
		{ added: 0, removed: 0, isEmpty: true }
	);
});

test("joinedBadgeState：已加入 / 勾选四种组合", () => {
	const session = createSession(tasks, dateFields, new Set(["b"]));
	assert.equal(joinedBadgeState(session, "b"), "joined");
	assert.equal(joinedBadgeState(toggle(session, "b"), "b"), "removing");
	assert.equal(joinedBadgeState(session, "a"), "none");
	assert.equal(joinedBadgeState(toggle(session, "a"), "a"), "none");
});

test("joinedBadgeState：与 Tab 无关", () => {
	const time = setRange(createSession(tasks, dateFields, new Set(["b"])), march);
	const title = switchTab(time, "title");

	assert.equal(joinedBadgeState(time, "b"), "joined");
	assert.equal(joinedBadgeState(title, "b"), "joined");

	const timeOff = toggle(time, "b");
	const titleOff = toggle(title, "b");
	assert.equal(joinedBadgeState(timeOff, "b"), "removing");
	assert.equal(joinedBadgeState(titleOff, "b"), "removing");
});

test("hasDesiredVisible：当前可见任务是否仍有勾选", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	assert.equal(hasDesiredVisible(title), true);
	assert.equal(hasDesiredVisible(clearSelection(title)), false);

	const emptyRange = setRange(createSession(tasks, dateFields, new Set(["b"])), null);
	assert.equal(hasDesiredVisible(emptyRange), false);
});

test("连续转移序列", () => {
	let session = createSession(tasks, dateFields, new Set(["b"]));
	session = setRange(session, march);
	assert.deepEqual(sorted(session.desiredIds), ["a", "b"]);

	session = switchTab(session, "title");
	assert.deepEqual(sorted(session.desiredIds), ["b"]);

	session = setQuery(session, "#work");
	assert.deepEqual(ids(visibleTasks(session)), ["a", "c"]);

	session = toggle(session, "a");
	assert.deepEqual(sorted(session.desiredIds), ["a", "b"]);
	assert.deepEqual(ids(pendingChanges(session).addedTasks), ["a"]);

	session = clearSelection(session);
	assert.deepEqual(sorted(session.desiredIds), ["b"]);
	assert.deepEqual(pendingChanges(session), { addedTasks: [], removeIds: [] });
});
