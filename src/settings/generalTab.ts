/**
 * 设置页「常规配置」Tab：模型选择下拉 + 报告相关配置。
 * 本模块只导出 renderGeneralTab 入口。
 */

import { Setting } from "obsidian";
import type { DateField } from "../types";
import type { LanguageSetting } from "../i18n";
import type { SettingsTabContext } from "./index";

const DATE_FIELD_KEYS: Array<{ value: DateField; key: string }> = [
	{ value: "completedDate", key: "settings.dateFieldCompletedDate" },
	{ value: "due", key: "settings.dateFieldDue" },
	{ value: "scheduled", key: "settings.dateFieldScheduled" },
	{ value: "dateCreated", key: "settings.dateFieldCreated" },
];

/** 渲染「常规配置」Tab */
export function renderGeneralTab(container: HTMLElement, ctx: SettingsTabContext): void {
	const t = ctx.plugin.t;
	container.createEl("h3", { text: t("settings.generalHeading") });

	new Setting(container)
		.setName(t("settings.reportFolderName"))
		.setDesc(t("settings.reportFolderDesc"))
		.addText((text) =>
			text
				.setPlaceholder("TaskNotes/Reports")
				.setValue(ctx.plugin.settings.reportFolder)
				.onChange(async (value) => {
					ctx.plugin.settings.reportFolder = value.trim();
					await ctx.plugin.saveSettings();
				})
		);

	container.createEl("h4", { text: t("settings.dateFieldsHeading") });
	container.createEl("p", {
		text: t("settings.dateFieldsDesc"),
		cls: "setting-item-description",
	});

	for (const option of DATE_FIELD_KEYS) {
		new Setting(container)
			.setName(t(option.key))
			.addToggle((toggle) =>
				toggle
					.setValue(ctx.plugin.settings.dateFields.includes(option.value))
					.onChange(async (value) => {
						const fields = ctx.plugin.settings.dateFields;
						if (value && !fields.includes(option.value)) {
							fields.push(option.value);
						} else if (!value) {
							const idx = fields.indexOf(option.value);
							if (idx >= 0) fields.splice(idx, 1);
						}
						ctx.plugin.settings.dateFields = fields;
						await ctx.plugin.saveSettings();
					})
			);
	}

	new Setting(container)
		.setName(t("settings.weekStartsMondayName"))
		.setDesc(t("settings.weekStartsMondayDesc"))
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.plugin.settings.weekStartsOnMonday)
				.onChange(async (value) => {
					ctx.plugin.settings.weekStartsOnMonday = value;
					await ctx.plugin.saveSettings();
				})
		);

	new Setting(container)
		.setName(t("settings.reportLanguageName"))
		.setDesc(t("settings.reportLanguageDesc"))
		.addText((text) =>
			text
				.setPlaceholder(t("settings.reportLanguagePlaceholder"))
				.setValue(ctx.plugin.settings.language)
				.onChange(async (value) => {
					ctx.plugin.settings.language = value.trim() || "中文";
					await ctx.plugin.saveSettings();
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
				.setValue(ctx.plugin.settings.uiLanguage)
				.onChange(async (value) => {
					ctx.plugin.settings.uiLanguage = toLanguageSetting(value);
					await ctx.plugin.saveSettings();
					ctx.plugin.applyLanguage();
					ctx.refresh();
				})
		);
}

function toLanguageSetting(value: string): LanguageSetting {
	return value === "zh" || value === "en" ? value : "auto";
}
