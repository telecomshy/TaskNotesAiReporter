/**
 * TaskNotes AI Reporter 主插件入口。
 * 提供：设置页、左侧 Ribbon 按钮、命令面板命令，打开"生成报告"交互弹窗。
 */

import { getLanguage, Plugin } from "obsidian";
import { TaskNotesAIHelperSettingTab } from "./src/settings";
import { ReportModal } from "./src/ui/ReportModal";
import { obsidianTaskRepository } from "./src/tasks/obsidian";
import { openSource as openTaskSource } from "./src/source";
import type { TaskNotesAIHelperSettings } from "./src/settings/logic";
import { loadSettings as loadSettingsFromIO } from "./src/settings/loadSettings";
import { createSettingsOwner, type SettingsOwner } from "./src/settings/owner";
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
	/**
	 * 设置 owner：自持状态与落盘（见 src/settings/owner.ts）。
	 * 下面的 `settings` 就是 owner 的唯一副本（同一对象，永不换引用），故读取恒为最新。
	 */
	private settingsOwner!: SettingsOwner;
	/**
	 * 设置查询：owner 自持的唯一副本，**调用方只读**。
	 * 一切变更走 `appSettings` / `providers` 的命令，不再直接赋值（见 #46）。
	 */
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
		const io = {
			loadRaw: () => this.loadData(),
			save: (settings: TaskNotesAIHelperSettings) => this.saveData(settings),
			getSecret: (id: string) => this.app.secretStorage.getSecret(id),
			setSecret: (id: string, value: string) => void this.app.secretStorage.setSecret(id, value),
		};
		// 设置 owner：自持状态与落盘（见 ADR-0012 推广 / #46）。接线层不再逐字段搬运设置切片。
		this.settingsOwner = createSettingsOwner(await loadSettingsFromIO(io), io);
		this.settings = this.settingsOwner.get();
		this.providers = createProviderSettings({ owner: this.settingsOwner });
		this.appSettings = createAppSettings(this.settingsOwner);
	}

	async saveSettings(): Promise<void> {
		this.settingsOwner.persist();
	}

	/** 依据缓存的 Obsidian 语言与 `uiLanguage` 设置重新解析界面语言与翻译器。 */
	applyLanguage(): void {
		this.lang = resolveLanguage(this.obsidianLang, this.settings.uiLanguage);
		this.t = createTranslator(BUNDLES[this.lang]);
		// ribbon 悬浮提示可即时更新；命令面板名称受 Obsidian API 限制，重启后生效。
		this.ribbonIcon?.setAttribute("aria-label", this.t("command.generateReport"));
	}

	openReportModal(): void {
		// 打开来源：来源切换 / 检测的唯一入口（见 #45）。
		// obsidian-tasks 在 #53 落地前走「来源缺失」降级：不崩、可单独合并。
		const open = () =>
			openTaskSource(this.settings.taskSource, {
				tasknotes: () => obsidianTaskRepository(this.app),
				"obsidian-tasks": () => null,
			});
		new ReportModal(this.app, this, open).open();
	}
}
