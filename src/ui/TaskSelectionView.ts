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
	clearSelected,
	createSelectionSession,
	leftEmptyReason,
	parsedQuery,
	removeTask,
	selectedCount,
	selectedTasks,
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

type MobilePane = "filter" | "selected";

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
	private readonly mobileSelectedBtn: HTMLButtonElement;

	private rangeLabelEl: HTMLElement | null = null;
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
			text: t("taskPicker.filterTab"),
			cls: "tah-tab-btn",
		});
		this.mobileSelectedBtn = mobileTabs.createEl("button", {
			text: t("taskPicker.selectedPane", { count: 0 }),
			cls: "tah-tab-btn",
		});
		this.mobileFilterBtn.addEventListener("click", () => this.setMobilePane("filter"));
		this.mobileSelectedBtn.addEventListener("click", () => this.setMobilePane("selected"));

		const layoutEl = container.createDiv({ cls: "tah-selection-layout" });

		this.leftEl = layoutEl.createDiv({ cls: "tah-selection-pane tah-selection-left" });
		const leftHeader = this.leftEl.createDiv({ cls: "tah-main-header" });
		leftHeader.createEl("h3", { text: t("taskPicker.title") });

		const tabBar = this.leftEl.createDiv({ cls: "tah-tab-bar tah-picker-tabs" });
		this.timeTabBtn = tabBar.createEl("button", {
			text: t("taskPicker.tabTime"),
			cls: "tah-tab-btn",
		});
		this.titleTabBtn = tabBar.createEl("button", {
			text: t("taskPicker.tabTitle"),
			cls: "tah-tab-btn",
		});
		this.timeTabBtn.addEventListener("click", () => this.changeTab("time"));
		this.titleTabBtn.addEventListener("click", () => this.changeTab("title"));

		this.filterEl = this.leftEl.createDiv({ cls: "tah-picker-filter" });
		const actions = this.leftEl.createDiv({ cls: "tah-picker-actions tah-selection-actions" });
		this.addableCountEl = actions.createDiv({ cls: "tah-range-label" });
		this.addAllBtn = actions.createEl("button", {
			cls: "tah-batch-remove-btn",
			text: t("taskPicker.addAll", { count: 0 }),
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
			cls: "tah-batch-remove-btn",
		});
		this.clearBtn.addEventListener("click", () => this.update(clearSelected));
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
	getSelectedTasks(): TaskInfo[] {
		return this.session ? selectedTasks(this.session) : [];
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
		this.rightEl.toggleClass("tah-selection-pane-hidden", pane !== "selected");
		this.mobileFilterBtn.toggleClass("tah-tab-active", pane === "filter");
		this.mobileSelectedBtn.toggleClass("tah-tab-active", pane === "selected");
	}

	// ===== 渲染 =====

	private renderAll(): void {
		this.renderActions();
		this.renderLists();
	}

	private renderActions(): void {
		if (!this.session) return;
		const addable = addableTasks(this.session).length;
		const selected = selectedCount(this.session);
		this.addableCountEl.setText(this.options.t("taskPicker.addableCount", { count: addable }));
		this.addAllBtn.setText(this.options.t("taskPicker.addAll", { count: addable }));
		this.addAllBtn.disabled = addable === 0;
		this.rightTitleEl.setText(this.options.t("report.joinedTasks", { count: selected }));
		this.clearBtn.disabled = selected === 0;
		this.mobileSelectedBtn.setText(
			this.options.t("taskPicker.selectedPane", { count: selected })
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
			checkbox.setAttr("aria-label", this.options.t("taskPicker.addAria", { title: task.title }));
			checkbox.addEventListener("change", () => this.update((session) => addTask(session, task)));

			const info = item.createDiv({ cls: "tah-task-info" });
			info.createDiv({ cls: "tah-task-title", text: task.title });
			renderTaskMeta(info, task, this.options.t);
		}
	}

	private renderRightList(): void {
		this.rightListEl.empty();
		if (!this.session) return;

		const tasks = selectedTasks(this.session);
		if (tasks.length === 0) {
			this.rightListEl.createDiv({
				text: this.options.t("report.empty"),
				cls: "tah-empty",
			});
			return;
		}

		for (const task of tasks) {
			const item = this.rightListEl.createDiv({ cls: "tah-task-item" });
			const info = item.createDiv({ cls: "tah-task-info" });
			info.createDiv({ cls: "tah-task-title", text: task.title });
			renderTaskMeta(info, task, this.options.t);

			const removeBtn = item.createEl("button", { text: "×", cls: "tah-task-remove" });
			removeBtn.setAttr("aria-label", this.options.t("report.removeAria"));
			removeBtn.addEventListener("click", () =>
				this.update((session) => removeTask(session, task.id))
			);
		}
	}

	private emptyText(reason: Exclude<ReturnType<typeof leftEmptyReason>, null>): string {
		switch (reason) {
			case "no-range":
				return this.options.t("taskPicker.emptyPickRange");
			case "no-match":
				return this.options.t("taskPicker.emptyNoTasks");
			case "all-selected":
				return this.options.t("taskPicker.allSelected");
		}
	}

	// ===== 筛选区 =====

	private renderFilter(): void {
		this.filterEl.empty();
		this.calendar = null;
		this.calendarContainer = null;
		this.rangeLabelEl = null;
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
				label: t("taskPicker.quickThisWeek"),
				range: getWeekRange(new Date(), this.options.weekStartsOnMonday),
			},
			{ label: t("taskPicker.quickThisMonth"), range: getMonthRange(new Date()) },
			{ label: t("taskPicker.quickThisQuarter"), range: getQuarterRange(new Date()) },
			{ label: t("taskPicker.quickThisYear"), range: getYearRange(new Date()) },
			{ label: t("taskPicker.clearRange"), range: null },
		];
		for (const btn of quickButtons) {
			const el = quickRow.createEl("button", { text: btn.label, cls: "tah-quick-btn" });
			el.addEventListener("click", () => {
				if (!this.session) return;
				this.session = setRange(this.session, btn.range);
				if (btn.range) this.renderCalendar();
				else this.calendar?.clearRange();
				this.updateRangeLabel();
				this.renderAll();
			});
		}

		const rangeRow = this.filterEl.createDiv({ cls: "tah-picker-range-row" });
		this.rangeLabelEl = rangeRow.createDiv({ cls: "tah-range-label" });
		this.updateRangeLabel();

		this.calendarContainer = this.filterEl.createDiv({ cls: "tah-calendar-container" });
		this.renderCalendar();
	}

	private updateRangeLabel(): void {
		if (!this.rangeLabelEl || !this.session) return;
		if (this.session.range === null) {
			this.rangeLabelEl.setText(this.options.t("taskPicker.noDate"));
			return;
		}
		this.rangeLabelEl.setText(
			this.options.t("taskPicker.currentFilter", {
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
			(range) => {
				if (!range || !this.session) return;
				this.session = setRange(this.session, range);
				this.updateRangeLabel();
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
			placeholder: t("taskPicker.searchPlaceholder"),
			cls: "tah-search-input",
		});
		this.searchInput.value = this.session.query;
		this.searchInput.addEventListener("input", () => {
			if (this.searchInput) this.applyQuery(this.searchInput.value);
		});

		this.clearSearchBtn = searchRow.createEl("button", {
			cls: "tah-search-clear",
			text: "×",
			attr: { "aria-label": t("taskPicker.clearSearch") },
		});
		this.clearSearchBtn.setAttr("title", t("taskPicker.clearSearch"));
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
			parts.push(t("taskPicker.parseKeywords", { value: query.keywords.join(" ") }));
		if (query.tags.length > 0)
			parts.push(t("taskPicker.parseTags", { value: query.tags.map((tag) => `#${tag}`).join(" ") }));
		if (query.contexts.length > 0)
			parts.push(
				t("taskPicker.parseContexts", { value: query.contexts.map((c) => `@${c}`).join(" ") })
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
