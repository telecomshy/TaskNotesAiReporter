/**
 * 生成报告主弹窗：左侧筛选任务、右侧报告集合，底部模板 / 附加要求 / 生成。
 * 「选择任务」不再单独开窗；点击左栏任务即加入右栏，右栏是唯一的移除入口。
 * 列表中的任务全部送模型生成报告。
 *
 * 依赖走封闭清单 `ReportModalContext`（#101，镜像 ModelTabContext 先例）：
 * 弹窗不再触碰 plugin，装配（7 字段投影 + chat / save 接线）在 pluginGeneration 工厂，
 * 由 main.ts 在 context 里预绑 `createGeneration`。
 */

import { Modal, Notice, TFile, type App } from "obsidian";
import type { TaskInfo } from "../types";
import type { TaskRepository } from "../tasks/repository";
import type { GenerateEntry } from "../report/generate";
import type { SettingsSnapshot } from "../settings/owner";
import type { AppSettings } from "../settings/appSettings";
import type { ThinkingTestStateSlice } from "../ai/thinkingTest";
import type { Translator, UiLanguage } from "../i18n";
import { describeReportFailure } from "../report/errorMessage";
import { runAndAnnounceThinkingTest } from "./thinkingTestAction";
import { TaskSelectionView } from "./TaskSelectionView";
import {
	applyGenerateButtonState,
	getGenerateButtonState,
} from "./generateButton";

/** 弹窗的依赖面（#101 封闭清单）：视图读设置快照、模板选择落 appSettings、重测走窄切片。 */
export interface ReportModalContext {
	app: App;
	/** 设置快照（视图读：dateFields / weekStartsOnMonday / templates / selectedTemplateId / timeoutSeconds）。 */
	settings: SettingsSnapshot;
	/** 非供应商设置门面：footer 记住所选模板。 */
	appSettings: AppSettings;
	/** 供应商门面切片：仅假关告警的「重新测试」需要（ThinkingTestStateSlice，ProviderSettings 满足）。 */
	providers: ThinkingTestStateSlice;
	t: Translator;
	lang: UiLanguage;
	/** 打开任务仓库：TaskNotes 运行时不可用时返回 null（= 来源缺失，见 CONTEXT.md）。 */
	openRepository: () => TaskRepository | null;
	/** 生成入口工厂：repository 就绪时调用一次，入口自持重入守卫（双击只出一份报告）。 */
	createGeneration: (repository: TaskRepository) => GenerateEntry;
}

export class ReportModal extends Modal {
	private selectionView: TaskSelectionView | null = null;

	private bodyEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private generateBtn: HTMLButtonElement | null = null;
	private extraRequirementsInput: HTMLTextAreaElement | null = null;
	private generating = false;
	/**
	 * 生成入口：onOpen 里 repository 就绪后即建（#101）；重入守卫在 module 入口内。
	 * 为 null ⇔ 打开时 来源缺失——此时生成按钮仍可见，点击弹提示（摩擦 #19），不留静默路径。
	 */
	private generateEntry: GenerateEntry | null = null;
	// 记录并记住上次选择的模板（空字符串表示不选模板，极简模式）
	private selectedTemplateId = "";

	constructor(private ctx: ReportModalContext) {
		super(ctx.app);
		// 打开弹窗时恢复上次选择的模板
		this.selectedTemplateId = this.ctx.settings.selectedTemplateId ?? "";
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root");
		this.setTitle(this.ctx.t("report.title"));

		// 一次性创建容器结构（后续 render* 只填充，不再新建）
		this.bodyEl = contentEl.createDiv({ cls: "tah-selection-body" });
		this.footerEl = contentEl.createDiv({ cls: "tah-modal-footer" });
		this.renderFooter();

		// 打开任务仓库：来源判定只在此处做一次（仓库缺席即「来源缺失」，见 #45）
		const repository = this.ctx.openRepository();
		if (!repository) {
			this.renderSourceMissing();
			return;
		}
		// 生成入口在 repository 就绪后即建（#101）：仓库每次打开固定，入口闭包持有它，
		// 生成期间沿用、不重判来源缺失；装配（投影 + chat / save 接线）在工厂内（#49 修订三）。
		this.generateEntry = this.ctx.createGeneration(repository);

		// 加载任务
		this.bodyEl.empty();
		this.bodyEl.createDiv({ text: this.ctx.t("report.loading"), cls: "tah-loading" });
		const tasks = await repository.list();
		if (tasks === null) {
			this.renderSourceMissing();
			return;
		}

		// 任务就绪后锁定弹窗高度；加载 / 来源缺失态仍按内容自适应
		this.contentEl.addClass("tah-report-ready");
		this.bodyEl.empty();
		// 状态目录与报告生成同一来源（repository.statuses()，见 ADR-0021）；读不到即空目录
		const statuses = await repository.statuses();
		this.selectionView = new TaskSelectionView({
			container: this.bodyEl,
			dateFields: this.ctx.settings.dateFields,
			statuses,
			weekStartsOnMonday: this.ctx.settings.weekStartsOnMonday,
			t: this.ctx.t,
			lang: this.ctx.lang,
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
			text: this.ctx.t("report.tasknotesMissing"),
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
		const t = this.ctx.t;

		// 附加要求：单独一行，标签 + 多行输入（仅本次生成有效，每次打开为空）
		const extraLabel = this.footerEl.createEl("label", { cls: "tah-extra-requirements" });
		extraLabel.createSpan({
			text: t("report.extraRequirements"),
			cls: "tah-extra-requirements-label",
		});
		this.extraRequirementsInput = extraLabel.createEl("textarea", {
			cls: "tah-extra-requirements-input",
		});
		this.extraRequirementsInput.rows = 2;
		this.extraRequirementsInput.placeholder = t("report.extraRequirementsPlaceholder");

		// 模板下拉 + 生成按钮（右对齐）
		const actions = this.footerEl.createDiv({ cls: "tah-footer-actions" });
		const templateSelect = actions.createEl("select", { cls: "tah-template-select" });
		templateSelect.createEl("option", {
			text: t("report.noTemplate"),
			value: "",
		});
		for (const template of this.ctx.settings.templates) {
			templateSelect.createEl("option", { text: template.name, value: template.id });
		}
		templateSelect.value = this.selectedTemplateId;
		templateSelect.addEventListener("change", () => {
			this.selectedTemplateId = templateSelect.value;
			// 记住本次选择，下次打开弹窗自动恢复
			void this.ctx.appSettings.setSelectedTemplateId(templateSelect.value);
		});

		const btn = actions.createEl("button", { text: t("report.generate") });
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
				getGenerateButtonState(true, this.ctx.t("report.generate"))
			);
		}

		try {
			const generate = this.generateEntry;
			// 来源缺失态（摩擦 #19）：入口缺席 ⇔ 打开时仓库缺席；点击给提示，不留静默路径。
			if (!generate) {
				new Notice(this.ctx.t("report.tasknotesMissing"));
				return;
			}

			const result = await generate({
				tasks: this.getJoinedTasks(),
				templateId: this.selectedTemplateId,
				extraRequirements: this.extraRequirementsInput?.value,
			});

			if (result.ok === true) {
				new Notice(this.ctx.t("report.saved", { path: result.path }));
				// 假关（设「关」而响应仍带推理段）：一次性非阻断告警，内含「重新测试」动作（#84 / #89）
				if (result.fakeOff) this.showFakeOffWarning();
				const file = this.app.vault.getAbstractFileByPath(result.path);
				if (file instanceof TFile) {
					await this.app.workspace.getLeaf(false).openFile(file);
				}
				this.close();
			} else if (result.ok === false) {
				new Notice(describeReportFailure(result, this.ctx.t));
			}
			// ok === "generating"：module 的重入守卫接住的并发点击，界面静默（按钮此时已禁用）
		} finally {
			this.generating = false;
			if (this.generateBtn) {
				applyGenerateButtonState(
					this.generateBtn,
					getGenerateButtonState(false, this.ctx.t("report.generate"))
				);
			}
		}
	}

	/**
	 * 假关告警（#84 / #89）：一次性非阻断告警，内含「重新测试」动作——
	 * 习得能力出错时的修正路径之一（设置页习得行另有「重新测试」文字入口）。
	 */
	private showFakeOffWarning(): void {
		const t = this.ctx.t;
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
				providers: this.ctx.providers,
				timeoutSeconds: this.ctx.settings.timeoutSeconds,
				t: this.ctx.t,
			},
			true
		);
	}
}
