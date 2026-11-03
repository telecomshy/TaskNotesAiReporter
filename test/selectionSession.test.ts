import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addAllAddable,
	addTask,
	chooseRange,
	clearJoined,
	createSelectionSession,
	frame,
	removeTask,
	setQuery,
	switchTab,
	type SelectionFrame,
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

/** 快捷周期按钮的效果：区间来自预设。 */
function preset(session: SelectionSession, range: DateRange): SelectionSession {
	return chooseRange(session, { kind: "preset", range });
}

function custom(session: SelectionSession, range: DateRange): SelectionSession {
	return chooseRange(session, { kind: "custom", range });
}

function rowIds(f: SelectionFrame): string[] {
	return f.left.rows.map((row) => row.task.id);
}

function addableIds(f: SelectionFrame): string[] {
	return f.left.rows.filter((row) => row.state === "addable").map((row) => row.task.id);
}

function joinedIds(f: SelectionFrame): string[] {
	return f.right.rows.map((task) => task.id);
}

/** 帧内一致性：行 ↔ 计数 ↔ 空态互洽，「未知」预留位恒 0。 */
function assertFrameConsistent(f: SelectionFrame): void {
	assert.equal(f.counts.matching, f.left.rows.length);
	assert.equal(f.counts.addable, f.left.rows.filter((row) => row.state === "addable").length);
	assert.equal(f.counts.joined, f.right.rows.length);
	assert.equal(f.counts.unknownHidden, 0);
	assert.equal(f.left.empty === null, f.left.rows.length > 0);
}

test("初值：帧呈现时间页、无区间、空报告集合", () => {
	// 旧用例的 session.tasks / session.dateFields 注入断言随句柄不透明退出 seam
	// （ADR-0023）：注入只能经行为观察，其余用例已覆盖。
	const f = frame(createSelectionSession(tasks, dateFields));
	assert.equal(f.filter.tab, "time");
	assert.equal(f.filter.range, null);
	assert.equal(f.filter.rangeSource, null);
	assert.equal(f.filter.calendarSeed, null);
	assert.equal(f.filter.query, "");
	assert.deepEqual(f.filter.parsedQuery, { keywords: [], tags: [], contexts: [] });
	assert.deepEqual(f.left.rows, []);
	assert.equal(f.left.empty, "no-range");
	assert.deepEqual(f.counts, { matching: 0, addable: 0, joined: 0, unknownHidden: 0 });
	assert.deepEqual(f.right.rows, []);
	assertFrameConsistent(f);
});

test("时间筛选：命中区间任务，行标记区分可加入与已加入", () => {
	let session = preset(createSelectionSession(tasks, dateFields), march);
	let f = frame(session);
	assert.deepEqual(rowIds(f), ["a", "b"]);
	assert.deepEqual(addableIds(f), ["a", "b"]);
	assertFrameConsistent(f);

	session = addTask(session, a);
	f = frame(session);
	assert.deepEqual(rowIds(f), ["a", "b"]);
	assert.deepEqual(f.left.rows.map((row) => row.state), ["joined", "addable"]);
	assert.deepEqual(joinedIds(f), ["a"]);
	assertFrameConsistent(f);
});

test("标题筛选：关键字、标签、上下文", () => {
	const base = switchTab(createSelectionSession(tasks, dateFields), "title");
	assert.deepEqual(addableIds(frame(base)), ["a", "b", "c"]);
	assert.deepEqual(addableIds(frame(setQuery(base, "beta"))), ["b"]);
	assert.deepEqual(addableIds(frame(setQuery(base, "#work"))), ["a", "c"]);
	assert.deepEqual(addableIds(frame(setQuery(base, "@home"))), ["b"]);
});

test("加入：按加入顺序进入右栏，已加入行留在原位；重复加入无副作用", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = addTask(session, c);
	session = addTask(session, a);
	const f = frame(session);
	assert.deepEqual(joinedIds(f), ["c", "a"]);
	assert.deepEqual(addableIds(f), ["b"]);
	assert.deepEqual(rowIds(f), ["a", "b", "c"]);
	assert.deepEqual(f.left.rows.map((row) => row.state), ["joined", "addable", "joined"]);
	assertFrameConsistent(f);

	const again = addTask(session, c);
	assert.equal(again, session);
	assert.deepEqual(joinedIds(frame(again)), ["c", "a"]);
});

test("加入全部可见：只加入当前筛选结果中的可加入任务，按筛选顺序追加", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = setQuery(session, "#work");
	assert.deepEqual(addableIds(frame(session)), ["a", "c"]);

	session = addAllAddable(session);
	assert.deepEqual(joinedIds(frame(session)), ["a", "c"]);
	assert.deepEqual(addableIds(frame(session)), []);

	// 换查询后只出现新的可加入任务；全选不会重复加入已有任务
	session = setQuery(session, "");
	assert.deepEqual(addableIds(frame(session)), ["b"]);
	session = addAllAddable(session);
	assert.deepEqual(joinedIds(frame(session)), ["a", "c", "b"]);
	assertFrameConsistent(frame(session));
});

test("移除与清空：只作用于报告集合", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields), "title");
	session = addTask(addTask(session, a), b);
	session = removeTask(session, a.id);
	assert.deepEqual(joinedIds(frame(session)), ["b"]);
	assert.deepEqual(addableIds(frame(session)), ["a", "c"]);

	session = clearJoined(session);
	assert.deepEqual(joinedIds(frame(session)), []);
	assert.deepEqual(addableIds(frame(session)), ["a", "b", "c"]);
	assertFrameConsistent(frame(session));
});

test("筛选转移不改变报告集合：切 Tab / 改区间 / 改查询", () => {
	let session = createSelectionSession(tasks, dateFields);
	session = addTask(session, a);
	assert.deepEqual(joinedIds(frame(session)), ["a"]);

	session = switchTab(session, "title");
	assert.deepEqual(joinedIds(frame(session)), ["a"]);

	session = setQuery(session, "beta");
	assert.deepEqual(joinedIds(frame(session)), ["a"]);
	assert.deepEqual(addableIds(frame(session)), ["b"]);

	session = switchTab(session, "time");
	session = preset(session, april);
	assert.deepEqual(joinedIds(frame(session)), ["a"]);
	assert.deepEqual(addableIds(frame(session)), ["c"]);

	session = chooseRange(session, { kind: "clear" });
	assert.deepEqual(joinedIds(frame(session)), ["a"]);
	assert.deepEqual(addableIds(frame(session)), []);
});

test("空态原因：未选区间 / 无命中；全部已加入不算空态", () => {
	let session = createSelectionSession(tasks, dateFields);
	assert.equal(frame(session).left.empty, "no-range");

	session = preset(session, may);
	assert.equal(frame(session).left.empty, "no-match");

	session = preset(session, april);
	assert.equal(frame(session).left.empty, null);
	session = addAllAddable(session);
	const f = frame(session);
	assert.equal(f.left.empty, null);
	assert.deepEqual(rowIds(f), ["c"]);
	assert.deepEqual(addableIds(f), []);
	assertFrameConsistent(f);

	const title = setQuery(switchTab(createSelectionSession(tasks, dateFields), "title"), "zzz");
	assert.equal(frame(title).left.empty, "no-match");

	const titleAll = switchTab(createSelectionSession(tasks, dateFields), "title");
	assert.equal(frame(titleAll).left.empty, null);
	const joinedTitleAll = addAllAddable(titleAll);
	const f2 = frame(joinedTitleAll);
	assert.equal(f2.left.empty, null);
	assert.deepEqual(rowIds(f2), ["a", "b", "c"]);
	assert.deepEqual(f2.left.rows.map((row) => row.state), ["joined", "joined", "joined"]);
	assert.deepEqual(addableIds(f2), []);
	assertFrameConsistent(f2);
});

test("归档任务不进入筛选结果", () => {
	const archived = makeTask({ id: "z", title: "Archived", due: "2024-03-15", archived: true });
	const session = preset(createSelectionSession([a, archived], dateFields), march);
	const f = frame(session);
	assert.deepEqual(rowIds(f), ["a"]);
	assert.deepEqual(addableIds(f), ["a"]);
});

test("标题查询解析经帧回显", () => {
	const session = setQuery(createSelectionSession(tasks, dateFields), "#work @home alpha");
	assert.deepEqual(frame(session).filter.parsedQuery, {
		keywords: ["alpha"],
		tags: ["work"],
		contexts: ["home"],
	});
	assert.equal(frame(session).filter.query, "#work @home alpha");
	assert.deepEqual(frame(setQuery(session, "   ")).filter.parsedQuery, {
		keywords: [],
		tags: [],
		contexts: [],
	});
	assert.deepEqual(frame(setQuery(session, "#")).filter.parsedQuery, {
		keywords: [],
		tags: [],
		contexts: [],
	});
});

// ===== 筛选区间与来源（经帧回显） =====

test("周期快捷：区间生效、来源为 preset，日历初值为空", () => {
	const f = frame(preset(createSelectionSession(tasks, dateFields), march));
	assert.equal(f.filter.rangeSource, "preset");
	assert.deepEqual(f.filter.range, march);
	assert.equal(f.filter.calendarSeed, null);
	assert.deepEqual(addableIds(f), ["a", "b"]);
});

test("回归：周期区间不回填日历；打开自定义时区间与左栏任务一起清空", () => {
	let session = preset(createSelectionSession(tasks, dateFields), march);
	assert.deepEqual(rowIds(frame(session)), ["a", "b"]);

	session = chooseRange(session, { kind: "open-custom" });
	const f = frame(session);
	assert.equal(f.filter.range, null);
	assert.equal(f.filter.rangeSource, null);
	assert.equal(f.filter.calendarSeed, null);
	assert.deepEqual(f.left.rows, []);
	assert.equal(f.left.empty, "no-range");
	assertFrameConsistent(f);
});

test("回归：自定义区间重开时保留区间与左栏任务", () => {
	let session = custom(createSelectionSession(tasks, dateFields), march);
	session = chooseRange(session, { kind: "open-custom" });
	const f = frame(session);
	assert.deepEqual(f.filter.range, march);
	assert.equal(f.filter.rangeSource, "custom");
	assert.deepEqual(f.filter.calendarSeed, march);
	assert.deepEqual(rowIds(f), ["a", "b"]);
});

test("自定义选日期：来源为 custom、日历回填；单日区间原样保留", () => {
	const day: DateRange = { start: "2024-03-05", end: "2024-03-05" };
	let session = custom(createSelectionSession(tasks, dateFields), day);
	const f = frame(session);
	assert.equal(f.filter.rangeSource, "custom");
	assert.deepEqual(f.filter.range, day);
	assert.deepEqual(f.filter.calendarSeed, day);
	assert.deepEqual(rowIds(f), ["a"]);

	session = custom(session, march);
	const f2 = frame(session);
	assert.equal(f2.filter.rangeSource, "custom");
	assert.deepEqual(f2.filter.calendarSeed, march);
});

test("清空范围：区间与来源原子归零", () => {
	const session = chooseRange(custom(createSelectionSession(tasks, dateFields), march), {
		kind: "clear",
	});
	const f = frame(session);
	assert.equal(f.filter.range, null);
	assert.equal(f.filter.rangeSource, null);
	assert.equal(f.filter.calendarSeed, null);
	assert.deepEqual(f.left.rows, []);
	assertFrameConsistent(f);
});

test("其他转移不改变区间与来源：切 Tab / 改查询 / 加入 / 移除 / 清空", () => {
	let session = custom(createSelectionSession(tasks, dateFields), march);
	session = switchTab(session, "title");
	session = setQuery(session, "alpha");
	session = addTask(session, a);
	session = addAllAddable(session);
	session = removeTask(session, a.id);
	session = clearJoined(session);

	const f = frame(session);
	assert.equal(f.filter.rangeSource, "custom");
	assert.deepEqual(f.filter.range, march);
	assert.deepEqual(f.filter.calendarSeed, march);
});

test("不变式：区间与来源成对、日历仅 custom 回填", () => {
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
		const f = frame(session);
		assert.equal(f.filter.range === null, f.filter.rangeSource === null);
		assert.equal(f.filter.calendarSeed !== null, f.filter.rangeSource === "custom");
		assertFrameConsistent(f);
	}
});

test("无操作转移返回同一引用", () => {
	const initial = createSelectionSession(tasks, dateFields);
	assert.equal(switchTab(initial, "time"), initial);
	assert.equal(setQuery(initial, ""), initial);
	assert.equal(chooseRange(initial, { kind: "clear" }), initial);
	assert.equal(chooseRange(initial, { kind: "open-custom" }), initial);
	assert.equal(addAllAddable(initial), initial);
	assert.equal(removeTask(initial, "missing"), initial);
	assert.equal(clearJoined(initial), initial);

	const joined = addTask(initial, a);
	assert.equal(addTask(joined, a), joined);
	assert.equal(removeTask(joined, "missing"), joined);
	const emptied = removeTask(joined, a.id);
	assert.equal(clearJoined(emptied), emptied);

	const all = addAllAddable(switchTab(initial, "title"));
	assert.equal(addAllAddable(all), all);

	const customS = custom(initial, march);
	assert.equal(chooseRange(customS, { kind: "open-custom" }), customS);
});
