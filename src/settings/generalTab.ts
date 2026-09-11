/**
 * 设置页「常规配置」Tab：模型选择下拉 + 报告相关配置。
 * 本模块只导出 renderGeneralTab 入口。
 */

import { Setting } from "obsidian";
import type { DateField } from "../types";
import type { SettingsTabContext } from "./index";

const DATE_FIELD_OPTIONS: Array<{ value: DateField; label: string }> = [
	{ value: "completedDate", label: "完成时间（completedDate）" },
	{ value: "due", label: "到期时间（due）" },
	{ value: "scheduled", label: "计划时间（scheduled）" },
	{ value: "dateCreated", label: "创建时间（dateCreated）" },
];

/** 渲染「常规配置」Tab */
export function renderGeneralTab(container: HTMLElement, ctx: SettingsTabContext): void {
	container.createEl("h3", { text: "报告生成" });

	new Setting(container)
		.setName("报告输出目录")
		.setDesc("生成的报告笔记保存位置，如 TaskNotes/Reports")
		.addText((text) =>
			text
				.setPlaceholder("TaskNotes/Reports")
				.setValue(ctx.plugin.settings.reportFolder)
				.onChange(async (value) => {
					ctx.plugin.settings.reportFolder = value.trim();
					await ctx.plugin.saveSettings();
				})
		);

	container.createEl("h4", { text: "任务自动筛选的日期口径（可多选）" });
	container.createEl("p", {
		text: "选择哪些日期字段参与自动筛选：任务在所选日期范围内命中任一字段即自动纳入。",
		cls: "setting-item-description",
	});

	for (const option of DATE_FIELD_OPTIONS) {
		new Setting(container)
			.setName(option.label)
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
		.setName("周一作为一周起始日")
		.setDesc("开启后，周报的一周从周一开始；关闭则从周日开始。")
		.addToggle((toggle) =>
			toggle
				.setValue(ctx.plugin.settings.weekStartsOnMonday)
				.onChange(async (value) => {
					ctx.plugin.settings.weekStartsOnMonday = value;
					await ctx.plugin.saveSettings();
				})
		);

	new Setting(container)
		.setName("报告语言")
		.setDesc("生成报告使用的语言，默认中文。")
		.addText((text) =>
			text
				.setPlaceholder("中文")
				.setValue(ctx.plugin.settings.language)
				.onChange(async (value) => {
					ctx.plugin.settings.language = value.trim() || "中文";
					await ctx.plugin.saveSettings();
				})
		);
}
