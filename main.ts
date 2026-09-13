/**
 * TaskNotes AI Reporter 主插件入口。
 * 提供：设置页、左侧 Ribbon 按钮、命令面板命令，打开"生成报告"交互弹窗。
 */

import { getLanguage, Plugin } from "obsidian";
import { TaskNotesAIHelperSettingTab } from "./src/settings";
import { ReportModal } from "./src/ui/ReportModal";
import { obsidianTaskRepository } from "./src/tasks/obsidian";
import { normalizeSettings, type TaskNotesAIHelperSettings } from "./src/settings/logic";
import { importPendingSecrets } from "./src/settings/secrets";
import {
	BUNDLES,
	createTranslator,
	resolveLanguage,
	type UiLanguage,
	type Translator,
} from "./src/i18n";

export default class TaskNotesAIHelperPlugin extends Plugin {
	settings: TaskNotesAIHelperSettings;
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
		const data: unknown = await this.loadData();
		const { settings: normalized, pendingSecrets } = normalizeSettings(data);
		// 一次性迁移：把旧版明文密钥导入 SecretStorage，只保留密钥名
		const { settings, changed } = importPendingSecrets(normalized, pendingSecrets, {
			get: (id) => this.app.secretStorage.getSecret(id),
			set: (id, value) => this.app.secretStorage.setSecret(id, value),
		});
		this.settings = settings;
		if (changed) await this.saveSettings();
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
		new ReportModal(this.app, this, obsidianTaskRepository(this.app)).open();
	}
}
