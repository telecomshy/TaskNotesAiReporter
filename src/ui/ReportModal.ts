/**
 * 生成报告主弹窗。
 * 只有一个任务列表区域：通过「选择任务」窗口追加任务，列表中的任务全部送模型生成报告。
 * 每项右侧的小 × 直接从列表移除；工具栏的「清空」清空整个列表。
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import { resolveActiveModelConfig } from "../settings/logic";
import type { ReportType, TaskInfo } from "../types";
import type { Translator } from "../i18n";
import type { TaskRepository } from "../tasks/repository";
import { chatCompletion } from "../ai/client";
import { describeAIError } from "../ai/errorMessage";
import { saveReport } from "../report/writer";
import { generateReport, type GenerateReportFailureReason } from "../report/generate";
import { TaskPickerModal } from "./TaskPickerModal";
import { renderTaskMeta } from "./taskMeta";
import { getAddableTasks } from "./taskSelection";
import {
	applyGenerateButtonState,
	getGenerateButtonState,
} from "./generateButton";

export class ReportModal extends Modal {
	private allTasks: TaskInfo[] = [];
	private candidateTasks = new Map<string, TaskInfo>();
	private reportType: ReportType = "custom";

	private listWrapEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private generateBtn: HTMLButtonElement | null = null;
	private generating = false;
	// 记录并记住上次选择的模板（空字符串表示不选模板，极简模式）
	private selectedTemplateId = "";

	constructor(
		app: App,
		private plugin: TaskNotesAIHelperPlugin,
		private repository: TaskRepository
	) {
		super(app);
		// 打开弹窗时恢复上次选择的模板
		this.selectedTemplateId = this.plugin.settings.selectedTemplateId ?? "";
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root-narrow");
		this.setTitle(this.plugin.t("report.title"));

		// 一次性创建容器结构（后续 render* 只填充，不再新建）
		this.listWrapEl = contentEl.createDiv({ cls: "tah-main" });
		this.footerEl = contentEl.createDiv({ cls: "tah-modal-footer" });

		this.renderTaskList();
		this.renderFooter();

		// 加载任务
		this.listWrapEl.empty();
		this.listWrapEl.createDiv({ text: this.plugin.t("report.loading"), cls: "tah-loading" });
		const tasks = await this.repository.list();
		if (tasks === null) {
			this.listWrapEl.empty();
			this.listWrapEl.createEl("p", {
				text: this.plugin.t("report.tasknotesMissing"),
				cls: "tah-error",
			});
			return;
		}
		this.allTasks = tasks;
		this.renderTaskList();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ===== 任务列表 =====

	/** 所有候选任务（按加入顺序），即报告任务集合 */
	private getCandidateTasks(): TaskInfo[] {
		return Array.from(this.candidateTasks.values());
	}

	private renderTaskList(): void {
		this.listWrapEl.empty();

		const tasks = this.getCandidateTasks();

		// 页头：标题（含计数）在左，「清空」在右
		const header = this.listWrapEl.createDiv({ cls: "tah-main-header" });
		header.createEl("h3", {
			text: this.plugin.t("report.joinedTasks", { count: tasks.length }),
		});
		const clearBtn = header.createEl("button", {
			text: this.plugin.t("report.clear"),
			cls: "tah-batch-remove-btn",
		});
		clearBtn.disabled = tasks.length === 0;
		clearBtn.addEventListener("click", () => {
			this.candidateTasks.clear();
			this.renderTaskList();
		});

		// 任务列表
		const listEl = this.listWrapEl.createDiv({ cls: "tah-task-list" });

		if (tasks.length === 0) {
			listEl.createDiv({
				text: this.plugin.t("report.empty"),
				cls: "tah-empty",
			});
		}

		for (const task of tasks) {
			const item = listEl.createDiv({ cls: "tah-task-item" });

			const info = item.createDiv({ cls: "tah-task-info" });
			const titleEl = info.createDiv({ cls: "tah-task-title" });
			titleEl.setText(task.title);
			renderTaskMeta(info, task, this.plugin.t);

			const removeBtn = item.createEl("button", { text: "×", cls: "tah-task-remove" });
			removeBtn.setAttr("aria-label", this.plugin.t("report.removeAria"));
			removeBtn.addEventListener("click", () => {
				this.candidateTasks.delete(task.path);
				this.renderTaskList();
			});
		}

		// 选择任务按钮
		const addRow = this.listWrapEl.createDiv({ cls: "tah-add-row" });
		const addBtn = addRow.createEl("button", { text: this.plugin.t("report.addTasks") });
		addBtn.addClass("tah-add-btn");
		addBtn.addEventListener("click", () => this.openTaskPicker());
		if (tasks.length > 0) {
			addRow.createDiv({
				text: this.plugin.t("report.appendHint"),
				cls: "tah-hint",
			});
		}
	}

	private openTaskPicker(): void {
		const addable = getAddableTasks(this.allTasks, new Set(this.candidateTasks.keys()));
		new TaskPickerModal(
			this.app,
			addable,
			this.plugin.settings.dateFields,
			this.plugin.settings.weekStartsOnMonday,
			this.plugin.t,
			this.plugin.lang,
			(tasks) => {
				for (const task of tasks) {
					this.candidateTasks.set(task.path, task);
				}
				this.renderTaskList();
				new Notice(this.plugin.t("notice.addedTasks", { count: tasks.length }));
			}
		).open();
	}

	// ===== 底部 =====

	private renderFooter(): void {
		this.footerEl.empty();

		// 右侧：模板下拉 + 生成按钮（紧邻）
		const actions = this.footerEl.createDiv({ cls: "tah-footer-actions" });
		const templateSelect = actions.createEl("select", { cls: "tah-template-select" });
		templateSelect.createEl("option", {
			text: this.plugin.t("report.noTemplate"),
			value: "",
		});
		for (const template of this.plugin.settings.templates) {
			templateSelect.createEl("option", { text: template.name, value: template.id });
		}
		templateSelect.value = this.selectedTemplateId;
		templateSelect.addEventListener("change", () => {
			this.selectedTemplateId = templateSelect.value;
			// 记住本次选择，下次打开弹窗自动恢复
			this.plugin.settings.selectedTemplateId = templateSelect.value;
			void this.plugin.saveSettings();
		});

		const btn = actions.createEl("button", { text: this.plugin.t("report.generate") });
		btn.addClass("tah-generate-btn");
		btn.addEventListener("click", () => void this.generate());
		this.generateBtn = btn;
	}

	private async generate(): Promise<void> {
		if (this.generating) return;

		this.generating = true;
		if (this.generateBtn) {
			applyGenerateButtonState(
				this.generateBtn,
				getGenerateButtonState(true, this.plugin.t("report.generate"))
			);
		}

		try {
			const s = this.plugin.settings;
			const result = await generateReport(
				{
					tasks: this.getCandidateTasks(),
					type: this.reportType,
					templateId: this.selectedTemplateId,
					templates: s.templates,
					language: s.language,
					weekStartsOnMonday: s.weekStartsOnMonday,
					reportFolder: s.reportFolder,
					activeModel: resolveActiveModelConfig(s),
					temperature: s.temperature,
					maxTokens: s.maxTokens,
					timeoutSeconds: s.timeoutSeconds,
				},
				{
					repository: this.repository,
					chat: (prompt, config) => chatCompletion(config, [{ role: "user", content: prompt }]),
					save: (folder, type, range, content, templateName) =>
						saveReport(this.app, folder, type, range, content, templateName),
					now: () => new Date(),
				}
			);

			if (result.ok) {
				new Notice(this.plugin.t("report.saved", { path: result.path }));
				const file = this.app.vault.getAbstractFileByPath(result.path);
				if (file instanceof TFile) {
					await this.app.workspace.getLeaf(false).openFile(file);
				}
				this.close();
			} else {
				new Notice(failureMessage(result, this.plugin.t));
			}
		} finally {
			this.generating = false;
			if (this.generateBtn) {
				applyGenerateButtonState(
					this.generateBtn,
					getGenerateButtonState(false, this.plugin.t("report.generate"))
				);
			}
		}
	}
}

/** 把生成失败的原因种类映射为用户提示。 */
function failureMessage(
	failure: { reason: GenerateReportFailureReason; message?: string; error?: unknown },
	t: Translator
): string {
	switch (failure.reason) {
		case "no-tasks":
			return t("report.failureNoTasks");
		case "no-model":
			return t("report.failureNoModel");
		case "missing-credentials":
			return t("report.failureMissingCredentials");
		default:
			return t("report.failureGeneric", {
				message: describeAIError(failure.error ?? failure.message, t),
			});
	}
}
