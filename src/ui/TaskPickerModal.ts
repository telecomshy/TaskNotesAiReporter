/**
 * 选择任务窗口（任务集合编辑器）。
 * 分 Tab：按时间 / 按标题。两个 Tab 都是「筛选 → 勾选 → 应用更改」。
 * 按当前筛选呈现任务；已加入任务默认勾选，取消勾选并确认会将其从主列表移除。
 * 筛选只改变呈现，不改变勾选；确认提交勾选集合相对已加入的差异。
 * 本类退化为渲染器：会话状态（Tab / 区间 / 查询 / 勾选）由 pickerSession 拥有。
 */

import { App, Modal } from "obsidian";
import { CalendarWidget } from "./Calendar";
import { renderTaskMeta } from "./taskMeta";
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
	type JoinedBadgeState,
	type PickerChanges,
	type PickerSession,
	type PickerTab,
} from "./pickerSession";
import { getMonthRange, getQuarterRange, getWeekRange, getYearRange } from "../core/dates";
import type { DateField, DateRange, TaskInfo } from "../types";
import type { UiLanguage, Translator } from "../i18n";

export class TaskPickerModal extends Modal {
	private session: PickerSession;
	private calendar!: CalendarWidget;

	private filterEl!: HTMLElement;
	private listEl!: HTMLElement;
	private labelEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	// 标题页：搜索框内的一键清除按钮
	private clearSearchBtn?: HTMLButtonElement;
	private confirmBtn!: HTMLButtonElement;
	// 「清空选择」按钮（标题页与时间页共用，随 Tab 重建）
	private clearBtn!: HTMLButtonElement;
	// 标题页：解析提示行（展示输入被解析成哪些关键字/标签/上下文）
	private parseLabelEl!: HTMLElement;
	// 时间页：日历容器（快捷按钮改区间时只重建此容器内的日历）
	private calendarContainer!: HTMLElement;

	// 按标题页的全选复选框
	private selectAllBox!: HTMLInputElement;

	constructor(
		app: App,
		allTasks: TaskInfo[],
		dateFields: readonly DateField[],
		candidateIds: Set<string>,
		private weekStartsOnMonday: boolean,
		private t: Translator,
		private lang: UiLanguage,
		private onConfirm: (changes: PickerChanges) => void
	) {
		super(app);
		this.session = createSession(allTasks, dateFields, candidateIds);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root-picker");
		this.setTitle(this.t("taskPicker.title"));

		this.renderTabs(contentEl);
		this.filterEl = contentEl.createDiv({ cls: "tah-picker-filter" });
		this.listEl = contentEl.createDiv({ cls: "tah-task-list tah-picker-list" });
		this.renderFooter(contentEl);

		this.applyTab("time");
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ===== Tab =====

	private renderTabs(container: HTMLElement): void {
		const tabBar = container.createDiv({ cls: "tah-tab-bar tah-picker-tabs" });
		const timeBtn = tabBar.createEl("button", { text: this.t("taskPicker.tabTime") });
		const titleBtn = tabBar.createEl("button", { text: this.t("taskPicker.tabTitle") });
		timeBtn.addClass("tah-tab-btn");
		titleBtn.addClass("tah-tab-btn");

		const refreshTabs = () => {
			timeBtn.toggleClass("tah-tab-active", this.session.tab === "time");
			titleBtn.toggleClass("tah-tab-active", this.session.tab === "title");
		};

		timeBtn.addEventListener("click", () => {
			this.applyTab("time");
			refreshTabs();
		});
		titleBtn.addEventListener("click", () => {
			this.applyTab("title");
			refreshTabs();
		});

		// 初次渲染时同步一次当前 Tab 的高亮（否则要点击后才生效）
		refreshTabs();
	}

	/** 切换 Tab：改会话 → 重建筛选区 → 重渲染列表。 */
	private applyTab(tab: PickerTab): void {
		this.session = switchTab(this.session, tab);
		this.renderFilter();
		this.refresh();
	}

	// ===== 筛选区 =====

	private renderFilter(): void {
		this.filterEl.empty();

		if (this.session.tab === "time") {
			this.renderTimeFilter();
		} else {
			this.renderTitleFilter();
		}
	}

	private renderTimeFilter(): void {
		const quickRow = this.filterEl.createDiv({ cls: "tah-quick-row" });
		const quickButtons: Array<{ label: string; range: DateRange | null }> = [
			{ label: this.t("taskPicker.quickThisWeek"), range: getWeekRange(new Date(), this.weekStartsOnMonday) },
			{ label: this.t("taskPicker.quickThisMonth"), range: getMonthRange(new Date()) },
			{ label: this.t("taskPicker.quickThisQuarter"), range: getQuarterRange(new Date()) },
			{ label: this.t("taskPicker.quickThisYear"), range: getYearRange(new Date()) },
			{ label: this.t("taskPicker.clearRange"), range: null },
		];
		for (const btn of quickButtons) {
			const el = quickRow.createEl("button", { text: btn.label });
			el.addClass("tah-quick-btn");
			el.addEventListener("click", () => {
				this.session = setRange(this.session, btn.range);
				if (btn.range) {
					// 快捷按钮改区间：重建日历以回填新选中范围
					this.renderCalendar();
				} else {
					// 清空区间：原地清选中，保留当前显示月份
					this.calendar.clearRange();
				}
				this.refresh();
			});
		}

		const rangeRow = this.filterEl.createDiv({ cls: "tah-picker-range-row" });
		this.labelEl = rangeRow.createDiv({ cls: "tah-range-label" });
		this.createClearButton(rangeRow);

		this.calendarContainer = this.filterEl.createDiv({ cls: "tah-calendar-container" });
		this.renderCalendar();
	}

	/** 重建日历（用会话里已提交的区间作初值）。 */
	private renderCalendar(): void {
		this.calendarContainer.empty();
		this.calendar = new CalendarWidget(
			this.calendarContainer,
			this.weekStartsOnMonday,
			this.t,
			this.lang,
			this.session.range,
			(range) => {
				if (!range) return;
				this.session = setRange(this.session, range);
				// 日历自身点击：只刷列表与标签，不重建日历（重建会打断两点选择）
				this.refresh();
			}
		);
		this.calendar.render();
	}

	private renderTitleFilter(): void {
		const searchRow = this.filterEl.createDiv({ cls: "tah-search-row" });
		this.searchInput = searchRow.createEl("input", {
			type: "text",
			placeholder: this.t("taskPicker.searchPlaceholder"),
		});
		this.searchInput.addClass("tah-search-input");
		this.searchInput.value = this.session.query;

		// 一键删除整个搜索词；只改查询、不动勾选
		this.clearSearchBtn = searchRow.createEl("button", {
			cls: "tah-search-clear",
			text: "×",
			attr: { "aria-label": this.t("taskPicker.clearSearch") },
		});
		this.clearSearchBtn.setAttr("title", this.t("taskPicker.clearSearch"));
		this.clearSearchBtn.addEventListener("click", () => {
			this.applyQuery("");
			this.searchInput.focus();
		});

		this.searchInput.addEventListener("input", () => {
			this.applyQuery(this.searchInput.value);
		});

		this.updateClearSearchState();

		// 操作行：左「全选」+ 计数，右「清空选择」
		const actionRow = this.filterEl.createDiv({ cls: "tah-picker-actions" });
		const left = actionRow.createDiv({ cls: "tah-picker-actions-left" });
		const allLabel = left.createEl("label", { cls: "tah-select-all" });
		this.selectAllBox = allLabel.createEl("input", { type: "checkbox" });
		allLabel.createSpan({ text: this.t("taskPicker.selectAll") });
		this.selectAllBox.addEventListener("change", () => {
			this.session = setAll(this.session, this.selectAllBox.checked);
			this.renderList();
		});
		this.labelEl = left.createDiv({ cls: "tah-range-label" });

		this.createClearButton(actionRow);

		this.parseLabelEl = this.filterEl.createDiv({ cls: "tah-parse-label tah-range-label" });
	}

	/** 搜索框的唯一更新入口：同步输入框、会话查询与派生渲染。 */
	private applyQuery(value: string): void {
		this.searchInput.value = value;
		this.session = setQuery(this.session, value);
		this.refresh();
	}

	/** 搜索框有内容时才显示一键清除按钮。 */
	private updateClearSearchState(): void {
		if (!this.clearSearchBtn) return;
		this.clearSearchBtn.toggleClass("tah-hidden", this.session.query === "");
	}

	// ===== 底部 =====

	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv({ cls: "tah-picker-footer" });
		const cancelBtn = footer.createEl("button", { text: this.t("taskPicker.cancel") });
		cancelBtn.addClass("tah-remove-btn");
		cancelBtn.addEventListener("click", () => this.close());

		this.confirmBtn = footer.createEl("button", { text: this.t("taskPicker.confirm") });
		this.confirmBtn.addClass("tah-generate-btn");
		this.confirmBtn.addEventListener("click", () => this.confirm());
	}

	// ===== 数据与展示 =====

	/** 创建「清空选择」按钮并绑定点击。 */
	private createClearButton(parent: HTMLElement): void {
		this.clearBtn = parent.createEl("button", { text: this.t("taskPicker.clearSelection"), cls: "tah-picker-clear" });
		this.clearBtn.addEventListener("click", () => {
			this.session = clearSelection(this.session);
			this.renderList();
		});
	}

	private updateLabel(): void {
		if (!this.labelEl) return;
		if (this.session.tab === "time") {
			if (this.session.range === null) {
				this.labelEl.textContent = this.t("taskPicker.noDate");
			} else {
				this.labelEl.textContent = this.t("taskPicker.currentFilter", {
					start: this.session.range.start,
					end: this.session.range.end,
				});
			}
		} else {
			const count = visibleTasks(this.session).length;
			if (isQueryEmpty(this.session)) {
				this.labelEl.textContent = this.t("taskPicker.allTasks", { count });
			} else {
				this.labelEl.textContent = this.t("taskPicker.searchResult", {
					query: this.session.query.trim(),
					count,
				});
			}
		}
	}

	private refresh(): void {
		if (this.session.tab === "title") {
			this.updateParseLabel();
			this.updateClearSearchState();
		}
		this.updateLabel();
		this.renderList();
	}

	/** 更新标题页的解析提示行：展示输入被解析成哪些条件。 */
	private updateParseLabel(): void {
		if (!this.parseLabelEl) return;
		const query = parsedQuery(this.session);
		const parts: string[] = [];
		if (query.keywords.length > 0)
			parts.push(this.t("taskPicker.parseKeywords", { value: query.keywords.join(" ") }));
		if (query.tags.length > 0)
			parts.push(
				this.t("taskPicker.parseTags", { value: query.tags.map((tag) => `#${tag}`).join(" ") })
			);
		if (query.contexts.length > 0)
			parts.push(
				this.t("taskPicker.parseContexts", {
					value: query.contexts.map((c) => `@${c}`).join(" "),
				})
			);
		this.parseLabelEl.setText(parts.length > 0 ? parts.join("  ·  ") : "");
		// 仅在有解析条件时显示，避免空行占位
		this.parseLabelEl.toggleClass("tah-hidden", parts.length === 0);
	}

	private renderList(): void {
		this.listEl.empty();
		const tasks = visibleTasks(this.session);

		if (tasks.length === 0) {
			const emptyText =
				this.session.tab === "time" && this.session.range === null
					? this.t("taskPicker.emptyPickRange")
					: this.t("taskPicker.emptyNoTasks");
			this.listEl.createDiv({ text: emptyText, cls: "tah-empty" });
		}

		for (const task of tasks) {
			const item = this.listEl.createDiv({ cls: "tah-task-item" });

			const checkbox = item.createEl("input", { type: "checkbox" });
			checkbox.addClass("tah-task-checkbox");
			checkbox.checked = this.session.desiredIds.has(task.id);

			const info = item.createDiv({ cls: "tah-task-info" });
			const titleRow = info.createDiv({ cls: "tah-task-title-row" });
			const titleEl = titleRow.createDiv({ cls: "tah-task-title" });
			titleEl.setText(task.title);

			const badgeState = joinedBadgeState(this.session, task.id);
			const badgeEl =
				badgeState === "none"
					? null
					: titleRow.createSpan({
							cls: this.badgeClass(badgeState),
							text: this.badgeText(badgeState),
						});

			renderTaskMeta(info, task, this.t);

			checkbox.addEventListener("change", () => {
				this.session = toggle(this.session, task.id);
				if (badgeEl) this.updateBadge(badgeEl, task.id);
				this.updateConfirmState();
			});
		}

		this.updateConfirmState();
	}

	private badgeText(state: Exclude<JoinedBadgeState, "none">): string {
		return this.t(
			state === "joined" ? "taskPicker.joinedBadge" : "taskPicker.removingBadge"
		);
	}

	private badgeClass(state: Exclude<JoinedBadgeState, "none">): string {
		return `tah-task-badge tah-task-badge-${state}`;
	}

	private updateBadge(badgeEl: HTMLSpanElement, id: string): void {
		const state = joinedBadgeState(this.session, id);
		if (state === "none") return;
		badgeEl.setText(this.badgeText(state));
		badgeEl.className = this.badgeClass(state);
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		const changes = pendingChanges(this.session);
		const summary = summarizeChanges(changes);

		this.confirmBtn.setText(
			summary.removed > 0
				? this.t("taskPicker.applyChanges", {
						added: summary.added,
						removed: summary.removed,
					})
				: this.t("taskPicker.join", { count: summary.added })
		);
		this.confirmBtn.disabled = summary.isEmpty;
		if (this.clearBtn) this.clearBtn.disabled = !hasDesiredVisible(this.session);

		// 按标题页：同步「全选」复选框状态
		if (this.session.tab === "title" && this.selectAllBox) {
			const state = selectAllState(this.session);
			this.selectAllBox.checked = state.checked;
			this.selectAllBox.indeterminate = state.indeterminate;
		}
	}

	private confirm(): void {
		const changes = pendingChanges(this.session);
		if (summarizeChanges(changes).isEmpty) return;
		this.onConfirm(changes);
		this.close();
	}
}
