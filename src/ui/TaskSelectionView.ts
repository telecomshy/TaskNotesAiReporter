/**
 * 生成报告主弹窗里的「选择任务」区：左栏筛选结果，右栏报告集合。
 *
 * 本类是渲染器 + 交互接线：选择规则由 selectionSession 拥有，重绘规则由 `render` 一处拥有（#96）。
 * 已加入的任务留在左栏筛选结果原位并带标记；右栏是唯一的移除入口。
 */

import { CalendarWidget } from "./Calendar";
import { renderTaskMeta } from "./taskMeta";
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
	type LeftEmptyReason,
	type RangePick,
	type SelectionFrame,
	type SelectionSession,
	type SelectionTab,
} from "./selectionSession";
import { getMonthRange, getQuarterRange, getWeekRange, getYearRange } from "../core/dates";
import type { StatusFilterClass } from "../core/status";
import type { DateField, DateRange, StatusDefinition, TaskInfo } from "../types";
import type { UiLanguage, Translator } from "../i18n";

export interface TaskSelectionViewOptions {
	container: HTMLElement;
	dateFields: readonly DateField[];
	/** 状态目录（与报告生成同一来源，ADR-0021）：chips 判定与禁用的依据。 */
	statuses: readonly StatusDefinition[];
	weekStartsOnMonday: boolean;
	t: Translator;
	lang: UiLanguage;
}

type MobilePane = "filter" | "joined";

export class TaskSelectionView {
	private session: SelectionSession | null = null;
	/** 上一帧：重绘规则的唯一依据（null = 首次装配）。 */
	private lastFrame: SelectionFrame | null = null;

	private readonly leftEl: HTMLElement;
	private readonly rightEl: HTMLElement;
	private readonly timeTabBtn: HTMLButtonElement;
	private readonly titleTabBtn: HTMLButtonElement;
	private readonly filterEl: HTMLElement;
	private readonly statusRowEl: HTMLElement;
	/** 状态筛选 chips（三档固定，跨页签恒定）：按下态经帧回显刷新。 */
	private readonly statusChips: Array<{
		el: HTMLButtonElement;
		statusClass: StatusFilterClass;
		hintKey: string;
	}>;
	private readonly leftListEl: HTMLElement;
	private readonly unknownHintEl: HTMLElement;
	private readonly rightListEl: HTMLElement;
	private readonly resultCountEl: HTMLElement;
	private readonly addAllBtn: HTMLButtonElement;
	private readonly rightTitleEl: HTMLElement;
	private readonly clearBtn: HTMLButtonElement;
	private readonly mobileFilterBtn: HTMLButtonElement;
	private readonly mobileJoinedBtn: HTMLButtonElement;

	private rangeLabelEl: HTMLElement | null = null;
	private calendarToggleBtn: HTMLButtonElement | null = null;
	private clearRangeBtn: HTMLButtonElement | null = null;
	private presetButtons: Array<{ el: HTMLButtonElement; range: DateRange }> = [];
	private parseLabelEl: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private clearSearchBtn: HTMLButtonElement | null = null;
	private calendar: CalendarWidget | null = null;
	private calendarContainer: HTMLElement | null = null;
	/** 自定义日期面板是否展开（视图交互状态，不进 session）。 */
	private calendarOpen = false;
	private mobilePane: MobilePane = "filter";

	constructor(private readonly options: TaskSelectionViewOptions) {
		const { container, t } = options;
		container.empty();
		container.addClass("tah-selection-body");

		const mobileTabs = container.createDiv({ cls: "tah-selection-mobile-tabs" });
		this.mobileFilterBtn = mobileTabs.createEl("button", {
			text: t("taskSelection.filterTab"),
			cls: "tah-tab-btn",
		});
		this.mobileJoinedBtn = mobileTabs.createEl("button", {
			text: t("taskSelection.joinedPane", { count: 0 }),
			cls: "tah-tab-btn",
		});
		this.mobileFilterBtn.addEventListener("click", () => this.setMobilePane("filter"));
		this.mobileJoinedBtn.addEventListener("click", () => this.setMobilePane("joined"));

		const layoutEl = container.createDiv({ cls: "tah-selection-layout" });

		this.leftEl = layoutEl.createDiv({ cls: "tah-selection-pane tah-selection-left" });
		const leftHeader = this.leftEl.createDiv({ cls: "tah-main-header" });
		leftHeader.createEl("h3", { text: t("taskSelection.title") });

		const tabBar = this.leftEl.createDiv({ cls: "tah-tab-bar tah-picker-tabs" });
		this.timeTabBtn = tabBar.createEl("button", {
			text: t("taskSelection.tabTime"),
			cls: "tah-tab-btn",
		});
		this.titleTabBtn = tabBar.createEl("button", {
			text: t("taskSelection.tabTitle"),
			cls: "tah-tab-btn",
		});
		this.timeTabBtn.addEventListener("click", () => this.changeTab("time"));
		this.titleTabBtn.addEventListener("click", () => this.changeTab("title"));

		// 状态筛选 chips 行：页签栏之下、各页专属筛选控件之上，跨页签恒定、切换不重建
		// （ADR-0021：位置本身表达「共享维度」的语义）。档位与折叠规则见 ADR-0015。
		this.statusRowEl = this.leftEl.createDiv({
			cls: "tah-status-row",
			attr: { role: "group", "aria-label": t("taskSelection.statusFilterGroup") },
		});
		const chipSpecs: Array<{
			statusClass: StatusFilterClass;
			labelKey: string;
			hintKey: string;
		}> = [
			{
				statusClass: "todo",
				labelKey: "taskSelection.statusFilterTodo",
				hintKey: "taskSelection.statusFilterTodoHint",
			},
			{
				statusClass: "in-progress",
				labelKey: "taskSelection.statusFilterInProgress",
				hintKey: "taskSelection.statusFilterInProgressHint",
			},
			{
				statusClass: "completed",
				labelKey: "taskSelection.statusFilterCompleted",
				hintKey: "taskSelection.statusFilterCompletedHint",
			},
		];
		this.statusChips = chipSpecs.map((spec) => {
			const el = this.statusRowEl.createEl("button", {
				text: t(spec.labelKey),
				cls: "tah-status-chip",
			});
			el.addEventListener("click", () =>
				this.update((session) => toggleStatusClass(session, spec.statusClass))
			);
			return { el, statusClass: spec.statusClass, hintKey: spec.hintKey };
		});

		this.filterEl = this.leftEl.createDiv({ cls: "tah-picker-filter" });
		const actions = this.leftEl.createDiv({ cls: "tah-picker-actions tah-selection-actions" });
		this.resultCountEl = actions.createDiv({ cls: "tah-range-label" });
		this.addAllBtn = actions.createEl("button", {
			cls: "tah-secondary-btn",
			text: t("taskSelection.addAll", { count: 0 }),
		});
		this.addAllBtn.addEventListener("click", () => this.update(addAllAddable));
		this.leftListEl = this.leftEl.createDiv({ cls: "tah-task-list tah-selection-list" });
		// 「另有 N 条状态未知的任务未显示」提示条：列表底部的弱提示，仅在有任务被藏起时出现
		this.unknownHintEl = this.leftEl.createDiv({ cls: "tah-unknown-hint tah-hidden" });

		this.rightEl = layoutEl.createDiv({ cls: "tah-selection-pane tah-selection-right" });
		const rightHeader = this.rightEl.createDiv({ cls: "tah-main-header" });
		this.rightTitleEl = rightHeader.createEl("h3", {
			text: t("report.joinedTasks", { count: 0 }),
		});
		this.clearBtn = rightHeader.createEl("button", {
			text: t("report.clear"),
			cls: "tah-secondary-btn",
		});
		this.clearBtn.addEventListener("click", () => this.update(clearJoined));
		this.rightListEl = this.rightEl.createDiv({ cls: "tah-task-list tah-selection-list" });

		this.setMobilePane("filter");
	}

	/** 注入任务快照并回到初始状态。 */
	setTasks(tasks: TaskInfo[]): void {
		this.session = createSelectionSession(tasks, this.options.dateFields, this.options.statuses);
		this.lastFrame = null;
		this.render(frame(this.session), null);
	}

	/** 右栏当前集合，供生成报告读取。 */
	getJoinedTasks(): TaskInfo[] {
		return this.session ? frame(this.session).right.rows : [];
	}

	// ===== 状态推进 =====

	/**
	 * 所有转移的唯一入口：无操作不重绘；有变化则存帧、按上一帧派生重绘范围。
	 * 返回新帧（交互处需要，如重置日历）；无操作为 null。
	 */
	private apply(next: SelectionSession): SelectionFrame | null {
		if (!this.session || next === this.session) return null;
		this.session = next;
		const prev = this.lastFrame;
		const f = frame(next);
		this.lastFrame = f;
		this.render(f, prev);
		return f;
	}

	private update(transition: (session: SelectionSession) => SelectionSession): void {
		if (!this.session) return;
		this.apply(transition(this.session));
	}

	private applyQuery(value: string): void {
		if (!this.session) return;
		if (this.searchInput) this.searchInput.value = value;
		this.apply(setQuery(this.session, value));
	}

	private changeTab(tab: SelectionTab): void {
		if (!this.session) return;
		this.apply(switchTab(this.session, tab));
	}

	private setMobilePane(pane: MobilePane): void {
		this.mobilePane = pane;
		this.leftEl.toggleClass("tah-selection-pane-hidden", pane !== "filter");
		this.rightEl.toggleClass("tah-selection-pane-hidden", pane !== "joined");
		this.mobileFilterBtn.toggleClass("tah-tab-active", pane === "filter");
		this.mobileJoinedBtn.toggleClass("tah-tab-active", pane === "joined");
	}

	// ===== 渲染 =====

	/**
	 * 唯一的重绘规则：切页签重建筛选区；时间页仅区间变化时更新区间控件；
	 * 标题页仅查询变化时更新解析提示；状态 chips、动作区、未知提示条与两栏每帧刷新。
	 * 日历的**重置**不在此处——那是交互来源的知识（快捷/清空要重置，日历内选择不能重置，
	 * 否则两次点击的起点会丢），见 applyRangePick 与日历回调。
	 */
	private render(f: SelectionFrame, prev: SelectionFrame | null): void {
		if (!prev || prev.filter.tab !== f.filter.tab) {
			this.renderFilter(f);
		} else if (f.filter.tab === "time") {
			if (
				!sameRange(prev.filter.range, f.filter.range) ||
				prev.filter.rangeSource !== f.filter.rangeSource
			) {
				this.updateRangeButtons(f);
				this.updateRangeLabel(f);
			}
		} else if (prev.filter.query !== f.filter.query) {
			this.updateTitleMeta(f);
		}
		this.renderStatusChips(f);
		this.renderActions(f);
		this.renderLeftList(f);
		this.renderUnknownHint(f);
		this.renderRightList(f);
	}

	/**
	 * 状态筛选 chips：按下态来自帧回显（aria-pressed 与选中态一致），
	 * 禁用态来自状态目录（目录为空 → 三档禁用不隐藏，防布局跳动，ADR-0021）。
	 */
	private renderStatusChips(f: SelectionFrame): void {
		const disabled = this.options.statuses.length === 0;
		for (const chip of this.statusChips) {
			const selected = f.filter.statusClasses.includes(chip.statusClass);
			chip.el.toggleClass("tah-status-chip-selected", selected);
			chip.el.setAttr("aria-pressed", String(selected));
			chip.el.disabled = disabled;
			chip.el.toggleAttribute("aria-disabled", disabled);
			chip.el.setAttr(
				"title",
				disabled
					? this.options.t("taskSelection.statusFilterDisabled")
					: this.options.t(chip.hintKey)
			);
		}
	}

	/** 「另有 N 条状态未知的任务未显示」：N > 0 且选中任一档时出现的弱提示条。 */
	private renderUnknownHint(f: SelectionFrame): void {
		this.unknownHintEl.setText(
			this.options.t("taskSelection.unknownHidden", { count: f.counts.unknownHidden })
		);
		this.unknownHintEl.toggleClass("tah-hidden", f.counts.unknownHidden === 0);
	}

	private renderActions(f: SelectionFrame): void {
		const { matching, addable, joined } = f.counts;
		this.resultCountEl.setText(
			this.options.t("taskSelection.resultCount", { total: matching, addable })
		);
		this.addAllBtn.setText(this.options.t("taskSelection.addAll", { count: addable }));
		this.addAllBtn.disabled = addable === 0;
		this.rightTitleEl.setText(this.options.t("report.joinedTasks", { count: joined }));
		this.clearBtn.disabled = joined === 0;
		this.mobileJoinedBtn.setText(
			this.options.t("taskSelection.joinedPane", { count: joined })
		);
		this.timeTabBtn.toggleClass("tah-tab-active", f.filter.tab === "time");
		this.titleTabBtn.toggleClass("tah-tab-active", f.filter.tab === "title");
	}

	private renderLeftList(f: SelectionFrame): void {
		this.leftListEl.empty();

		if (f.left.empty) {
			this.leftListEl.createDiv({
				text: this.emptyText(f.left.empty),
				cls: "tah-empty",
			});
			return;
		}

		let actionIndex = 0;
		for (const row of f.left.rows) {
			const task = row.task;
			if (row.state === "joined") {
				// 已加入项留在筛选结果原位，只加标记；不可点、不可聚焦、无手型
				const item = this.leftListEl.createDiv({ cls: "tah-task-item tah-task-joined" });
				item.setAttr("title", this.options.t("taskSelection.joinedHint"));
				this.renderTaskInfo(item, task);
				item.createSpan({
					cls: "tah-task-joined-badge",
					text: this.options.t("taskSelection.joinedBadge"),
				});
				continue;
			}

			const index = actionIndex++;
			this.createActionRow(
				this.leftListEl,
				task,
				this.options.t("taskSelection.addAria", { title: task.title }),
				"＋",
				(refocus) => {
					this.update((session) => addTask(session, task));
					if (refocus) this.focusRowAt(this.leftListEl, index);
				}
			);
		}
	}

	private renderRightList(f: SelectionFrame): void {
		this.rightListEl.empty();

		const tasks = f.right.rows;
		if (tasks.length === 0) {
			this.rightListEl.createDiv({
				text: this.options.t("report.empty"),
				cls: "tah-empty",
			});
			return;
		}

		for (const [index, task] of tasks.entries()) {
			this.createActionRow(
				this.rightListEl,
				task,
				this.options.t("report.removeAria", { title: task.title }),
				"－",
				(refocus) => {
					this.update((session) => removeTask(session, task.id));
					if (refocus) this.focusRowAt(this.rightListEl, index);
				}
			);
		}
	}

	private renderTaskInfo(parent: HTMLElement, task: TaskInfo): void {
		const info = parent.createDiv({ cls: "tah-task-info" });
		info.createDiv({ cls: "tah-task-title", text: task.title });
		renderTaskMeta(info, task, this.options.t);
	}

	/** 可点击的任务行：点击 / Enter / Space 触发同一动作，行尾给出动作提示。 */
	private createActionRow(
		parent: HTMLElement,
		task: TaskInfo,
		ariaLabel: string,
		hintText: string,
		activate: (refocus: boolean) => void
	): void {
		const item = parent.createDiv({ cls: "tah-task-item tah-task-action" });
		item.setAttr("role", "button");
		item.setAttr("tabindex", "0");
		item.setAttr("aria-label", ariaLabel);

		item.addEventListener("click", () => activate(false));
		item.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			activate(true);
		});

		this.renderTaskInfo(item, task);
		const hint = item.createSpan({ cls: "tah-task-action-hint", text: hintText });
		hint.setAttr("aria-hidden", "true");
	}

	/** 键盘触发后把焦点交给下一条可操作行；越界时取最后一条。 */
	private focusRowAt(listEl: HTMLElement, index: number): void {
		const rows = listEl.querySelectorAll<HTMLElement>(".tah-task-action");
		if (rows.length === 0) return;
		rows[Math.min(index, rows.length - 1)]?.focus();
	}

	private emptyText(reason: Exclude<LeftEmptyReason, null>): string {
		switch (reason) {
			case "no-range":
				return this.options.t("taskSelection.emptyPickRange");
			case "no-match":
				return this.options.t("taskSelection.emptyNoTasks");
		}
	}

	// ===== 筛选区 =====

	private renderFilter(f: SelectionFrame): void {
		this.filterEl.empty();
		this.calendar = null;
		this.calendarContainer = null;
		this.calendarOpen = false;
		this.rangeLabelEl = null;
		this.calendarToggleBtn = null;
		this.clearRangeBtn = null;
		this.presetButtons = [];
		this.parseLabelEl = null;
		this.searchInput = null;
		this.clearSearchBtn = null;

		if (f.filter.tab === "time") this.renderTimeFilter(f);
		else this.renderTitleFilter(f);
	}

	private renderTimeFilter(f: SelectionFrame): void {
		const t = this.options.t;

		const quickRow = this.filterEl.createDiv({ cls: "tah-quick-row" });
		const quickButtons: Array<{ label: string; range: DateRange }> = [
			{
				label: t("taskSelection.quickThisWeek"),
				range: getWeekRange(new Date(), this.options.weekStartsOnMonday),
			},
			{ label: t("taskSelection.quickThisMonth"), range: getMonthRange(new Date()) },
			{ label: t("taskSelection.quickThisQuarter"), range: getQuarterRange(new Date()) },
			{ label: t("taskSelection.quickThisYear"), range: getYearRange(new Date()) },
		];
		for (const btn of quickButtons) {
			const el = quickRow.createEl("button", { text: btn.label, cls: "tah-quick-btn" });
			this.presetButtons.push({ el, range: btn.range });
			el.addEventListener("click", () =>
				this.applyRangePick({ kind: "preset", range: btn.range })
			);
		}

		// 自定义日期与周期快捷同属「选区间」，放在同一行
		this.calendarToggleBtn = quickRow.createEl("button", {
			text: t("taskSelection.customRange"),
			cls: "tah-quick-btn",
		});
		this.calendarToggleBtn.setAttr("aria-controls", "tah-calendar-panel");
		this.calendarToggleBtn.addEventListener("click", () => {
			const open = !this.calendarOpen;
			if (open && this.session) {
				// 打开自定义：周期快捷来源的区间不再占用任务列表，日历与列表一起清空；
				// 自定义来源的区间保留，避免重复挑选。
				const f = this.apply(chooseRange(this.session, { kind: "open-custom" }));
				if (f) this.calendar?.clearRange();
			}
			this.setCalendarOpen(open);
		});

		const rangeRow = this.filterEl.createDiv({ cls: "tah-picker-range-row" });
		this.rangeLabelEl = rangeRow.createDiv({ cls: "tah-range-label" });
		this.clearRangeBtn = rangeRow.createEl("button", {
			text: t("taskSelection.clearRange"),
			cls: "tah-clear-range-btn",
		});
		this.clearRangeBtn.addEventListener("click", () =>
			this.applyRangePick({ kind: "clear" })
		);
		this.updateRangeLabel(f);
		this.updateRangeButtons(f);

		this.calendarContainer = this.filterEl.createDiv({ cls: "tah-calendar-container" });
		this.calendarContainer.id = "tah-calendar-panel";
		this.setCalendarOpen(false);
		this.renderCalendar(f.filter.calendarSeed);
	}

	/**
	 * 应用一次区间选择（快捷 / 清空）：重绘由 `apply` 派生，日历恢复到当前区间并收起。
	 * 快捷周期与清空都不预选自定义日历。
	 */
	private applyRangePick(pick: RangePick): void {
		if (!this.session) return;
		const f = this.apply(chooseRange(this.session, pick));
		if (!f) return;
		this.renderCalendar(f.filter.calendarSeed);
		this.setCalendarOpen(false);
	}

	/** 按区间来源高亮当前选中的快捷按钮；展开态由 setCalendarOpen 单独处理。 */
	private updateRangeButtons(f: SelectionFrame): void {
		const range = f.filter.range;
		for (const { el, range: presetRange } of this.presetButtons) {
			const selected = f.filter.rangeSource === "preset" && sameRange(range, presetRange);
			el.toggleClass("tah-quick-btn-selected", selected);
			el.setAttr("aria-pressed", String(selected));
		}
		const customSelected = f.filter.rangeSource === "custom";
		this.calendarToggleBtn?.toggleClass("tah-quick-btn-selected", customSelected);
		this.calendarToggleBtn?.setAttr("aria-pressed", String(customSelected));
	}

	/** 展开 / 收起自定义日期面板；快捷按钮始终可见。 */
	private setCalendarOpen(open: boolean): void {
		this.calendarOpen = open;
		this.calendarContainer?.toggleClass("tah-hidden", !open);
		this.calendarContainer?.setAttr("aria-hidden", String(!open));
		if (this.calendarToggleBtn) {
			this.calendarToggleBtn.setText(
				this.options.t(open ? "taskSelection.hideCalendar" : "taskSelection.customRange")
			);
			this.calendarToggleBtn.toggleClass("tah-quick-btn-open", open);
			this.calendarToggleBtn.setAttr("aria-expanded", String(open));
		}
	}

	private updateRangeLabel(f: SelectionFrame): void {
		if (!this.rangeLabelEl) return;
		const range = f.filter.range;
		this.clearRangeBtn?.toggleClass("tah-hidden", range === null);
		if (range === null) {
			this.rangeLabelEl.setText(this.options.t("taskSelection.noDate"));
			return;
		}
		this.rangeLabelEl.setText(
			this.options.t("taskSelection.currentFilter", {
				start: range.start,
				end: range.end,
			})
		);
	}

	private renderCalendar(initialRange: DateRange | null): void {
		if (!this.calendarContainer || !this.session) return;
		this.calendarContainer.empty();
		this.calendar = new CalendarWidget(
			this.calendarContainer,
			this.options.weekStartsOnMonday,
			this.options.t,
			this.options.lang,
			initialRange,
			(range, complete) => {
				if (!range || !this.session) return;
				const f = this.apply(chooseRange(this.session, { kind: "custom", range }));
				if (!f) return;
				// 不重置日历：两次点击的起点由组件自己保留，重建会丢。
				// 两次点击选完区间才收起；单击只是单日区间，可能还在选起点。
				if (complete) this.setCalendarOpen(false);
			}
		);
		this.calendar.render();
	}

	private renderTitleFilter(f: SelectionFrame): void {
		const t = this.options.t;

		const searchRow = this.filterEl.createDiv({ cls: "tah-search-row" });
		this.searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: t("taskSelection.searchPlaceholder"),
			cls: "tah-search-input",
		});
		this.searchInput.value = f.filter.query;
		this.searchInput.addEventListener("input", () => {
			if (this.searchInput) this.applyQuery(this.searchInput.value);
		});

		this.clearSearchBtn = searchRow.createEl("button", {
			cls: "tah-search-clear",
			text: "×",
			attr: { "aria-label": t("taskSelection.clearSearch") },
		});
		this.clearSearchBtn.setAttr("title", t("taskSelection.clearSearch"));
		this.clearSearchBtn.addEventListener("click", () => {
			this.applyQuery("");
			this.searchInput?.focus();
		});

		this.parseLabelEl = this.filterEl.createDiv({ cls: "tah-parse-label tah-range-label" });
		this.updateTitleMeta(f);
	}

	private updateTitleMeta(f: SelectionFrame): void {
		const query = f.filter.parsedQuery;
		const t = this.options.t;
		const parts: string[] = [];
		if (query.keywords.length > 0)
			parts.push(t("taskSelection.parseKeywords", { value: query.keywords.join(" ") }));
		if (query.tags.length > 0)
			parts.push(t("taskSelection.parseTags", { value: query.tags.map((tag) => `#${tag}`).join(" ") }));
		if (query.contexts.length > 0)
			parts.push(
				t("taskSelection.parseContexts", { value: query.contexts.map((c) => `@${c}`).join(" ") })
			);
		if (this.parseLabelEl) {
			this.parseLabelEl.setText(parts.length > 0 ? parts.join("  ·  ") : "");
			this.parseLabelEl.toggleClass("tah-hidden", parts.length === 0);
		}
		if (this.clearSearchBtn) {
			this.clearSearchBtn.toggleClass("tah-hidden", f.filter.query === "");
		}
	}
}

/**
 * 两个区间是否等价（都 null 也算相同）；用于把会话区间映射回周期快捷按钮，
 * 以及重绘差量里「区间有没有变」的判断。
 */
function sameRange(a: DateRange | null, b: DateRange | null): boolean {
	if (a === null || b === null) return a === b;
	return a.start === b.start && a.end === b.end;
}
