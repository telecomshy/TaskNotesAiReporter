/**
 * 选择任务窗口（一次性任务选择器）。
 * 分 Tab：按时间 / 按标题。两个 Tab 都是「筛选 → 默认全选 → 可勾选 → 加入选中」。
 * 与主窗口已选任务完全解耦，去重交给主窗口。
 */

import { App, Modal } from "obsidian";
import { CalendarWidget } from "./Calendar";
import { filterTasksByDateRange } from "../core/filter";
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

	private filterEl!: HTMLElement;
	private listEl!: HTMLElement;
	private labelEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(
		app: App,
		private allTasks: TaskInfo[],
		private dateFields: DateField[],
		private weekStartsOnMonday: boolean,
		private onConfirm: (tasks: TaskInfo[]) => void
	) {
		super(app);
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
		this.searchInput = searchRow.createEl("input", { type: "text", placeholder: "输入关键字筛选任务…" });
		this.searchInput.addClass("tah-search-input");
		this.searchInput.value = this.keyword;
		this.searchInput.addEventListener("input", () => {
			this.keyword = this.searchInput.value.trim();
			this.checkedPaths.clear();
			this.refresh();
		});

		this.labelEl = this.filterEl.createDiv({ cls: "tah-range-label" });
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
			if (!this.keyword) {
				this.labelEl.textContent = `全部任务（共 ${this.titleTasks.length} 个）`;
			} else {
				this.labelEl.textContent = `搜索「${this.keyword}」（匹配 ${this.titleTasks.length} 个）`;
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
			// 默认全选
			for (const task of this.timeTasks) this.checkedPaths.add(task.path);
		} else {
			const kw = this.keyword.toLowerCase();
			this.titleTasks = kw
				? this.allTasks.filter((t) => t.title.toLowerCase().includes(kw))
				: [...this.allTasks];
			// 默认全选
			for (const task of this.titleTasks) this.checkedPaths.add(task.path);
		}

		this.updateLabel();
		this.renderList();
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

			const checkbox = item.createEl("input", { type: "checkbox" });
			checkbox.addClass("tah-task-checkbox");
			checkbox.checked = this.checkedPaths.has(task.path);
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

			const meta = info.createDiv({ cls: "tah-task-meta" });
			const metaText: string[] = [];
			if (task.status) metaText.push(`状态:${task.status}`);
			if (task.priority) metaText.push(`优先级:${task.priority}`);
			if (task.completedDate) metaText.push(`完成:${task.completedDate}`);
			if (task.due) metaText.push(`到期:${task.due}`);
			meta.setText(metaText.join(" · "));
		}

		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		const count = this.checkedPaths.size;
		this.confirmBtn.setText(`加入选中（${count}）`);
		this.confirmBtn.disabled = count === 0;
	}

	private confirm(): void {
		const tasks = this.getDisplayedTasks().filter((t) => this.checkedPaths.has(t.path));
		if (tasks.length === 0) return;
		this.onConfirm(tasks);
		this.close();
	}
}
