/**
 * 「选择任务」视图的特征测试（#115）：真实 TaskSelectionView + FakeEl，经界面事件驱动。
 *
 * 只钉「视图自己决定的事」：重绘范围、日历生命周期、焦点恢复、移动端 pane、空态与提示回显。
 * 组合规则（计数口径 / 加入全部集合 / 三维筛选叠加 / rangeSource ⟺ range）归 selectionSession.test.ts。
 *
 * 时钟：每个用例在构造视图前钉到 2024-03-15 12:00 本地，结束重置——
 * 快捷周期与日历初始月都在构造 / 渲染时按 `new Date()` 现算。
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { DateField, StatusDefinition, TaskInfo } from "../src/types";
import { FakeEl } from "./fakes/dom";
import { renderTaskSelectionHarness, type TaskSelectionHarness } from "./fakes/taskSelectionHarness";
import { makeTask } from "./fakes/task";

const FIXED_NOW = new Date(2024, 2, 15, 12, 0, 0).getTime();

const dateFields: DateField[] = ["due"];

const statuses: StatusDefinition[] = [
	{ value: "open", statusClass: "todo" },
	{ value: "in-progress", statusClass: "in-progress" },
	{ value: "done", statusClass: "completed" },
	{ value: "cancelled", statusClass: "cancelled" },
];

/** 2024 年 3 月：a / b 命中，c 在 4 月。 */
const marchTasks: TaskInfo[] = [
	makeTask({ id: "a", title: "Alpha", due: "2024-03-05" }),
	makeTask({ id: "b", title: "Beta", due: "2024-03-10" }),
	makeTask({ id: "c", title: "Gamma", due: "2024-04-01" }),
];

function withFixedClock<T>(fn: () => T): T {
	mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
	try {
		return fn();
	} finally {
		mock.timers.reset();
	}
}

function harness(tasks: TaskInfo[] = marchTasks): TaskSelectionHarness {
	return renderTaskSelectionHarness({ tasks, dateFields, statuses });
}

// ===== DOM 读法（只用 FakeEl 支持的类选择器） =====

function all(root: FakeEl, cls: string): FakeEl[] {
	return root.querySelectorAll(`.${cls}`);
}

/** 断言恰有一个，返回它。 */
function one(root: FakeEl, cls: string): FakeEl {
	const found = all(root, cls);
	assert.equal(found.length, 1, `期望恰有一个 .${cls}`);
	return found[0];
}

function first(root: FakeEl, cls: string): FakeEl {
	const found = all(root, cls)[0];
	assert.ok(found, `未找到 .${cls}`);
	return found;
}

function pane(root: FakeEl, side: "left" | "right"): FakeEl {
	return one(root, `tah-selection-${side}`);
}

function taskList(root: FakeEl, side: "left" | "right"): FakeEl {
	return one(pane(root, side), "tah-selection-list");
}

function actionRows(root: FakeEl, side: "left" | "right"): FakeEl[] {
	return taskList(root, side).querySelectorAll(".tah-task-action");
}

function joinedRows(root: FakeEl, side: "left" | "right"): FakeEl[] {
	return taskList(root, side).querySelectorAll(".tah-task-joined");
}

function rowTitle(row: FakeEl): string {
	return first(row, "tah-task-title").text;
}

function badgeOf(row: FakeEl): string | null {
	const found = row.querySelectorAll(".tah-task-joined-badge")[0];
	return found ? found.text : null;
}

function emptyText(root: FakeEl, side: "left" | "right"): string {
	return first(taskList(root, side), "tah-empty").text;
}

function rightTitle(root: FakeEl): string {
	const headers = all(pane(root, "right"), "tah-main-header");
	return headers[0].byTag("h3")[0].text;
}

function tabs(root: FakeEl): FakeEl[] {
	return one(root, "tah-picker-tabs").children;
}

function chips(root: FakeEl): FakeEl[] {
	return all(root, "tah-status-chip");
}

function mobileButtons(root: FakeEl): FakeEl[] {
	return one(root, "tah-selection-mobile-tabs").children;
}

function quickButton(root: FakeEl, label: string): FakeEl {
	const found = all(root, "tah-quick-btn").find((el) => el.text === label);
	assert.ok(found, `未找到快捷按钮「${label}」`);
	return found;
}

function calendarToggle(root: FakeEl): FakeEl {
	const found = all(root, "tah-quick-btn").find(
		(el) => el.getAttribute("aria-controls") === "tah-calendar-panel"
	);
	assert.ok(found, "未找到「自定义日期」按钮");
	return found;
}

function filterBlock(root: FakeEl): FakeEl {
	return one(root, "tah-picker-filter");
}

function rangeRow(root: FakeEl): FakeEl {
	return one(root, "tah-picker-range-row");
}

function rangeLabel(root: FakeEl): string {
	const row = rangeRow(root);
	const label = row.children.find((el) => el.classes.has("tah-range-label"));
	assert.ok(label, "未找到筛选区间文字");
	return label.text;
}

function clearRangeButton(root: FakeEl): FakeEl {
	return one(rangeRow(root), "tah-clear-range-btn");
}

function actions(root: FakeEl): FakeEl {
	return one(root, "tah-selection-actions");
}

function resultCount(root: FakeEl): string {
	return one(actions(root), "tah-range-label").text;
}

function addAllButton(root: FakeEl): FakeEl {
	return one(actions(root), "tah-secondary-btn");
}

function clearJoinedButton(root: FakeEl): FakeEl {
	return one(pane(root, "right"), "tah-secondary-btn");
}

function unknownHint(root: FakeEl): FakeEl {
	return one(root, "tah-unknown-hint");
}

function calendarContainer(root: FakeEl): FakeEl {
	return one(root, "tah-calendar-container");
}

function calendarHidden(root: FakeEl): boolean {
	return calendarContainer(root).hasClass("tah-hidden");
}

function selectedCells(root: FakeEl): FakeEl[] {
	return all(root, "tah-calendar-selected");
}

/** 日历网格：每次 `CalendarWidget.render()` 都是新对象（容器本身复用）。 */
function calendarGrid(root: FakeEl): FakeEl {
	return first(root, "tah-calendar-grid");
}

function dayCell(root: FakeEl, day: string): FakeEl {
	const found = all(root, "tah-calendar-cell")
		.filter((cell) => !cell.classes.has("tah-calendar-empty"))
		.find((cell) => cell.text === day);
	assert.ok(found, `未找到日历上的 ${day} 日`);
	return found;
}

function click(el: FakeEl): void {
	el.fire("click");
}

function pressKey(el: FakeEl, key: string): void {
	el.fire("keydown", { key, preventDefault() {} });
}

// ===== (a) 初值与移动端 pane =====

test("初值：时间页、无区间空态、日历收起、四档 chip 未按下、移动端停在筛选栏", () =>
	withFixedClock(() => {
		const h = harness();
		const root = h.root;

		const [timeTab, titleTab] = tabs(root);
		assert.equal(timeTab.text, h.t("taskSelection.tabTime"));
		assert.equal(titleTab.text, h.t("taskSelection.tabTitle"));
		assert.ok(timeTab.hasClass("tah-tab-active"));
		assert.ok(!titleTab.hasClass("tah-tab-active"));

		const statusChips = chips(root);
		assert.equal(statusChips.length, 4);
		for (const chip of statusChips) {
			assert.equal(chip.getAttribute("aria-pressed"), "false");
			assert.equal(chip.disabled, false);
		}

		assert.ok(mobileButtons(root)[0].hasClass("tah-tab-active"));
		assert.ok(!mobileButtons(root)[1].hasClass("tah-tab-active"));
		assert.ok(!pane(root, "left").hasClass("tah-selection-pane-hidden"));
		assert.ok(pane(root, "right").hasClass("tah-selection-pane-hidden"));

		assert.equal(emptyText(root, "left"), h.t("taskSelection.emptyPickRange"));
		assert.equal(emptyText(root, "right"), h.t("report.empty"));
		assert.equal(rangeLabel(root), h.t("taskSelection.noDate"));
		assert.ok(clearRangeButton(root).hasClass("tah-hidden"));

		assert.equal(calendarHidden(root), true);
		assert.equal(calendarToggle(root).getAttribute("aria-expanded"), "false");
		assert.equal(calendarToggle(root).text, h.t("taskSelection.customRange"));

		assert.equal(resultCount(root), h.t("taskSelection.resultCount", { total: 0, addable: 0 }));
		assert.equal(addAllButton(root).disabled, true);
		assert.equal(rightTitle(root), h.t("report.joinedTasks", { count: 0 }));
		assert.equal(clearJoinedButton(root).disabled, true);
	}));

test("状态目录为空：四档 chip 禁用但不隐藏", () =>
	withFixedClock(() => {
		const h = renderTaskSelectionHarness({ tasks: marchTasks, dateFields, statuses: [] });
		const statusChips = chips(h.root);
		assert.equal(statusChips.length, 4);
		for (const chip of statusChips) {
			assert.equal(chip.disabled, true);
			assert.equal(chip.getAttribute("aria-disabled"), "");
			assert.equal(chip.getAttribute("title"), h.t("taskSelection.statusFilterDisabled"));
		}
	}));

test("移动端页签：切到「已选」只换 pane 显隐与按下态", () =>
	withFixedClock(() => {
		const h = harness();
		click(mobileButtons(h.root)[1]);
		assert.ok(pane(h.root, "left").hasClass("tah-selection-pane-hidden"));
		assert.ok(!pane(h.root, "right").hasClass("tah-selection-pane-hidden"));
		assert.ok(!mobileButtons(h.root)[0].hasClass("tah-tab-active"));
		assert.ok(mobileButtons(h.root)[1].hasClass("tah-tab-active"));

		click(mobileButtons(h.root)[0]);
		assert.ok(!pane(h.root, "left").hasClass("tah-selection-pane-hidden"));
		assert.ok(pane(h.root, "right").hasClass("tah-selection-pane-hidden"));
	}));

// ===== (b) 七个转移经界面 =====

test("快捷周期：按下态、区间文字、左栏结果与计数一起回显", () =>
	withFixedClock(() => {
		const h = harness();
		const month = quickButton(h.root, h.t("taskSelection.quickThisMonth"));
		click(month);

		assert.equal(
			rangeLabel(h.root),
			h.t("taskSelection.currentFilter", { start: "2024-03-01", end: "2024-03-31" })
		);
		// 首个转移会整块重建筛选区（#117），按下态取重建后的按钮。
		const pressedMonth = quickButton(h.root, h.t("taskSelection.quickThisMonth"));
		assert.equal(pressedMonth.getAttribute("aria-pressed"), "true");
		assert.ok(pressedMonth.hasClass("tah-quick-btn-selected"));
		assert.ok(!clearRangeButton(h.root).hasClass("tah-hidden"));

		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta"]);
		assert.equal(resultCount(h.root), h.t("taskSelection.resultCount", { total: 2, addable: 2 }));
		assert.equal(addAllButton(h.root).text, h.t("taskSelection.addAll", { count: 2 }));
		assert.equal(addAllButton(h.root).disabled, false);

		assert.equal(calendarHidden(h.root), true);
	}));

test("加入 / 加入全部 / 移除 / 清空：标记、两栏与计数同步", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));

		click(actionRows(h.root, "left")[0]);
		assert.deepEqual(joinedRows(h.root, "left").map(rowTitle), ["Alpha"]);
		assert.equal(badgeOf(joinedRows(h.root, "left")[0]), h.t("taskSelection.joinedBadge"));
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Beta"]);
		assert.equal(resultCount(h.root), h.t("taskSelection.resultCount", { total: 2, addable: 1 }));
		assert.equal(addAllButton(h.root).text, h.t("taskSelection.addAll", { count: 1 }));
		assert.deepEqual(actionRows(h.root, "right").map(rowTitle), ["Alpha"]);
		assert.equal(rightTitle(h.root), h.t("report.joinedTasks", { count: 1 }));
		assert.equal(clearJoinedButton(h.root).disabled, false);
		assert.deepEqual(h.joinedIds(), ["a"]);

		click(addAllButton(h.root));
		assert.deepEqual(joinedRows(h.root, "left").map(rowTitle), ["Alpha", "Beta"]);
		assert.equal(actionRows(h.root, "left").length, 0);
		assert.equal(addAllButton(h.root).disabled, true);
		assert.equal(addAllButton(h.root).text, h.t("taskSelection.addAll", { count: 0 }));
		assert.deepEqual(actionRows(h.root, "right").map(rowTitle), ["Alpha", "Beta"]);
		assert.deepEqual(h.joinedIds(), ["a", "b"]);

		click(actionRows(h.root, "right")[1]);
		assert.deepEqual(actionRows(h.root, "right").map(rowTitle), ["Alpha"]);
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Beta"]);
		assert.deepEqual(joinedRows(h.root, "left").map(rowTitle), ["Alpha"]);
		assert.deepEqual(h.joinedIds(), ["a"]);

		click(clearJoinedButton(h.root));
		assert.equal(emptyText(h.root, "right"), h.t("report.empty"));
		assert.equal(rightTitle(h.root), h.t("report.joinedTasks", { count: 0 }));
		assert.equal(clearJoinedButton(h.root).disabled, true);
		assert.equal(joinedRows(h.root, "left").length, 0);
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta"]);
		assert.deepEqual(h.joinedIds(), []);
	}));

test("标题页：查询回显解析与清空按钮，切回时间页恢复区间", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		click(tabs(h.root)[1]);

		assert.equal(all(h.root, "tah-quick-row").length, 0);
		const input = first(h.root, "tah-search-input");
		assert.equal(input.value, "");
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta", "Gamma"]);

		input.value = "Alpha";
		input.fire("input");
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha"]);
		assert.equal(
			one(h.root, "tah-parse-label").text,
			h.t("taskSelection.parseKeywords", { value: "alpha" })
		);
		assert.ok(!one(h.root, "tah-parse-label").hasClass("tah-hidden"));
		assert.ok(!one(h.root, "tah-search-clear").hasClass("tah-hidden"));

		click(one(h.root, "tah-search-clear"));
		assert.equal(input.value, "");
		assert.equal(actionRows(h.root, "left").length, 3);
		assert.ok(one(h.root, "tah-parse-label").hasClass("tah-hidden"));
		assert.ok(one(h.root, "tah-search-clear").hasClass("tah-hidden"));

		click(tabs(h.root)[0]);
		assert.equal(
			rangeLabel(h.root),
			h.t("taskSelection.currentFilter", { start: "2024-03-01", end: "2024-03-31" })
		);
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta"]);
	}));

// ===== (c) 重绘决策 =====

test("已知偏差（#117）：setTasks 后首个转移整块重建筛选区", () =>
	withFixedClock(() => {
		const h = harness();
		const weekBefore = quickButton(h.root, h.t("taskSelection.quickThisWeek"));
		const calendarBefore = calendarGrid(h.root);
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		// setTasks 未把首帧存回 lastFrame，首个转移按「首次装配」全量重建。
		// 修好 #117 后本用例应变红，改为断言对象身份不变。
		assert.notStrictEqual(quickButton(h.root, h.t("taskSelection.quickThisWeek")), weekBefore);
		assert.notStrictEqual(calendarGrid(h.root), calendarBefore);
	}));

test("后续区间变化只刷新区间控件，不重建筛选区", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));

		const week = quickButton(h.root, h.t("taskSelection.quickThisWeek"));
		click(week);
		assert.strictEqual(quickButton(h.root, h.t("taskSelection.quickThisWeek")), week);
		assert.equal(
			rangeLabel(h.root),
			h.t("taskSelection.currentFilter", { start: "2024-03-11", end: "2024-03-17" })
		);
		assert.equal(week.getAttribute("aria-pressed"), "true");
		assert.equal(
			quickButton(h.root, h.t("taskSelection.quickThisMonth")).getAttribute("aria-pressed"),
			"false"
		);
	}));

test("切页签重建筛选区，区间与按下态随会话恢复", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		const weekBefore = quickButton(h.root, h.t("taskSelection.quickThisWeek"));

		click(tabs(h.root)[1]);
		assert.equal(all(h.root, "tah-quick-row").length, 0);
		assert.equal(first(h.root, "tah-search-input").value, "");

		click(tabs(h.root)[0]);
		assert.notStrictEqual(quickButton(h.root, h.t("taskSelection.quickThisWeek")), weekBefore);
		assert.equal(
			rangeLabel(h.root),
			h.t("taskSelection.currentFilter", { start: "2024-03-01", end: "2024-03-31" })
		);
		assert.equal(
			quickButton(h.root, h.t("taskSelection.quickThisMonth")).getAttribute("aria-pressed"),
			"true"
		);
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta"]);
	}));

test("改标题查询只刷新解析提示，搜索框与筛选区不重建", () =>
	withFixedClock(() => {
		const h = harness();
		click(tabs(h.root)[1]);

		const input = first(h.root, "tah-search-input");
		const parseLabel = one(h.root, "tah-parse-label");
		const alphaRow = actionRows(h.root, "left")[0];

		input.value = "Alpha";
		input.fire("input");

		assert.strictEqual(first(h.root, "tah-search-input"), input);
		assert.strictEqual(one(h.root, "tah-parse-label"), parseLabel);
		assert.equal(
			parseLabel.text,
			h.t("taskSelection.parseKeywords", { value: "alpha" })
		);
		assert.notStrictEqual(actionRows(h.root, "left")[0], alphaRow);
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha"]);
	}));

test("状态 chips 不重建，两栏行与列表内容每帧重建", () =>
	withFixedClock(() => {
		const h = harness();
		click(tabs(h.root)[1]);

		const chip = chips(h.root)[0];
		const alphaRow = actionRows(h.root, "left")[0];
		click(alphaRow);
		assert.strictEqual(chips(h.root)[0], chip);
		assert.ok(!actionRows(h.root, "left").includes(alphaRow));
		assert.deepEqual(joinedRows(h.root, "left").map(rowTitle), ["Alpha"]);

		const rightRow = actionRows(h.root, "right")[0];
		click(chip);
		assert.strictEqual(chips(h.root)[0], chip);
		assert.equal(chip.getAttribute("aria-pressed"), "true");
		assert.notStrictEqual(actionRows(h.root, "right")[0], rightRow);
	}));

// ===== (d) 焦点恢复 =====

test("键盘加入后焦点交给下一条可操作行", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		pressKey(actionRows(h.root, "left")[0], "Enter");

		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Beta"]);
		assert.equal(actionRows(h.root, "left")[0].focused, true);
		assert.deepEqual(h.joinedIds(), ["a"]);
	}));

test("空格键与回车键走同一焦点路径", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		pressKey(actionRows(h.root, "left")[0], " ");

		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Beta"]);
		assert.equal(actionRows(h.root, "left")[0].focused, true);
	}));

test("鼠标点击加入不抢焦点", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		click(actionRows(h.root, "left")[0]);

		assert.ok(actionRows(h.root, "left").every((row) => !row.focused));
	}));

test("焦点下标越界时钳到最后一条可操作行", () =>
	withFixedClock(() => {
		const h = harness();
		click(tabs(h.root)[1]);
		const rows = actionRows(h.root, "left");
		assert.equal(rows.length, 3);
		pressKey(rows[2], "Enter");

		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta"]);
		assert.equal(actionRows(h.root, "left")[1].focused, true);
	}));

// ===== (e) 日历生命周期 =====

test("快捷周期：日历收起并重建", () =>
	withFixedClock(() => {
		const h = harness();
		const before = calendarGrid(h.root);
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));

		assert.equal(calendarHidden(h.root), true);
		assert.equal(calendarToggle(h.root).getAttribute("aria-expanded"), "false");
		assert.notStrictEqual(calendarGrid(h.root), before);
	}));

test("清空区间：日历收起并重建，区间文字归零", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		const before = calendarGrid(h.root);
		click(clearRangeButton(h.root));

		assert.equal(rangeLabel(h.root), h.t("taskSelection.noDate"));
		assert.ok(clearRangeButton(h.root).hasClass("tah-hidden"));
		assert.equal(calendarHidden(h.root), true);
		assert.notStrictEqual(calendarGrid(h.root), before);
	}));

test("快捷区间上点「自定义」：日历选择被清，面板仍展开", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		click(calendarToggle(h.root));

		assert.equal(calendarToggle(h.root).getAttribute("aria-expanded"), "true");
		assert.ok(!calendarContainer(h.root).hasClass("tah-hidden"));
		assert.equal(calendarToggle(h.root).text, h.t("taskSelection.hideCalendar"));
		assert.equal(calendarToggle(h.root).getAttribute("aria-pressed"), "false");
		assert.equal(selectedCells(h.root).length, 0);
		assert.equal(rangeLabel(h.root), h.t("taskSelection.noDate"));
		assert.ok(clearRangeButton(h.root).hasClass("tah-hidden"));
	}));

test("日历内单击保持展开，自定义来源被高亮", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		click(calendarToggle(h.root));
		click(dayCell(h.root, "5"));

		assert.equal(calendarHidden(h.root), false);
		assert.equal(calendarToggle(h.root).getAttribute("aria-expanded"), "true");
		assert.equal(calendarToggle(h.root).getAttribute("aria-pressed"), "true");
		assert.equal(selectedCells(h.root).length, 1);
		assert.equal(
			rangeLabel(h.root),
			h.t("taskSelection.currentFilter", { start: "2024-03-05", end: "2024-03-05" })
		);
	}));

test("两次点击选完区间：收起面板并回显区间", () =>
	withFixedClock(() => {
		const h = harness();
		click(quickButton(h.root, h.t("taskSelection.quickThisMonth")));
		click(calendarToggle(h.root));
		click(dayCell(h.root, "5"));
		click(dayCell(h.root, "10"));

		assert.equal(calendarHidden(h.root), true);
		assert.equal(calendarToggle(h.root).getAttribute("aria-expanded"), "false");
		assert.equal(
			rangeLabel(h.root),
			h.t("taskSelection.currentFilter", { start: "2024-03-05", end: "2024-03-10" })
		);
		assert.equal(
			resultCount(h.root),
			h.t("taskSelection.resultCount", { total: 2, addable: 2 })
		);
	}));

// ===== (f) 空态与未知提示 =====

test("标题页无命中：空态说「没有任务」而不是「未选区间」", () =>
	withFixedClock(() => {
		const h = harness();
		click(tabs(h.root)[1]);
		const input = first(h.root, "tah-search-input");
		input.value = "zzz";
		input.fire("input");

		assert.equal(emptyText(h.root, "left"), h.t("taskSelection.emptyNoTasks"));
		assert.ok(!one(h.root, "tah-parse-label").hasClass("tah-hidden"));
	}));

test("状态筛选：chip 按下态与「另有 N 条状态未知」提示一起回显", () =>
	withFixedClock(() => {
		const h = renderTaskSelectionHarness({
			tasks: [
				...marchTasks,
				makeTask({ id: "d", title: "Delta", status: "mystery" }),
			],
			dateFields,
			statuses,
		});
		click(tabs(h.root)[1]);
		assert.equal(actionRows(h.root, "left").length, 4);

		const todoChip = chips(h.root)[0];
		click(todoChip);
		assert.strictEqual(chips(h.root)[0], todoChip);
		assert.equal(todoChip.getAttribute("aria-pressed"), "true");
		assert.deepEqual(actionRows(h.root, "left").map(rowTitle), ["Alpha", "Beta", "Gamma"]);
		assert.equal(
			unknownHint(h.root).text,
			h.t("taskSelection.unknownHidden", { count: 1 })
		);
		assert.ok(!unknownHint(h.root).hasClass("tah-hidden"));

		click(todoChip);
		assert.equal(todoChip.getAttribute("aria-pressed"), "false");
		assert.equal(actionRows(h.root, "left").length, 4);
		assert.ok(unknownHint(h.root).hasClass("tah-hidden"));
	}));


