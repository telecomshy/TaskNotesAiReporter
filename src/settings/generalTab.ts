/**
 * 设置页「常规配置」Tab：模型选择下拉 + 报告相关配置。
 * 本模块只导出 renderGeneralTab 入口。
 */

import { Setting } from "obsidian";
import { DATE_FIELDS, DEFAULT_SETTINGS } from "../types";
import { dateFieldLabelKey, type Translator } from "../i18n";
import type { AppSettings } from "./appSettings";
import type { SettingsSnapshot } from "./owner";

/** 「常规配置」Tab 的依赖面：非供应商设置命令与界面语言应用。 */
export interface GeneralTabContext {
	settings: SettingsSnapshot;
	appSettings: AppSettings;
	t: Translator;
	applyLanguage: () => void;
	refresh: () => void;
}

/** 渲染「常规配置」Tab */
export function renderGeneralTab(container: HTMLElement, ctx: GeneralTabContext): void {
	const t = ctx.t;
	container.createEl("h3", { text: t("settings.generalHeading") });

	new Setting(container)
		.setName(t("settings.reportFolderName"))
		.setDesc(t("settings.reportFolderDesc"))
		.addText((text) =>
			text
				.setPlaceholder(DEFAULT_SETTINGS.reportFolder)
				.setValue(ctx.settings.reportFolder)
				.onChange((value) => {
					void ctx.appSettings.setReportFolder(value);
				})
		);

	container.createEl("h4", { text: t("settings.dateFieldsHeading") });
	container.createEl("p", {
		text: t("settings.dateFieldsDesc"),
		cls: "setting-item-description",
	});

	// 日期口径逐项来自模型层清单（见 #81）：加一个口径 = 清单一项 + 双语两个文案键
	for (const field of DATE_FIELDS) {
		new Setting(container)
			.setName(t(dateFieldLabelKey(field)))
			.addToggle((toggle) =>
				toggle
					.setValue(ctx.settings.dateFields.includes(field))
					.onChange((value) => {
						void ctx.appSettings.toggleDateField(field, value);
					})
			);
	}

	new Setting(container)
		.setName(t("settings.weekStartsMondayName"))
		.setDesc(t("settings.weekStartsMondayDesc"))
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.settings.weekStartsOnMonday)
				.onChange((value) => {
					void ctx.appSettings.setWeekStartsOnMonday(value);
				})
		);

	new Setting(container)
		.setName(t("settings.reportLanguageName"))
		.setDesc(t("settings.reportLanguageDesc"))
		.addText((text) =>
			text
				.setPlaceholder(t("settings.reportLanguagePlaceholder"))
				.setValue(ctx.settings.language)
				.onChange((value) => {
					void ctx.appSettings.setReportLanguage(value);
				})
		);

	// 界面语言：默认「自动」跟随 Obsidian；切换后立即重建翻译器并刷新设置页
	new Setting(container)
		.setName(t("settings.uiLanguageName"))
		.setDesc(t("settings.uiLanguageDesc"))
		.addDropdown((dropdown) =>
			dropdown
				.addOption("auto", t("settings.uiLanguageAuto"))
				.addOption("zh", t("settings.uiLanguageZh"))
				.addOption("en", t("settings.uiLanguageEn"))
				.setValue(ctx.settings.uiLanguage)
				.onChange((value) => {
					void ctx.appSettings.setUiLanguage(value);
					ctx.applyLanguage();
					ctx.refresh();
				})
		);
}
