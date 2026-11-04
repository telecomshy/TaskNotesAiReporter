/**
 * 生成报告主弹窗：左侧筛选任务、右侧报告集合，底部模板 / 附加要求 / 生成。
 * 「选择任务」不再单独开窗；点击左栏任务即加入右栏，右栏是唯一的移除入口。
 * 列表中的任务全部送模型生成报告。
 */

import { App, Modal, Notice, TFile } from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import type { TaskInfo } from "../types";
import type { TaskRepository } from "../tasks/repository";
import { chatCompletion } from "../ai/client";
import { saveReport } from "../report/writer";
import { createGeneration, type GenerateSettings } from "../report/generate";
import { describeReportFailure } from "../report/errorMessage";
import { runAndAnnounceThinkingTest } from "./thinkingTestAction";
import { TaskSelectionView } from "./TaskSelectionView";
import {
	applyGenerateButtonState,
	getGenerateButtonState,
} from "./generateButton";

export class ReportModal extends Modal {
	private selectionView: TaskSelectionView | null = null;

	private bodyEl!: HTMLElement;
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
		this.modalEl.addClass("tah-modal-root");
		this.setTitle(this.plugin.t("report.title"));

		// 一次性创建容器结构（后续 render* 只填充，不再新建）
		this.bodyEl = contentEl.createDiv({ cls: "tah-selection-body" });
		this.footerEl = contentEl.createDiv({ cls: "tah-modal-footer" });
		this.renderFooter();

		// 打开任务仓库：来源判定只在此处做一次（仓库缺席即「来源缺失」，见 #45）
		const repository = this.openRepository();
		if (!repository) {
			this.renderSourceMissing();
			return;
		}
		this.repository = repository;

		// 加载任务
		this.bodyEl.empty();
		this.bodyEl.createDiv({ text: this.plugin.t("report.loading"), cls: "tah-loading" });
		const tasks = await this.repository.list();
		if (tasks === null) {
			this.renderSourceMissing();
			return;
		}

		// 任务就绪后锁定弹窗高度；加载 / 来源缺失态仍按内容自适应
		this.contentEl.addClass("tah-report-ready");
		this.bodyEl.empty();
		this.selectionView = new TaskSelectionView({
			container: this.bodyEl,
			dateFields: this.plugin.settings.dateFields,
			weekStartsOnMonday: this.plugin.settings.weekStartsOnMonday,
			t: this.plugin.t,
			lang: this.plugin.lang,
		});
		this.selectionView.setTasks(tasks);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** 来源缺失的降级提示（文案键由「来源」深 module 一处陈述，见 #45）。 */
	private renderSourceMissing(): void {
		this.bodyEl.empty();
		this.bodyEl.createEl("p", {
			text: this.plugin.t("report.tasknotesMissing"),
			cls: "tah-error",
		});
	}

	/** 右栏当前集合，即报告任务集合 */
	private getJoinedTasks(): TaskInfo[] {
		return this.selectionView?.getJoinedTasks() ?? [];
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
				save: (folder, range, content, templateName) =>
					saveReport(this.app, folder, range, content, templateName),
				now: () => new Date(),
			}));

			const result = await generate({
				tasks: this.getJoinedTasks(),
				templateId: this.selectedTemplateId,
				extraRequirements: this.extraRequirementsInput?.value,
			});

			if (result.ok === true) {
				new Notice(this.plugin.t("report.saved", { path: result.path }));
				// 假关（设「关」而响应仍带推理段）：一次性非阻断告警，内含「重新测试」动作（#84 / #89）
				if (result.fakeOff) this.showFakeOffWarning();
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

	/**
	 * 假关告警（#84 / #89）：一次性非阻断告警，内含「重新测试」动作——
	 * 习得能力出错时的修正路径之一（设置页习得行另有「重新测试」文字入口）。
	 */
	private showFakeOffWarning(): void {
		const t = this.plugin.t;
		// 一次性告警（US29）：默认时长自动消失；重测出路另有设置页常驻入口（ADR-0026）
		const notice = new Notice(t("report.thinkingFakeOff"));
		const retestBtn = notice.messageEl.createEl("button", {
			text: t("report.thinkingFakeOffRetest"),
		});
		retestBtn.addEventListener("click", () => {
			notice.hide();
			void this.retestThinking();
		});
	}

	/**
	 * 假关告警的「重新测试」（#89）：走共享流程——解析失败不动习得；清习得并重跑；中断不留结论。
	 * 解析失败同样提示「请先选择模型」（与设置页测试入口一致，不留静默路径）。
	 */
	private async retestThinking(): Promise<void> {
		await runAndAnnounceThinkingTest(
			{
				providers: this.plugin.providers,
				timeoutSeconds: this.plugin.settings.timeoutSeconds,
				t: this.plugin.t,
			},
			true
		);
	}
}
