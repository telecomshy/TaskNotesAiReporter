/**
 * 设置页「常规配置」Tab：模型选择下拉 + 报告相关配置。
 * 本模块只导出 renderGeneralTab 入口。
 */

import { Setting } from "obsidian";
import type { TaskSource } from "../types";
import type { SettingsTabContext } from "./index";
import { DATE_FIELD_TABLE } from "../core/dateFields";

const TASK_SOURCE_OPTIONS: Array<{ value: TaskSource; key: string }> = [
	{ value: "tasknotes", key: "settings.taskSourceTaskNotes" },
	{ value: "obsidian-tasks", key: "settings.taskSourceObsidianTasks" },
];

/** 渲染「常规配置」Tab */
export function renderGeneralTab(container: HTMLElement, ctx: SettingsTabContext): void {
	const t = ctx.plugin.t;
	container.createEl("h3", { text: t("settings.generalHeading") });

	// 「来源」下拉置于顶部：它决定后面所有任务相关配置读的是哪份数据（见 #46）
	new Setting(container)
		.setName(t("settings.taskSourceName"))
		.setDesc(t("settings.taskSourceDesc"))
		.addDropdown((dropdown) => {
			for (const option of TASK_SOURCE_OPTIONS) {
				dropdown.addOption(option.value, t(option.key));
			}
			dropdown.setValue(ctx.plugin.settings.taskSource).onChange((value) => {
				ctx.plugin.appSettings.setTaskSource(value as TaskSource);
				ctx.refresh();
			});
		});

	new Setting(container)
		.setName(t("settings.reportFolderName"))
		.setDesc(t("settings.reportFolderDesc"))
		.addText((text) =>
			text
				.setPlaceholder("TaskNotes/Reports")
				.setValue(ctx.plugin.settings.reportFolder)
				.onChange((value) => {
					ctx.plugin.appSettings.setReportFolder(value);
				})
		);

	container.createEl("h4", { text: t("settings.dateFieldsHeading") });
	container.createEl("p", {
		text: t("settings.dateFieldsDesc"),
		cls: "setting-item-description",
	});

	// 日期口径逐项来自「日期口径」表（见 #50）：加一个口径只改那张表
	for (const option of DATE_FIELD_TABLE) {
		new Setting(container)
			.setName(t(option.labelKey))
			.addToggle((toggle) =>
				toggle
					.setValue(ctx.plugin.settings.dateFields.includes(option.field))
					.onChange((value) => {
						ctx.plugin.appSettings.toggleDateField(option.field, value);
					})
			);
	}

	new Setting(container)
		.setName(t("settings.weekStartsMondayName"))
		.setDesc(t("settings.weekStartsMondayDesc"))
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.plugin.settings.weekStartsOnMonday)
				.onChange((value) => {
					ctx.plugin.appSettings.setWeekStartsOnMonday(value);
				})
		);

	new Setting(container)
		.setName(t("settings.reportLanguageName"))
		.setDesc(t("settings.reportLanguageDesc"))
		.addText((text) =>
			text
				.setPlaceholder(t("settings.reportLanguagePlaceholder"))
				.setValue(ctx.plugin.settings.language)
				.onChange((value) => {
					ctx.plugin.appSettings.setReportLanguage(value);
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
				.onChange((value) => {
					ctx.plugin.appSettings.setUiLanguage(value);
					ctx.plugin.applyLanguage();
					ctx.refresh();
				})
		);
}
