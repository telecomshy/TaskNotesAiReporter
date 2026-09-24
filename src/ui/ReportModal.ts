/**
 * 生成报告主弹窗。
 * 只有一个任务列表区域：通过「选择任务」窗口追加任务，列表中的任务全部送模型生成报告。
 * 每项右侧的小 × 直接从列表移除；工具栏的「清空」清空整个列表。
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import type { ReportType, TaskInfo } from "../types";
import type { TaskRepository } from "../tasks/repository";
import { chatCompletion } from "../ai/client";
import { saveReport } from "../report/writer";
import { createGeneration, type GenerateSettings } from "../report/generate";
import { describeReportFailure } from "../report/errorMessage";
import { TaskPickerModal } from "./TaskPickerModal";
import { renderTaskMeta } from "./taskMeta";
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
	private extraRequirementsInput: HTMLTextAreaElement | null = null;
	private generating = false;
	/** 按钮壳状态（生成中禁用按钮）；行为权威是 module 入口的重入守卫（其测试钉住「双击只出一份」）。 */
	private generateEntry: ReturnType<typeof createGeneration> | null = null;
	/** 界面打开时打开的仓库；生成期间沿用它，不重判来源缺失（见 #45 / #49 修订）。 */
	private repository: TaskRepository | null = null;
	// 记录并记住上次选择的模板（空字符串表示不选模板，极简模式）
	private selectedTemplateId = "";

	constructor(
		app: App,
		private plugin: TaskNotesAIHelperPlugin,
		private openRepository: () => TaskRepository | null
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

		// 打开任务仓库：来源判定只在此处做一次（仓库缺席即「来源缺失」，见 #45）
		const repository = this.openRepository();
		if (!repository) {
			this.renderSourceMissing();
			return;
		}
		this.repository = repository;

		// 加载任务
		this.listWrapEl.empty();
		this.listWrapEl.createDiv({ text: this.plugin.t("report.loading"), cls: "tah-loading" });
		const tasks = await this.repository.list();
		if (tasks === null) {
			this.renderSourceMissing();

			return;
		}
		this.allTasks = tasks;
		this.renderTaskList();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ===== 任务列表 =====

	/** 来源缺失的降级提示（文案键由「来源」深 module 一处陈述，见 #45）。 */
	private renderSourceMissing(): void {
		this.listWrapEl.empty();
		this.listWrapEl.createEl("p", {
			text: this.plugin.t("report.tasknotesMissing"),
			cls: "tah-error",
		});
	}

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
				this.candidateTasks.delete(task.id);
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
		new TaskPickerModal(
			this.app,
			this.allTasks,
			this.plugin.settings.dateFields,
			new Set(this.candidateTasks.keys()),
			this.plugin.settings.weekStartsOnMonday,
			this.plugin.t,
			this.plugin.lang,
			(tasks) => {
				for (const task of tasks) {
					this.candidateTasks.set(task.id, task);
				}
				this.renderTaskList();
				new Notice(this.plugin.t("notice.addedTasks", { count: tasks.length }));
			}
		).open();
	}

	// ===== 底部 =====

	private renderFooter(): void {
		this.footerEl.empty();

		// 附加要求：单独一行，标签 + 多行输入（仅本次生成有效，每次打开为空）
		const extraLabel = this.footerEl.createEl("label", { cls: "tah-extra-requirements" });
		extraLabel.createSpan({
			text: this.plugin.t("report.extraRequirements"),
			cls: "tah-extra-requirements-label",
		});
		this.extraRequirementsInput = extraLabel.createEl("textarea", {
			cls: "tah-extra-requirements-input",
		});
		this.extraRequirementsInput.rows = 2;
		this.extraRequirementsInput.placeholder = this.plugin.t(
			"report.extraRequirementsPlaceholder"
		);

		// 模板下拉 + 生成按钮（右对齐）
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
			void this.plugin.appSettings.setSelectedTemplateId(templateSelect.value);
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
			// 界面打开时已打开仓库；生成期间沿用它，中途读不到数据按缺详情约定处理（#49 修订一）
			const repository = this.repository;
			if (!repository) return;

			// 装配层接线：用户意图之外的一切（设置查询、当前模型、chat / save、时间源）在此注入，
			// 界面不拼参数（#49 修订三）。入口只建一次：重入守卫在 module 内，双击只产出一份报告。
			const generate = (this.generateEntry ??= createGeneration({
				repository,
				settings: (): GenerateSettings => {
					const s = this.plugin.settings;
					return {
						language: s.language,
						weekStartsOnMonday: s.weekStartsOnMonday,
						reportFolder: s.reportFolder,
						temperature: s.temperature,
						maxTokens: s.maxTokens,
						timeoutSeconds: s.timeoutSeconds,
						templates: s.templates,
					};
				},
				resolveModel: () => this.plugin.providers.resolveActive(),
				chat: (prompt, config) => chatCompletion(config, [{ role: "user", content: prompt }]),
				save: (folder, type, range, content, templateName) =>
					saveReport(this.app, folder, type, range, content, templateName),
				now: () => new Date(),
			}));

			const result = await generate({
				tasks: this.getCandidateTasks(),
				templateId: this.selectedTemplateId,
				reportType: this.reportType,
				extraRequirements: this.extraRequirementsInput?.value,
			});

			if (result.ok === true) {
				new Notice(this.plugin.t("report.saved", { path: result.path }));
				const file = this.app.vault.getAbstractFileByPath(result.path);
				if (file instanceof TFile) {
					await this.app.workspace.getLeaf(false).openFile(file);
				}
				this.close();
			} else if (result.ok === false) {
				new Notice(describeReportFailure(result, this.plugin.t));
			}
			// ok === "generating"：module 的重入守卫接住的并发点击，界面静默（按钮此时已禁用）
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
