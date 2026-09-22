import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clearSelection,
	createSession,
	isQueryEmpty,
	parsedQuery,
	selectAllState,
	selectedTasks,
	setAll,
	setQuery,
	setRange,
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

test("初值：时间页、无区间、空查询、无勾选", () => {
	const session = createSession(tasks, dateFields, new Set());
	assert.equal(session.tab, "time");
	assert.equal(session.range, null);
	assert.equal(session.query, "");
	assert.deepEqual(sorted(session.checked), []);
	assert.deepEqual(visibleTasks(session), []);
	assert.deepEqual(session.addableTasks, tasks);
	assert.equal(session.dateFields, dateFields);
});

test("createSession：可加入集合排除已加入路径", () => {
	const session = createSession(tasks, dateFields, new Set(["b"]));
	assert.deepEqual(ids(session.addableTasks), ["a", "c"]);
});

test("可见任务排除已加入：时间页与标题页一致", () => {
	const joined = new Set(["b"]);
	const timed = setRange(createSession(tasks, dateFields, joined), march);
	assert.deepEqual(ids(visibleTasks(timed)), ["a"]);

	const title = switchTab(createSession(tasks, dateFields, joined), "title");
	assert.deepEqual(ids(visibleTasks(title)), ["a", "c"]);
});

test("时间页默认全选排除已加入", () => {
	const session = setRange(createSession(tasks, dateFields, new Set(["a"])), march);
	assert.deepEqual(sorted(session.checked), ["b"]);
});

test("setAll 与三态排除已加入", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set(["b"])), "title");
	assert.deepEqual(ids(visibleTasks(title)), ["a", "c"]);

	const all = setAll(title, true);
	assert.deepEqual(sorted(all.checked), ["a", "c"]);
	assert.deepEqual(selectAllState(all), { checked: true, indeterminate: false });
});

test("selectedTasks 永不含已加入", () => {
	const title = setAll(switchTab(createSession(tasks, dateFields, new Set(["b"])), "title"), true);
	assert.deepEqual(ids(selectedTasks(title)), ["a", "c"]);
});

test("无已加入时可见全部", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set()), "title");
	assert.deepEqual(ids(visibleTasks(title)), ["a", "b", "c"]);
});

test("全部已加入时可见为空", () => {
	const joined = new Set(["a", "b", "c"]);
	const timed = setRange(createSession(tasks, dateFields, joined), march);
	assert.deepEqual(visibleTasks(timed), []);
	assert.deepEqual(selectAllState(timed), { checked: false, indeterminate: false });

	const title = switchTab(createSession(tasks, dateFields, joined), "title");
	assert.deepEqual(visibleTasks(title), []);
});

test("switchTab：时间页全选可见，标题页默认全不选", () => {
	const timed = setRange(createSession(tasks, dateFields, new Set()), march);
	assert.deepEqual(sorted(timed.checked), ["a", "b"]);

	const title = switchTab(timed, "title");
	assert.equal(title.tab, "title");
	assert.deepEqual(sorted(title.checked), []);
	assert.deepEqual(ids(visibleTasks(title)), ["a", "b", "c"]);

	const backToTime = switchTab(title, "time");
	assert.equal(backToTime.tab, "time");
	assert.deepEqual(sorted(backToTime.checked), ["a", "b"]);
});

test("setRange：重算可见并全选", () => {
	const session = setRange(createSession(tasks, dateFields, new Set()), march);
	assert.deepEqual(ids(visibleTasks(session)), ["a", "b"]);
	assert.deepEqual(sorted(session.checked), ["a", "b"]);
});

test("setRange：空区间无可见、无勾选", () => {
	const session = setRange(createSession(tasks, dateFields, new Set()), null);
	assert.deepEqual(visibleTasks(session), []);
	assert.deepEqual(sorted(session.checked), []);
});

test("setQuery：清空勾选并按标题维度过滤", () => {
	const title = switchTab(setRange(createSession(tasks, dateFields, new Set()), march), "title");
	const selected = toggle(title, "a");
	assert.deepEqual(sorted(selected.checked), ["a"]);

	const byKeyword = setQuery(selected, "alpha");
	assert.deepEqual(sorted(byKeyword.checked), []);
	assert.deepEqual(ids(visibleTasks(byKeyword)), ["a"]);

	const byTag = setQuery(title, "#work");
	assert.deepEqual(ids(visibleTasks(byTag)).sort(), ["a", "c"]);
});

test("toggle：勾选与取消单个任务，且不改变原会话", () => {
	const title = setQuery(switchTab(createSession(tasks, dateFields, new Set()), "title"), "beta");
	const on = toggle(title, "b");
	assert.deepEqual(sorted(on.checked), ["b"]);

	const off = toggle(on, "b");
	assert.deepEqual(sorted(off.checked), []);
	assert.deepEqual(sorted(title.checked), []);
});

test("setAll：对当前可见任务整体全选 / 取消", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set()), "title");
	const all = setAll(title, true);
	assert.deepEqual(sorted(all.checked), ["a", "b", "c"]);

	const none = setAll(all, false);
	assert.deepEqual(sorted(none.checked), []);

	const filtered = setAll(setQuery(title, "alpha"), true);
	assert.deepEqual(sorted(filtered.checked), ["a"]);
});

test("clearSelection：清空当前可见任务的勾选", () => {
	const session = clearSelection(setRange(createSession(tasks, dateFields, new Set()), march));
	assert.deepEqual(sorted(session.checked), []);
});

test("visibleTasks：时间页按区间过滤、标题页按解析查询过滤", () => {
	const timed = setRange(createSession(tasks, dateFields, new Set()), { start: "2024-04-01", end: "2024-04-30" });
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

test("selectAllState：三态", () => {
	const title = switchTab(createSession(tasks, dateFields, new Set()), "title");
	assert.deepEqual(selectAllState(title), { checked: false, indeterminate: false });
	assert.deepEqual(selectAllState(toggle(title, "a")), { checked: false, indeterminate: true });
	assert.deepEqual(selectAllState(setAll(title, true)), { checked: true, indeterminate: false });
	assert.deepEqual(selectAllState(setQuery(title, "zzz")), { checked: false, indeterminate: false });
});

test("selectedTasks：返回可见且已勾选的任务", () => {
	const title = setAll(switchTab(createSession(tasks, dateFields, new Set()), "title"), true);
	assert.deepEqual(ids(selectedTasks(title)), ["a", "b", "c"]);
	assert.deepEqual(ids(selectedTasks(toggle(title, "b"))), ["a", "c"]);
});

test("连续转移序列", () => {
	let session = createSession(tasks, dateFields, new Set());
	session = setRange(session, march);
	session = switchTab(session, "title");
	session = setQuery(session, "#work");
	session = toggle(session, "a");
	session = setAll(session, true);
	assert.deepEqual(sorted(session.checked), ["a", "c"]);

	session = clearSelection(session);
	assert.deepEqual(sorted(session.checked), []);

	session = switchTab(session, "time");
	assert.deepEqual(sorted(session.checked), ["a", "b"]);
});
