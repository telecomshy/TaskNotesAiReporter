/**
 * 生成报告主弹窗。
 * 只有一个任务列表区域：通过「选择任务」窗口追加任务，勾选的任务送模型生成报告。
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import { resolveActiveModelConfig, type DateRange, type ReportType, type TaskInfo } from "../types";
import { loadAllTasks } from "../tasks/source";
import { buildReportPrompt } from "../core/prompt";
import { chatCompletion, AIClientError } from "../ai/client";
import { saveReport } from "../report/writer";
import { TaskPickerModal } from "./TaskPickerModal";

export class ReportModal extends Modal {
	private allTasks: TaskInfo[] = [];
	private candidateTasks = new Map<string, TaskInfo>();
	private checkedPaths = new Set<string>();
	private reportType: ReportType = "custom";

	private listWrapEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private generating = false;
	private selectedTemplateId = ""; // 空字符串表示不选模板（极简模式）

	constructor(
		app: App,
		private plugin: TaskNotesAIHelperPlugin
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root-narrow");
		this.setTitle("生成任务报告");

		// 一次性创建容器结构（后续 render* 只填充，不再新建）
		this.listWrapEl = contentEl.createDiv({ cls: "tah-main" });
		this.footerEl = contentEl.createDiv({ cls: "tah-modal-footer" });

		this.renderRight();
		this.renderFooter();

		// 加载任务
		this.listWrapEl.empty();
		this.listWrapEl.createDiv({ text: "正在加载任务…", cls: "tah-loading" });
		const tasks = await loadAllTasks(this.app);
		if (tasks === null) {
			this.listWrapEl.empty();
			this.listWrapEl.createEl("p", {
				text: "未检测到 TaskNotes 插件，请先在 Obsidian 中启用 TaskNotes。",
				cls: "tah-error",
			});
			return;
		}
		this.allTasks = tasks;
		this.renderRight();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ===== 任务列表 =====

	/** 所有候选任务（按加入顺序） */
	private getCandidateTasks(): TaskInfo[] {
		return Array.from(this.candidateTasks.values());
	}

	/** 勾选的任务（将送给模型） */
	private getCheckedTasks(): TaskInfo[] {
		const result: TaskInfo[] = [];
		for (const task of this.candidateTasks.values()) {
			if (this.checkedPaths.has(task.path)) result.push(task);
		}
		return result;
	}

	private renderRight(): void {
		this.listWrapEl.empty();

		const header = this.listWrapEl.createDiv({ cls: "tah-main-header" });
		header.createEl("h3", { text: "已选任务" });

		const tasks = this.getCandidateTasks();

		// 工具栏：计数 + 全选 + 取消勾选 + 重置
		const toolbar = this.listWrapEl.createDiv({ cls: "tah-task-toolbar" });
		const countEl = toolbar.createDiv({ cls: "tah-count" });
		countEl.setText(`已勾选 ${this.getCheckedTasks().length} / ${tasks.length} 个任务`);

		const batchActions = toolbar.createDiv({ cls: "tah-batch-actions" });
		const selectAllLabel = batchActions.createEl("label", { cls: "tah-select-all" });
		const selectAllBox = selectAllLabel.createEl("input", { type: "checkbox" });
		selectAllLabel.createSpan({ text: "全选" });
		const uncheckBtn = batchActions.createEl("button", { text: "取消勾选" });
		uncheckBtn.addClass("tah-batch-remove-btn");
		const resetBtn = batchActions.createEl("button", { text: "重置" });
		resetBtn.addClass("tah-batch-remove-btn");

		const refreshSelectAll = () => {
			const allChecked = tasks.length > 0 && tasks.every((t) => this.checkedPaths.has(t.path));
			const someChecked = tasks.some((t) => this.checkedPaths.has(t.path));
			selectAllBox.checked = allChecked;
			selectAllBox.indeterminate = !allChecked && someChecked;
			uncheckBtn.disabled = !someChecked;
			resetBtn.disabled = tasks.length === 0;
			countEl.setText(`已勾选 ${this.getCheckedTasks().length} / ${tasks.length} 个任务`);
		};

		selectAllBox.addEventListener("change", () => {
			if (selectAllBox.checked) {
				for (const task of tasks) this.checkedPaths.add(task.path);
			} else {
				for (const task of tasks) this.checkedPaths.delete(task.path);
			}
			this.renderRight();
		});

		uncheckBtn.addEventListener("click", () => {
			this.checkedPaths.clear();
			this.renderRight();
		});

		resetBtn.addEventListener("click", () => {
			this.candidateTasks.clear();
			this.checkedPaths.clear();
			this.renderRight();
		});

		// 任务列表
		const listEl = this.listWrapEl.createDiv({ cls: "tah-task-list" });

		if (tasks.length === 0) {
			listEl.createDiv({
				text: "暂无任务。点击下方「选择任务」筛选并添加任务。",
				cls: "tah-empty",
			});
		}

		for (const task of tasks) {
			const item = listEl.createDiv({ cls: "tah-task-item" });

			const checkbox = item.createEl("input", { type: "checkbox" });
			checkbox.addClass("tah-task-checkbox");
			checkbox.checked = this.checkedPaths.has(task.path);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.checkedPaths.add(task.path);
				} else {
					this.checkedPaths.delete(task.path);
				}
				refreshSelectAll();
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

		refreshSelectAll();

		// 选择任务按钮
		const addRow = this.listWrapEl.createDiv({ cls: "tah-add-row" });
		const addBtn = addRow.createEl("button", { text: "+ 选择任务" });
		addBtn.addClass("tah-add-btn");
		addBtn.addEventListener("click", () => this.openTaskPicker());
		addRow.createDiv({
			text: "新选任务将追加到列表（可点击「重置」清空）。",
			cls: "tah-hint",
		});

		this.updateFooterCount();
	}

	private openTaskPicker(): void {
		new TaskPickerModal(
			this.app,
			this.allTasks,
			this.plugin.settings.dateFields,
			this.plugin.settings.weekStartsOnMonday,
			(tasks) => {
				let added = 0;
				let skipped = 0;
				for (const task of tasks) {
					if (this.candidateTasks.has(task.path)) {
						skipped++;
					} else {
						this.candidateTasks.set(task.path, task);
						this.checkedPaths.add(task.path);
						added++;
					}
				}
				this.renderRight();
				if (skipped > 0) {
					new Notice(`已加入 ${added} 个任务，跳过 ${skipped} 个已在列表中的任务`);
				} else {
					new Notice(`已加入 ${added} 个任务`);
				}
			}
		).open();
	}

	// ===== 底部 =====

	private renderFooter(): void {
		this.footerEl.empty();
		const count = this.footerEl.createSpan({ cls: "tah-footer-count" });
		count.setText(`共 ${this.getCheckedTasks().length} 个任务`);

		// 右侧：模板下拉 + 生成按钮（紧邻）
		const actions = this.footerEl.createDiv({ cls: "tah-footer-actions" });
		const templateSelect = actions.createEl("select", { cls: "tah-template-select" });
		templateSelect.createEl("option", { text: "无模板（默认）", value: "" });
		for (const template of this.plugin.settings.templates) {
			templateSelect.createEl("option", { text: template.name, value: template.id });
		}
		templateSelect.value = this.selectedTemplateId;
		templateSelect.addEventListener("change", () => {
			this.selectedTemplateId = templateSelect.value;
		});

		const btn = actions.createEl("button", { text: "生成报告" });
		btn.addClass("tah-generate-btn");
		btn.addEventListener("click", () => void this.generate());
	}

	private updateFooterCount(): void {
		const countEl = this.contentEl.querySelector(".tah-footer-count");
		if (countEl) {
			countEl.setText(`共 ${this.getCheckedTasks().length} 个任务`);
		}
	}

	private async generate(): Promise<void> {
		if (this.generating) return;

		const tasks = this.getCheckedTasks();
		if (tasks.length === 0) {
			new Notice("请先勾选要生成报告的任务");
			return;
		}
		const active = resolveActiveModelConfig(this.plugin.settings);
		if (!active || !active.model) {
			new Notice("请先在插件设置中选择模型并配置 API Key");
			return;
		}
		if (!active.baseUrl || !active.apiKey) {
			new Notice("请先在插件设置中填写所选供应商的 Base URL 和 API Key");
			return;
		}

		this.generating = true;
		const btn = this.contentEl.querySelector(".tah-generate-btn");
		if (btn) {
			btn.textContent = "生成中…";
			btn.setAttribute("disabled", "true");
		}

		try {
			// 使用当前时间范围生成报告（若任务来自手动添加，则用今日范围兜底）
			const range: DateRange = this.resolveReportRange();
			const template = this.plugin.settings.templates.find(
				(t) => t.id === this.selectedTemplateId
			);
			const prompt = buildReportPrompt(tasks, {
				range,
				type: this.reportType,
				language: this.plugin.settings.language,
				templateContent: template?.content,
			});

			const content = await chatCompletion(
				{
					baseUrl: active.baseUrl,
					apiKey: active.apiKey,
					model: active.model,
					temperature: this.plugin.settings.temperature,
					maxTokens: active.maxTokens ?? this.plugin.settings.maxTokens,
					timeoutSeconds: this.plugin.settings.timeoutSeconds,
				},
				[{ role: "user", content: prompt }]
			);

			// 直接保存并打开，无需预览窗口
			const path = await saveReport(
				this.app,
				this.plugin.settings.reportFolder,
				this.reportType,
				range,
				content
			);
			new Notice(`报告已保存：${path}`);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
			this.close();
		} catch (error) {
			const msg = error instanceof AIClientError ? error.message : String(error);
			new Notice(`生成失败：${msg}`);
		} finally {
			this.generating = false;
			if (btn) {
				btn.textContent = "生成报告";
				btn.removeAttribute("disabled");
			}
		}
	}

	/** 计算报告时间范围：优先取勾选任务的最早完成/到期到最晚，否则用本周 */
	private resolveReportRange(): DateRange {
		const tasks = this.getCheckedTasks();
		const dates: string[] = [];
		for (const task of tasks) {
			if (task.completedDate) dates.push(task.completedDate);
			if (task.due) dates.push(task.due);
			if (task.scheduled) dates.push(task.scheduled);
		}
		if (dates.length > 0) {
			dates.sort();
			return { start: dates[0], end: dates[dates.length - 1] };
		}
		const now = new Date();
		return getWeekRangeFallback(now, this.plugin.settings.weekStartsOnMonday);
	}}

/** 本周范围兜底 */
function getWeekRangeFallback(anchor: Date, weekStartsOnMonday: boolean): DateRange {
	const day = anchor.getDay();
	const diff = weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
	const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diff);
	const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
	const fmt = (d: Date) => {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${dd}`;
	};
	return { start: fmt(start), end: fmt(end) };
}
