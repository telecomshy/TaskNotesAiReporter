/**
 * TaskNotes AI Reporter 主插件入口。
 * 提供：设置页、左侧 Ribbon 按钮、命令面板命令，打开"生成报告"交互弹窗。
 */

import { getLanguage, Plugin } from "obsidian";
import { TaskNotesAIHelperSettingTab } from "./src/settings";
import { ReportModal } from "./src/ui/ReportModal";
import { createSourceRepository } from "./src/tasks/obsidianSource";
import type { TaskNotesAIHelperSettings } from "./src/settings/logic";
import { loadSettings as loadSettingsFromIO } from "./src/settings/loadSettings";
import { createProviderSettings, type ProviderSettings } from "./src/settings/providerSettings";
import { createAppSettings, type AppSettings } from "./src/settings/appSettings";
import {
	BUNDLES,
	createTranslator,
	resolveLanguage,
	type UiLanguage,
	type Translator,
} from "./src/i18n";

export default class TaskNotesAIHelperPlugin extends Plugin {
	settings: TaskNotesAIHelperSettings;
	/** 供应商配置门面：命令转移、当前模型解析与密钥读取（见 src/settings/providerSettings.ts）。 */
	providers!: ProviderSettings;
	/** 非供应商设置门面：报告/模板等设置的命令转移与不变式（见 src/settings/appSettings.ts）。 */
	appSettings!: AppSettings;
	/** 当前界面语言的翻译器；由 `applyLanguage` 依据设置与 Obsidian 语言解析。 */
	t: Translator = createTranslator(BUNDLES.en);
	/** 当前解析出的界面语言。 */
	lang: UiLanguage = "en";

	/** Obsidian 显示语言：仅在 onload 读取一次，供 `applyLanguage` 复用。 */
	private obsidianLang = "en";
	private ribbonIcon: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.obsidianLang = getLanguage();
		this.applyLanguage();

		this.addSettingTab(new TaskNotesAIHelperSettingTab(this.app, this));

		// 左侧 Ribbon 快捷按钮（置底）
		this.ribbonIcon = this.addRibbonIcon(
			"sparkles",
			this.t("command.generateReport"),
			() => {
				this.openReportModal();
			}
		);
		this.ribbonIcon.addClass("tah-ribbon-bottom");

		// 命令面板命令：名称在注册时固定，切换界面语言后需重启 Obsidian 才会更新
		// （Obsidian 未提供运行时更新命令名的公开 API）。
		this.addCommand({
			id: "generate-report",
			name: this.t("command.generateReport"),
			callback: () => {
				this.openReportModal();
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = await loadSettingsFromIO({
			loadRaw: () => this.loadData(),
			save: (settings) => this.saveData(settings),
			getSecret: (id) => this.app.secretStorage.getSecret(id),
			setSecret: (id, value) => this.app.secretStorage.setSecret(id, value),
		});

		this.providers = createProviderSettings({
			getState: () => ({
				providers: this.settings.providers,
				activeProviderId: this.settings.activeProviderId,
				activeModel: this.settings.activeModel,
			}),
			commit: (state) => {
				this.settings.providers = state.providers;
				this.settings.activeProviderId = state.activeProviderId;
				this.settings.activeModel = state.activeModel;
				void this.saveSettings();
			},
			getSecret: (id) => this.app.secretStorage.getSecret(id),
		});

		this.appSettings = createAppSettings({
			getState: () => ({
				reportFolder: this.settings.reportFolder,
				taskSource: this.settings.taskSource,
				dateFields: this.settings.dateFields,
				weekStartsOnMonday: this.settings.weekStartsOnMonday,
				language: this.settings.language,
				uiLanguage: this.settings.uiLanguage,
				templates: this.settings.templates,
				selectedTemplateId: this.settings.selectedTemplateId,
			}),
			commit: (state) => {
				this.settings.reportFolder = state.reportFolder;
				this.settings.taskSource = state.taskSource;
				this.settings.dateFields = state.dateFields;
				this.settings.weekStartsOnMonday = state.weekStartsOnMonday;
				this.settings.language = state.language;
				this.settings.uiLanguage = state.uiLanguage;
				this.settings.templates = state.templates;
				this.settings.selectedTemplateId = state.selectedTemplateId;
				void this.saveSettings();
			},
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** 依据缓存的 Obsidian 语言与 `uiLanguage` 设置重新解析界面语言与翻译器。 */
	applyLanguage(): void {
		this.lang = resolveLanguage(this.obsidianLang, this.settings.uiLanguage);
		this.t = createTranslator(BUNDLES[this.lang]);
		// ribbon 悬浮提示可即时更新；命令面板名称受 Obsidian API 限制，重启后生效。
		this.ribbonIcon?.setAttribute("aria-label", this.t("command.generateReport"));
	}

	openReportModal(): void {
		new ReportModal(
			this.app,
			this,
			createSourceRepository(this.app, this.settings.taskSource)
		).open();
	}
}
