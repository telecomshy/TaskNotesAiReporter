/**
 * 生成报告主弹窗里的「选择任务」区：左栏筛选结果，右栏报告集合。
 *
 * 本类是渲染器 + 交互接线：选择规则由 selectionSession 拥有。
 * 左栏勾选即加入右栏并从左侧消失；右栏是唯一的移除入口。
 */

import { CalendarWidget } from "./Calendar";
import { renderTaskMeta } from "./taskMeta";
import {
	addAllAddable,
	addTask,
	addableTasks,
	clearJoined,
	createSelectionSession,
	leftEmptyReason,
	parsedQuery,
	removeTask,
	joinedCount,
	joinedTasks,
	setQuery,
	setRange,
	switchTab,
	type SelectionSession,
	type SelectionTab,
} from "./selectionSession";
import { getMonthRange, getQuarterRange, getWeekRange, getYearRange } from "../core/dates";
import type { DateField, DateRange, TaskInfo } from "../types";
import type { UiLanguage, Translator } from "../i18n";

export interface TaskSelectionViewOptions {
	container: HTMLElement;
	dateFields: readonly DateField[];
	weekStartsOnMonday: boolean;
	t: Translator;
	lang: UiLanguage;
}

type MobilePane = "filter" | "joined";

export class TaskSelectionView {
	private session: SelectionSession | null = null;

	private readonly leftEl: HTMLElement;
	private readonly rightEl: HTMLElement;
	private readonly timeTabBtn: HTMLButtonElement;
	private readonly titleTabBtn: HTMLButtonElement;
	private readonly filterEl: HTMLElement;
	private readonly leftListEl: HTMLElement;
	private readonly rightListEl: HTMLElement;
	private readonly addableCountEl: HTMLElement;
	private readonly addAllBtn: HTMLButtonElement;
	private readonly rightTitleEl: HTMLElement;
	private readonly clearBtn: HTMLButtonElement;
	private readonly mobileFilterBtn: HTMLButtonElement;
	private readonly mobileJoinedBtn: HTMLButtonElement;

	private rangeLabelEl: HTMLElement | null = null;
	private calendarToggleBtn: HTMLButtonElement | null = null;
	private parseLabelEl: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private clearSearchBtn: HTMLButtonElement | null = null;
	private calendar: CalendarWidget | null = null;
	private calendarContainer: HTMLElement | null = null;
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

		this.filterEl = this.leftEl.createDiv({ cls: "tah-picker-filter" });
		const actions = this.leftEl.createDiv({ cls: "tah-picker-actions tah-selection-actions" });
		this.addableCountEl = actions.createDiv({ cls: "tah-range-label" });
		this.addAllBtn = actions.createEl("button", {
			cls: "tah-secondary-btn",
			text: t("taskSelection.addAll", { count: 0 }),
		});
		this.addAllBtn.addEventListener("click", () => this.update(addAllAddable));
		this.leftListEl = this.leftEl.createDiv({ cls: "tah-task-list tah-selection-list" });

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
		this.session = createSelectionSession(tasks, this.options.dateFields);
		this.renderFilter();
		this.renderAll();
	}

	/** 右栏当前集合，供生成报告读取。 */
	getJoinedTasks(): TaskInfo[] {
		return this.session ? joinedTasks(this.session) : [];
	}

	// ===== 状态推进 =====

	private update(transition: (session: SelectionSession) => SelectionSession): void {
		if (!this.session) return;
		this.session = transition(this.session);
		this.renderAll();
	}

	private applyQuery(value: string): void {
		if (!this.session) return;
		if (this.searchInput) this.searchInput.value = value;
		this.session = setQuery(this.session, value);
		this.updateTitleMeta();
		this.renderAll();
	}

	private changeTab(tab: SelectionTab): void {
		if (!this.session || this.session.tab === tab) return;
		this.session = switchTab(this.session, tab);
		this.renderFilter();
		this.renderAll();
	}

	private setMobilePane(pane: MobilePane): void {
		this.mobilePane = pane;
		this.leftEl.toggleClass("tah-selection-pane-hidden", pane !== "filter");
		this.rightEl.toggleClass("tah-selection-pane-hidden", pane !== "joined");
		this.mobileFilterBtn.toggleClass("tah-tab-active", pane === "filter");
		this.mobileJoinedBtn.toggleClass("tah-tab-active", pane === "joined");
	}

	// ===== 渲染 =====

	private renderAll(): void {
		this.renderActions();
		this.renderLists();
	}

	private renderActions(): void {
		if (!this.session) return;
		const addable = addableTasks(this.session).length;
		const joined = joinedCount(this.session);
		this.addableCountEl.setText(this.options.t("taskSelection.addableCount", { count: addable }));
		this.addAllBtn.setText(this.options.t("taskSelection.addAll", { count: addable }));
		this.addAllBtn.disabled = addable === 0;
		this.rightTitleEl.setText(this.options.t("report.joinedTasks", { count: joined }));
		this.clearBtn.disabled = joined === 0;
		this.mobileJoinedBtn.setText(
			this.options.t("taskSelection.joinedPane", { count: joined })
		);
		this.timeTabBtn.toggleClass("tah-tab-active", this.session.tab === "time");
		this.titleTabBtn.toggleClass("tah-tab-active", this.session.tab === "title");
	}

	private renderLists(): void {
		this.renderLeftList();
		this.renderRightList();
	}

	private renderLeftList(): void {
		this.leftListEl.empty();
		if (!this.session) return;

		const reason = leftEmptyReason(this.session);
		if (reason) {
			this.leftListEl.createDiv({
				text: this.emptyText(reason),
				cls: "tah-empty",
			});
			return;
		}

		for (const task of addableTasks(this.session)) {
			const item = this.leftListEl.createDiv({ cls: "tah-task-item" });
			const checkbox = item.createEl("input", { type: "checkbox" });
			checkbox.addClass("tah-task-checkbox");
			checkbox.setAttr("aria-label", this.options.t("taskSelection.addAria", { title: task.title }));
			checkbox.addEventListener("change", () => this.update((session) => addTask(session, task)));

			this.renderTaskInfo(item, task);
		}
	}

	private renderRightList(): void {
		this.rightListEl.empty();
		if (!this.session) return;

		const tasks = joinedTasks(this.session);
		if (tasks.length === 0) {
			this.rightListEl.createDiv({
				text: this.options.t("report.empty"),
				cls: "tah-empty",
			});
			return;
		}

		for (const task of tasks) {
			const item = this.rightListEl.createDiv({ cls: "tah-task-item" });
			this.renderTaskInfo(item, task);

			const removeBtn = item.createEl("button", { text: "×", cls: "tah-task-remove" });
			removeBtn.setAttr("aria-label", this.options.t("report.removeAria"));
			removeBtn.addEventListener("click", () =>
				this.update((session) => removeTask(session, task.id))
			);
		}
	}

	private renderTaskInfo(parent: HTMLElement, task: TaskInfo): void {
		const info = parent.createDiv({ cls: "tah-task-info" });
		info.createDiv({ cls: "tah-task-title", text: task.title });
		renderTaskMeta(info, task, this.options.t);
	}

	private emptyText(reason: Exclude<ReturnType<typeof leftEmptyReason>, null>): string {
		switch (reason) {
			case "no-range":
				return this.options.t("taskSelection.emptyPickRange");
			case "no-match":
				return this.options.t("taskSelection.emptyNoTasks");
			case "all-joined":
				return this.options.t("taskSelection.allJoined");
		}
	}

	// ===== 筛选区 =====

	private renderFilter(): void {
		this.filterEl.empty();
		this.calendar = null;
		this.calendarContainer = null;
		this.rangeLabelEl = null;
		this.calendarToggleBtn = null;
		this.parseLabelEl = null;
		this.searchInput = null;
		this.clearSearchBtn = null;
		if (!this.session) return;

		if (this.session.tab === "time") this.renderTimeFilter();
		else this.renderTitleFilter();
	}

	private renderTimeFilter(): void {
		if (!this.session) return;
		const t = this.options.t;

		const quickRow = this.filterEl.createDiv({ cls: "tah-quick-row" });
		const quickButtons: Array<{ label: string; range: DateRange | null }> = [
			{
				label: t("taskSelection.quickThisWeek"),
				range: getWeekRange(new Date(), this.options.weekStartsOnMonday),
			},
			{ label: t("taskSelection.quickThisMonth"), range: getMonthRange(new Date()) },
			{ label: t("taskSelection.quickThisQuarter"), range: getQuarterRange(new Date()) },
			{ label: t("taskSelection.quickThisYear"), range: getYearRange(new Date()) },
			{ label: t("taskSelection.clearRange"), range: null },
		];
		for (const btn of quickButtons) {
			const el = quickRow.createEl("button", { text: btn.label, cls: "tah-quick-btn" });
			el.addEventListener("click", () => {
				if (!this.session) return;
				this.session = setRange(this.session, btn.range);
				if (btn.range) this.renderCalendar();
				else this.calendar?.clearRange();
				this.updateRangeLabel();
				this.setCalendarOpen(false);
				this.renderAll();
			});
		}

		const rangeRow = this.filterEl.createDiv({ cls: "tah-picker-range-row" });
		this.rangeLabelEl = rangeRow.createDiv({ cls: "tah-range-label" });
		this.updateRangeLabel();

		this.calendarToggleBtn = rangeRow.createEl("button", {
			text: t("taskSelection.customRange"),
			cls: "tah-secondary-btn",
		});
		this.calendarToggleBtn.setAttr("aria-controls", "tah-calendar-panel");
		this.calendarToggleBtn.addEventListener("click", () => {
			this.setCalendarOpen(!this.isCalendarOpen());
		});

		this.calendarContainer = this.filterEl.createDiv({ cls: "tah-calendar-container" });
		this.calendarContainer.id = "tah-calendar-panel";
		this.setCalendarOpen(false);
		this.renderCalendar();
	}

	/** 展开 / 收起自定义日期面板；快捷按钮始终可见。 */
	private setCalendarOpen(open: boolean): void {
		this.calendarContainer?.toggleClass("tah-hidden", !open);
		this.calendarContainer?.setAttr("aria-hidden", String(!open));
		if (this.calendarToggleBtn) {
			this.calendarToggleBtn.setText(
				this.options.t(open ? "taskSelection.hideCalendar" : "taskSelection.customRange")
			);
			this.calendarToggleBtn.setAttr("aria-expanded", String(open));
		}
	}

	private isCalendarOpen(): boolean {
		return this.calendarContainer
			? !this.calendarContainer.classList.contains("tah-hidden")
			: false;
	}

	private updateRangeLabel(): void {
		if (!this.rangeLabelEl || !this.session) return;
		if (this.session.range === null) {
			this.rangeLabelEl.setText(this.options.t("taskSelection.noDate"));
			return;
		}
		this.rangeLabelEl.setText(
			this.options.t("taskSelection.currentFilter", {
				start: this.session.range.start,
				end: this.session.range.end,
			})
		);
	}

	private renderCalendar(): void {
		if (!this.calendarContainer || !this.session) return;
		this.calendarContainer.empty();
		this.calendar = new CalendarWidget(
			this.calendarContainer,
			this.options.weekStartsOnMonday,
			this.options.t,
			this.options.lang,
			this.session.range,
			(range, complete) => {
				if (!range || !this.session) return;
				this.session = setRange(this.session, range);
				this.updateRangeLabel();
				// 两次点击选完区间才收起；单击只是单日区间，可能还在选起点
				if (complete) this.setCalendarOpen(false);
				this.renderAll();
			}
		);
		this.calendar.render();
	}

	private renderTitleFilter(): void {
		if (!this.session) return;
		const t = this.options.t;

		const searchRow = this.filterEl.createDiv({ cls: "tah-search-row" });
		this.searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: t("taskSelection.searchPlaceholder"),
			cls: "tah-search-input",
		});
		this.searchInput.value = this.session.query;
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
		this.updateTitleMeta();
	}

	private updateTitleMeta(): void {
		if (!this.session) return;
		const query = parsedQuery(this.session);
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
			this.clearSearchBtn.toggleClass("tah-hidden", this.session.query === "");
		}
	}
}
