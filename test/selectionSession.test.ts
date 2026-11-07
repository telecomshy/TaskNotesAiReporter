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
	toggleStatusClass,
	type SelectionFrame,
	type SelectionSession,
} from "../src/ui/selectionSession";
import { makeTask } from "./fakes/task";
import type { DateField, DateRange, StatusDefinition } from "../src/types";

const dateFields: DateField[] = ["due"];

const a = makeTask({ id: "a", title: "Alpha", due: "2024-03-05", tags: ["work"] });
const b = makeTask({ id: "b", title: "Beta", due: "2024-03-10", tags: ["home"], contexts: ["home"] });
const c = makeTask({ id: "c", title: "Gamma", due: "2024-04-01", tags: ["work/proj"] });
const tasks = [a, b, c];

const march: DateRange = { start: "2024-03-01", end: "2024-03-31" };
const april: DateRange = { start: "2024-04-01", end: "2024-04-30" };
const may: DateRange = { start: "2024-05-01", end: "2024-05-31" };

/** 状态目录（#75）：a/b/c 均为 open → 待办；状态筛选用例另有专属任务集。 */
const statusCatalog: StatusDefinition[] = [
	{ value: "open", statusClass: "todo" },
	{ value: "in-progress", statusClass: "in-progress" },
	{ value: "done", statusClass: "completed" },
];

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

/** 帧内一致性：行 ↔ 计数 ↔ 空态互洽。 */
function assertFrameConsistent(f: SelectionFrame): void {
	assert.equal(f.counts.matching, f.left.rows.length);
	assert.equal(f.counts.addable, f.left.rows.filter((row) => row.state === "addable").length);
	assert.equal(f.counts.joined, f.right.rows.length);
	// 全不选 = 不过滤：没有任务被状态筛选藏起
	if (f.filter.statusClasses.length === 0) assert.equal(f.counts.unknownHidden, 0);
	assert.equal(f.left.empty === null, f.left.rows.length > 0);
}

test("初值：帧呈现时间页、无区间、空报告集合", () => {
	// 旧用例的 session.tasks / session.dateFields 注入断言随句柄不透明退出 seam
	// （ADR-0023）：注入只能经行为观察，其余用例已覆盖。
	const f = frame(createSelectionSession(tasks, dateFields, statusCatalog));
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
	let session = preset(createSelectionSession(tasks, dateFields, statusCatalog), march);
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
	const base = switchTab(createSelectionSession(tasks, dateFields, statusCatalog), "title");
	assert.deepEqual(addableIds(frame(base)), ["a", "b", "c"]);
	assert.deepEqual(addableIds(frame(setQuery(base, "beta"))), ["b"]);
	assert.deepEqual(addableIds(frame(setQuery(base, "#work"))), ["a", "c"]);
	assert.deepEqual(addableIds(frame(setQuery(base, "@home"))), ["b"]);
});

test("加入：按加入顺序进入右栏，已加入行留在原位；重复加入无副作用", () => {
	let session = switchTab(createSelectionSession(tasks, dateFields, statusCatalog), "title");
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
	let session = switchTab(createSelectionSession(tasks, dateFields, statusCatalog), "title");
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
	let session = switchTab(createSelectionSession(tasks, dateFields, statusCatalog), "title");
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
	let session = createSelectionSession(tasks, dateFields, statusCatalog);
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
	let session = createSelectionSession(tasks, dateFields, statusCatalog);
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

	const title = setQuery(switchTab(createSelectionSession(tasks, dateFields, statusCatalog), "title"), "zzz");
	assert.equal(frame(title).left.empty, "no-match");

	const titleAll = switchTab(createSelectionSession(tasks, dateFields, statusCatalog), "title");
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
	const session = preset(createSelectionSession([a, archived], dateFields, statusCatalog), march);
	const f = frame(session);
	assert.deepEqual(rowIds(f), ["a"]);
	assert.deepEqual(addableIds(f), ["a"]);
});

test("标题查询解析经帧回显", () => {
	const session = setQuery(createSelectionSession(tasks, dateFields, statusCatalog), "#work @home alpha");
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
	const f = frame(preset(createSelectionSession(tasks, dateFields, statusCatalog), march));
	assert.equal(f.filter.rangeSource, "preset");
	assert.deepEqual(f.filter.range, march);
	assert.equal(f.filter.calendarSeed, null);
	assert.deepEqual(addableIds(f), ["a", "b"]);
});

test("回归：周期区间不回填日历；打开自定义时区间与左栏任务一起清空", () => {
	let session = preset(createSelectionSession(tasks, dateFields, statusCatalog), march);
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
	let session = custom(createSelectionSession(tasks, dateFields, statusCatalog), march);
	session = chooseRange(session, { kind: "open-custom" });
	const f = frame(session);
	assert.deepEqual(f.filter.range, march);
	assert.equal(f.filter.rangeSource, "custom");
	assert.deepEqual(f.filter.calendarSeed, march);
	assert.deepEqual(rowIds(f), ["a", "b"]);
});

test("自定义选日期：来源为 custom、日历回填；单日区间原样保留", () => {
	const day: DateRange = { start: "2024-03-05", end: "2024-03-05" };
	let session = custom(createSelectionSession(tasks, dateFields, statusCatalog), day);
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
	const session = chooseRange(custom(createSelectionSession(tasks, dateFields, statusCatalog), march), {
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
	let session = custom(createSelectionSession(tasks, dateFields, statusCatalog), march);
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
	const initial = createSelectionSession(tasks, dateFields, statusCatalog);
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
	const initial = createSelectionSession(tasks, dateFields, statusCatalog);
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

// ===== 状态筛选（#75 / ADR-0021） =====

const todoTask = makeTask({
	id: "t1",
	title: "Todo task",
	status: "open",
	due: "2024-03-05",
	tags: ["work"],
});
const doingTask = makeTask({
	id: "t2",
	title: "Doing task",
	status: "in-progress",
	due: "2024-03-10",
	tags: ["work"],
});
const doneTask = makeTask({
	id: "t3",
	title: "Done task",
	status: "done",
	due: "2024-03-15",
	tags: ["home"],
});
/** 悬空值：改状态值名后的残留，不在目录里 → 未知（ADR-0015 的牙）。 */
const danglingTask = makeTask({
	id: "t4",
	title: "Dangling task",
	status: "renamed-away",
	due: "2024-03-20",
	tags: ["home"],
});
const statusTasks = [todoTask, doingTask, doneTask, danglingTask];

test("状态筛选：初值全不选＝不过滤，帧回显空选中档；未知任务可见", () => {
	const f = frame(switchTab(createSelectionSession(statusTasks, dateFields, statusCatalog), "title"));
	assert.deepEqual(f.filter.statusClasses, []);
	assert.equal(f.counts.unknownHidden, 0);
	assert.deepEqual(rowIds(f), ["t1", "t2", "t3", "t4"]);
	assertFrameConsistent(f);
});

test("状态筛选：选「进行中」命中恰为进行中的任务，点掉即还原", () => {
	let session = toggleStatusClass(
		switchTab(createSelectionSession(statusTasks, dateFields, statusCatalog), "title"),
		"in-progress"
	);
	let f = frame(session);
	assert.deepEqual(f.filter.statusClasses, ["in-progress"]);
	assert.deepEqual(rowIds(f), ["t2"]);
	assert.equal(f.counts.unknownHidden, 1);
	assertFrameConsistent(f);

	// 再点一次已选档 = 取消，回到全量
	session = toggleStatusClass(session, "in-progress");
	f = frame(session);
	assert.deepEqual(f.filter.statusClasses, []);
	assert.deepEqual(rowIds(f), ["t1", "t2", "t3", "t4"]);
	assert.equal(f.counts.unknownHidden, 0);
	assertFrameConsistent(f);
});

test("状态筛选：待办＋已结束 = 两者并集，进行中与未知都不出现", () => {
	let session = switchTab(createSelectionSession(statusTasks, dateFields, statusCatalog), "title");
	session = toggleStatusClass(session, "todo");
	session = toggleStatusClass(session, "completed");
	const f = frame(session);
	assert.deepEqual(f.filter.statusClasses, ["todo", "completed"]);
	assert.deepEqual(rowIds(f), ["t1", "t3"]);
	assert.equal(f.counts.unknownHidden, 1);
	assertFrameConsistent(f);
});

test("状态筛选与区间、查询叠加为 AND；切页签保留选中档", () => {
	let session = switchTab(createSelectionSession(statusTasks, dateFields, statusCatalog), "title");
	session = toggleStatusClass(session, "todo");
	assert.deepEqual(addableIds(frame(session)), ["t1"]);

	// 与查询 AND：#home 里没有待办任务（t3 已结束、t4 未知）
	session = setQuery(session, "#home");
	assert.deepEqual(rowIds(frame(session)), []);

	// 切页签：选中档不丢，与区间继续 AND（march 命中全部四条，状态筛掉三条）
	session = switchTab(session, "time");
	assert.deepEqual(frame(session).filter.statusClasses, ["todo"]);
	session = preset(session, march);
	assert.deepEqual(rowIds(frame(session)), ["t1"]);

	// 回到标题页：查询与选中档都还在
	session = switchTab(session, "title");
	const f = frame(session);
	assert.deepEqual(f.filter.statusClasses, ["todo"]);
	assert.equal(f.filter.query, "#home");
	assert.deepEqual(rowIds(f), []);
});

test("状态筛选只改左栏：被筛掉的已加入任务留在右栏，顺序逐项不变", () => {
	let session = switchTab(createSelectionSession(statusTasks, dateFields, statusCatalog), "title");
	session = addTask(session, doingTask);
	session = addTask(session, todoTask);
	assert.deepEqual(joinedIds(frame(session)), ["t2", "t1"]);

	// 选「已结束」把两条已加入任务都筛出左栏
	session = toggleStatusClass(session, "completed");
	const f = frame(session);
	assert.deepEqual(joinedIds(f), ["t2", "t1"]);
	assert.deepEqual(rowIds(f), ["t3"]);
	assert.deepEqual(f.left.rows.map((row) => row.state), ["addable"]);
	assertFrameConsistent(f);
});

test("计数与「加入全部」严格跟随当前筛选：只带走命中中的可加入任务", () => {
	let session = switchTab(createSelectionSession(statusTasks, dateFields, statusCatalog), "title");
	session = toggleStatusClass(session, "todo");
	let f = frame(session);
	assert.equal(f.counts.matching, 1);
	assert.equal(f.counts.addable, 1);

	session = addAllAddable(session);
	f = frame(session);
	assert.deepEqual(joinedIds(f), ["t1"]);
	assert.equal(f.counts.addable, 0);

	// 点掉档位后，其余任务只是重新可见，报告集合不因此扩员
	session = toggleStatusClass(session, "todo");
	f = frame(session);
	assert.deepEqual(joinedIds(f), ["t1"]);
	assert.deepEqual(addableIds(f), ["t2", "t3", "t4"]);
	assertFrameConsistent(f);
});

test("只有一个转移改状态筛选：其余转移不触碰它；切换它也不碰别处", () => {
	let session = custom(createSelectionSession(statusTasks, dateFields, statusCatalog), march);
	session = addTask(session, todoTask);
	session = setQuery(session, "todo");
	session = toggleStatusClass(session, "todo");

	// 其余转移（切页签 / 改查询 / 加入 / 加入全部 / 移除 / 清空 / 改区间）不动选中档
	session = switchTab(session, "title");
	session = setQuery(session, "task");
	session = addTask(session, doingTask);
	session = addAllAddable(session);
	session = removeTask(session, todoTask.id);
	session = clearJoined(session);
	session = chooseRange(session, { kind: "clear" });
	assert.deepEqual(frame(session).filter.statusClasses, ["todo"]);

	// 切换状态筛选不动区间、查询与报告集合
	session = toggleStatusClass(session, "in-progress");
	const f = frame(session);
	assert.deepEqual(f.filter.statusClasses, ["todo", "in-progress"]);
	assert.equal(f.filter.query, "task");
	assert.equal(f.filter.rangeSource, null);
	assert.equal(f.filter.range, null);
	assert.deepEqual(joinedIds(f), []);
});

test("状态目录为空：全不选照常浏览；判定不回落到裸状态值名", () => {
	const session = switchTab(createSelectionSession(statusTasks, dateFields, []), "title");
	assert.deepEqual(rowIds(frame(session)), ["t1", "t2", "t3", "t4"]);
	assert.equal(frame(session).counts.unknownHidden, 0);

	// 目录为空 → 每条任务都是未知：选任一档无一命中，全部计入未显示
	// （若实现回落到值名匹配，"open" 会命中「待办」，此断言即失败）
	const filtered = toggleStatusClass(session, "todo");
	const f = frame(filtered);
	assert.deepEqual(rowIds(f), []);
	assert.equal(f.counts.unknownHidden, 4);
	assertFrameConsistent(f);
});

// ===== 第四 chip「已取消」（#76 / ADR-0027） =====

const cancelledTask = makeTask({
	id: "t5",
	title: "Cancelled task",
	status: "cancelled",
	due: "2024-03-25",
	tags: ["work"],
});
const cancelledStatusTasks = [...statusTasks, cancelledTask];
const cancelledCatalog: StatusDefinition[] = [
	...statusCatalog,
	{ value: "cancelled", statusClass: "cancelled" },
];

test("状态筛选：取消项不再混进「待办」；单选「已取消」恰命中取消项，点掉还原", () => {
	let session = switchTab(
		createSelectionSession(cancelledStatusTasks, dateFields, cancelledCatalog),
		"title"
	);
	// 「待办」不再吞下取消项（本票要修的口径失真）
	session = toggleStatusClass(session, "todo");
	assert.deepEqual(rowIds(frame(session)), ["t1"]);

	session = toggleStatusClass(session, "todo");
	session = toggleStatusClass(session, "cancelled");
	const f = frame(session);
	assert.deepEqual(f.filter.statusClasses, ["cancelled"]);
	assert.deepEqual(rowIds(f), ["t5"]);
	assert.equal(f.counts.unknownHidden, 1);
	assertFrameConsistent(f);

	// 再点一次 = 取消选中，回到全量
	session = toggleStatusClass(session, "cancelled");
	assert.deepEqual(rowIds(frame(session)), ["t1", "t2", "t3", "t4", "t5"]);
});

test("状态筛选：待办＋已取消组合；计数与「加入全部」跟随筛选，右栏不受影响", () => {
	let session = switchTab(
		createSelectionSession(cancelledStatusTasks, dateFields, cancelledCatalog),
		"title"
	);
	session = toggleStatusClass(session, "todo");
	session = toggleStatusClass(session, "cancelled");
	let f = frame(session);
	assert.deepEqual(f.filter.statusClasses, ["todo", "cancelled"]);
	assert.deepEqual(rowIds(f), ["t1", "t5"]);
	assert.equal(f.counts.matching, 2);
	assert.equal(f.counts.addable, 2);

	session = addAllAddable(session);
	f = frame(session);
	assert.deepEqual(joinedIds(f), ["t1", "t5"]);
	assert.equal(f.counts.addable, 0);

	// 点掉一档后其余任务只是重新可见，报告集合不因此扩员
	session = toggleStatusClass(session, "cancelled");
	f = frame(session);
	assert.deepEqual(joinedIds(f), ["t1", "t5"]);
	assert.deepEqual(addableIds(f), []); // 只剩「待办」在选，t1 已加入

	// 全不选 = 不过滤：五条全部可见，已加入的仍只在右栏
	session = toggleStatusClass(session, "todo");
	f = frame(session);
	assert.deepEqual(rowIds(f), ["t1", "t2", "t3", "t4", "t5"]);
	assert.deepEqual(addableIds(f), ["t2", "t3", "t4"]);
	assertFrameConsistent(f);
});
