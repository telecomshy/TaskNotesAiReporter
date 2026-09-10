/**
 * 选择任务窗口（一次性任务选择器）。
 * 分 Tab：按时间 / 按标题。两个 Tab 都是「筛选 → 默认全选 → 可勾选 → 加入选中」。
 * 主窗口已加入的任务会高亮并禁用勾选，避免重复选择；去重仍由主窗口兜底。
 */

import { App, Modal } from "obsidian";
import { CalendarWidget } from "./Calendar";
import { renderTaskMeta } from "./taskMeta";
import { getSelectablePaths, computeSelectAllState } from "./taskSelection";
import {
	filterTasksByDateRange,
	filterTasksByTitleQuery,
	isTitleQueryEmpty,
	parseTitleQuery,
	type TitleQuery,
} from "../core/filter";
import { getMonthRange, getQuarterRange, getWeekRange, getYearRange } from "../core/dates";
import type { DateField, DateRange, TaskInfo } from "../types";

type PickMode = { kind: "empty" } | { kind: "range"; range: DateRange };
type PickerTab = "time" | "title";

export class TaskPickerModal extends Modal {
	// 按时间
	private timeMode: PickMode = { kind: "empty" };
	private timeTasks: TaskInfo[] = [];
	private calendar!: CalendarWidget;

	// 按标题
	private keyword = "";
	private titleTasks: TaskInfo[] = [];

	// 当前 Tab
	private currentTab: PickerTab = "time";

	// 勾选状态（仅当前 Tab 有效）
	private checkedPaths = new Set<string>();

	// 主窗口已加入列表的任务（仅用于高亮标记与禁用，不参与本地勾选）
	private readonly alreadySelected: Set<string>;

	private filterEl!: HTMLElement;
	private listEl!: HTMLElement;
	private labelEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;
	// 标题页：解析提示行（展示输入被解析成哪些关键字/标签/上下文）
	private parseLabelEl!: HTMLElement;

	// 按标题页的全选 / 清空复选框
	private selectAllBox!: HTMLInputElement;
	private clearBox!: HTMLInputElement;

	constructor(
		app: App,
		private allTasks: TaskInfo[],
		private dateFields: DateField[],
		private weekStartsOnMonday: boolean,
		private onConfirm: (tasks: TaskInfo[]) => void,
		alreadySelected: Set<string>
	) {
		super(app);
		this.alreadySelected = alreadySelected;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root-picker");
		this.setTitle("选择任务");

		this.renderTabs(contentEl);
		this.filterEl = contentEl.createDiv({ cls: "tah-picker-filter" });
		contentEl.createEl("h3", { text: "任务", cls: "tah-picker-list-title" });
		this.listEl = contentEl.createDiv({ cls: "tah-task-list tah-picker-list" });
		this.renderFooter(contentEl);

		this.switchTab("time");
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ===== Tab =====

	private renderTabs(container: HTMLElement): void {
		const tabBar = container.createDiv({ cls: "tah-tab-bar tah-picker-tabs" });
		const timeBtn = tabBar.createEl("button", { text: "按时间" });
		const titleBtn = tabBar.createEl("button", { text: "按标题" });
		timeBtn.addClass("tah-tab-btn");
		titleBtn.addClass("tah-tab-btn");

		const refreshTabs = () => {
			timeBtn.toggleClass("tah-tab-active", this.currentTab === "time");
			titleBtn.toggleClass("tah-tab-active", this.currentTab === "title");
		};

		timeBtn.addEventListener("click", () => {
			this.switchTab("time");
			refreshTabs();
		});
		titleBtn.addEventListener("click", () => {
			this.switchTab("title");
			refreshTabs();
		});
	}

	private switchTab(tab: PickerTab): void {
		this.currentTab = tab;
		this.checkedPaths.clear();
		this.renderFilter();
		this.refresh();
	}

	// ===== 筛选区 =====

	private renderFilter(): void {
		this.filterEl.empty();

		if (this.currentTab === "time") {
			this.renderTimeFilter();
		} else {
			this.renderTitleFilter();
		}
	}

	private renderTimeFilter(): void {
		const quickRow = this.filterEl.createDiv({ cls: "tah-quick-row" });
		const quickButtons: Array<{ label: string; mode: PickMode }> = [
			{ label: "本周", mode: { kind: "range", range: getWeekRange(new Date(), this.weekStartsOnMonday) } },
			{ label: "本月", mode: { kind: "range", range: getMonthRange(new Date()) } },
			{ label: "本季度", mode: { kind: "range", range: getQuarterRange(new Date()) } },
			{ label: "本年", mode: { kind: "range", range: getYearRange(new Date()) } },
			{ label: "清空", mode: { kind: "empty" } },
		];
		for (const btn of quickButtons) {
			const el = quickRow.createEl("button", { text: btn.label });
			el.addClass("tah-quick-btn");
			el.addEventListener("click", () => {
				this.timeMode = btn.mode;
				this.calendar?.setRange(btn.mode.kind === "range" ? btn.mode.range : null);
				this.checkedPaths.clear();
				this.refresh();
			});
		}

		this.labelEl = this.filterEl.createDiv({ cls: "tah-range-label" });

		const calendarContainer = this.filterEl.createDiv({ cls: "tah-calendar-container" });
		this.calendar = new CalendarWidget(
			calendarContainer,
			this.weekStartsOnMonday,
			(range) => {
				if (range) {
					this.timeMode = { kind: "range", range };
					this.checkedPaths.clear();
					this.refresh();
				}
			}
		);
		this.calendar.render();
	}

	private renderTitleFilter(): void {
		const searchRow = this.filterEl.createDiv({ cls: "tah-search-row" });
		this.searchInput = searchRow.createEl("input", { type: "text", placeholder: "关键字 #标签 @上下文（空格分隔）…" });
		this.searchInput.addClass("tah-search-input");
		this.searchInput.value = this.keyword;
		this.searchInput.addEventListener("input", () => {
			this.keyword = this.searchInput.value;
			this.checkedPaths.clear();
			this.refresh();
		});

		// 全选 / 清空（仅作用于按标题页当前展示的任务）
		const actionRow = this.filterEl.createDiv({ cls: "tah-picker-actions" });
		const allLabel = actionRow.createEl("label", { cls: "tah-select-all" });
		this.selectAllBox = allLabel.createEl("input", { type: "checkbox" });
		allLabel.createSpan({ text: "全选" });
		this.selectAllBox.addEventListener("change", () => {
			// 只切换未加入主列表的任务；已加入的始终显示为勾选、不参与
			const paths = getSelectablePaths(this.titleTasks, this.alreadySelected);
			if (this.selectAllBox.checked) {
				for (const path of paths) this.checkedPaths.add(path);
			} else {
				for (const path of paths) this.checkedPaths.delete(path);
			}
			this.renderList();
		});

		const clearLabel = actionRow.createEl("label", { cls: "tah-select-clear" });
		this.clearBox = clearLabel.createEl("input", { type: "checkbox" });
		clearLabel.createSpan({ text: "清空" });
		this.clearBox.addEventListener("change", () => {
			for (const task of this.titleTasks) this.checkedPaths.delete(task.path);
			// 一次性动作，勾选后自动复位
			this.clearBox.checked = false;
			this.renderList();
		});

		this.labelEl = this.filterEl.createDiv({ cls: "tah-range-label" });
		this.parseLabelEl = this.filterEl.createDiv({ cls: "tah-parse-label tah-range-label" });
	}

	// ===== 底部 =====

	private renderFooter(container: HTMLElement): void {
		const footer = container.createDiv({ cls: "tah-picker-footer" });
		const cancelBtn = footer.createEl("button", { text: "取消" });
		cancelBtn.addClass("tah-remove-btn");
		cancelBtn.addEventListener("click", () => this.close());

		this.confirmBtn = footer.createEl("button", { text: "确定" });
		this.confirmBtn.addClass("tah-generate-btn");
		this.confirmBtn.addEventListener("click", () => this.confirm());
	}

	// ===== 数据与展示 =====

	private getDisplayedTasks(): TaskInfo[] {
		if (this.currentTab === "time") return this.timeTasks;
		return this.titleTasks;
	}

	private updateLabel(): void {
		if (!this.labelEl) return;
		if (this.currentTab === "time") {
			if (this.timeMode.kind === "empty") {
				this.labelEl.textContent = "未选择日期（请选择时间范围或使用快捷按钮）";
			} else {
				this.labelEl.textContent = `当前筛选：${this.timeMode.range.start} ~ ${this.timeMode.range.end}`;
			}
		} else {
			const query = parseTitleQuery(this.keyword);
			if (isTitleQueryEmpty(query)) {
				this.labelEl.textContent = `全部任务（共 ${this.titleTasks.length} 个）`;
			} else {
				this.labelEl.textContent = `搜索「${this.keyword.trim()}」（匹配 ${this.titleTasks.length} 个）`;
			}
		}
	}

	private refresh(): void {
		if (this.currentTab === "time") {
			if (this.timeMode.kind === "empty") {
				this.timeTasks = [];
			} else {
				this.timeTasks = filterTasksByDateRange(
					this.allTasks,
					this.timeMode.range,
					this.dateFields
				);
			}
			// 默认全选（已加入主列表的除外）
			for (const path of getSelectablePaths(this.timeTasks, this.alreadySelected)) {
				this.checkedPaths.add(path);
			}
		} else {
			const query = parseTitleQuery(this.keyword);
			this.titleTasks = filterTasksByTitleQuery(this.allTasks, query);
			this.updateParseLabel(query);
			// 按标题页：默认都不勾选，由用户通过「全选」或单个勾选自行选择
		}

		this.updateLabel();
		this.renderList();
	}

	/** 更新标题页的解析提示行：展示输入被解析成哪些条件。 */
	private updateParseLabel(query: TitleQuery): void {
		if (!this.parseLabelEl) return;
		const parts: string[] = [];
		if (query.keywords.length > 0) parts.push(`关键字：${query.keywords.join(" ")}`);
		if (query.tags.length > 0) parts.push(`标签：${query.tags.map((t) => `#${t}`).join(" ")}`);
		if (query.contexts.length > 0)
			parts.push(`上下文：${query.contexts.map((c) => `@${c}`).join(" ")}`);
		this.parseLabelEl.setText(parts.length > 0 ? parts.join("  ·  ") : "");
	}

	private renderList(): void {
		this.listEl.empty();
		const tasks = this.getDisplayedTasks();

		if (tasks.length === 0) {
			const emptyText =
				this.currentTab === "time" && this.timeMode.kind === "empty"
					? "请先选择时间范围。"
					: "没有匹配的任务。";
			this.listEl.createDiv({ text: emptyText, cls: "tah-empty" });
		}

		for (const task of tasks) {
			const item = this.listEl.createDiv({ cls: "tah-task-item" });
			const isSelected = this.alreadySelected.has(task.path);

			const checkbox = item.createEl("input", { type: "checkbox" });
			checkbox.addClass("tah-task-checkbox");
			// 已加入主列表的任务：显示为已勾选且禁用（不可在本窗口重复操作）
			checkbox.checked = isSelected || this.checkedPaths.has(task.path);
			if (isSelected) {
				checkbox.disabled = true;
				item.addClass("tah-task-item-selected");
			}
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.checkedPaths.add(task.path);
				} else {
					this.checkedPaths.delete(task.path);
				}
				this.updateConfirmState();
			});

			const info = item.createDiv({ cls: "tah-task-info" });
			const titleEl = info.createDiv({ cls: "tah-task-title" });
			titleEl.setText(task.title);
			renderTaskMeta(info, task);
		}

		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		const count = this.checkedPaths.size;
		this.confirmBtn.setText(`加入选中（${count}）`);
		this.confirmBtn.disabled = count === 0;

		// 按标题页：同步「全选」复选框状态（已加入主列表的任务视为已勾选）
		if (this.currentTab === "title" && this.selectAllBox) {
			const state = computeSelectAllState(
				this.titleTasks,
				this.checkedPaths,
				this.alreadySelected
			);
			this.selectAllBox.checked = state.checked;
			this.selectAllBox.indeterminate = state.indeterminate;
		}
	}

	private confirm(): void {
		const tasks = this.getDisplayedTasks().filter((t) => this.checkedPaths.has(t.path));
		if (tasks.length === 0) return;
		this.onConfirm(tasks);
		this.close();
	}
}
