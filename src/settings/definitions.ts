/**
 * 声明式设置的定义构造与控件键路由（#54，Path A：迁移到 Obsidian 声明式设置 API）。
 *
 * 纯逻辑：定义是普通对象、路由是纯函数，除类型外无 obsidian、无 DOM，可单元测试。
 * 写入经注入的 `ControlWriter`（`AppSettings` 门面结构化兼容它），视图不直写设置（#46）。
 * 值域归一仍是门面/命令的既有职责，这里只按控件类型做形状归一（布尔 / 字符串）。
 */

import type { SettingDefinitionItem, SettingGroupItem, Setting } from "obsidian";
import type { DateField } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import type { SettingsSnapshot } from "./owner";
import type { Translator } from "../i18n";
import { DATE_FIELD_TABLE } from "../core/dateFields";
import { isDateField } from "./values";

/** 控件键的读写路由：键 → 落到哪个门面命令。 */
export type ControlRoute =
	| { kind: "reportFolder" }
	| { kind: "weekStartsOnMonday" }
	| { kind: "reportLanguage" }
	| { kind: "uiLanguage" }
	| { kind: "dateField"; field: DateField };

const DATE_FIELD_KEY_PREFIX = "dateField.";

/** 控件键 → 路由；未知键返回 null（渲染层以 defaultValue 兜底，不写任何东西）。 */
export function routeControlKey(key: string): ControlRoute | null {
	switch (key) {
		case "reportFolder":
			return { kind: "reportFolder" };
		case "weekStartsOnMonday":
			return { kind: "weekStartsOnMonday" };
		case "language":
			return { kind: "reportLanguage" };
		case "uiLanguage":
			return { kind: "uiLanguage" };
		default: {
			if (!key.startsWith(DATE_FIELD_KEY_PREFIX)) return null;
			const field = key.slice(DATE_FIELD_KEY_PREFIX.length);
			return isDateField(field) ? { kind: "dateField", field } : null;
		}
	}
}

/** 控件键 → 当前值（读只读快照）。未知键返回 undefined。 */
export function readControlValue(settings: SettingsSnapshot, key: string): unknown {
	const route = routeControlKey(key);
	if (!route) return undefined;
	switch (route.kind) {
		case "reportFolder":
			return settings.reportFolder;
		case "weekStartsOnMonday":
			return settings.weekStartsOnMonday;
		case "reportLanguage":
			return settings.language;
		case "uiLanguage":
			return settings.uiLanguage;
		case "dateField":
			return settings.dateFields.includes(route.field);
	}
}

/** 写入端口：`AppSettings` 门面即实现（结构化兼容）。 */
export interface ControlWriter {
	setReportFolder(folder: string): Promise<void>;
	toggleDateField(field: DateField, on: boolean): Promise<void>;
	setWeekStartsOnMonday(value: boolean): Promise<void>;
	setReportLanguage(language: string): Promise<void>;
	setUiLanguage(value: unknown): Promise<void>;
}

/** 把控件变更落到写入端口。落盘 Promise 不被吞掉，由调用方等待或传播。 */
export function writeControlValue(
	writer: ControlWriter,
	route: ControlRoute,
	value: unknown
): Promise<void> {
	switch (route.kind) {
		case "reportFolder":
			return writer.setReportFolder(String(value));
		case "weekStartsOnMonday":
			return writer.setWeekStartsOnMonday(Boolean(value));
		case "reportLanguage":
			return writer.setReportLanguage(String(value));
		case "uiLanguage":
			return writer.setUiLanguage(value);
		case "dateField":
			return writer.toggleDateField(route.field, Boolean(value));
	}
}

/**
 * 「常规」域的声明式定义（Q1=B：平铺顶层，进设置搜索索引）。
 * 分组沿用既有页面的分节：报告生成 / 日期口径 / 常规配置。
 */
export function generalSettingDefinitions(t: Translator): SettingDefinitionItem[] {
	return [
		{
			type: "group",
			heading: t("settings.generalHeading"),
			items: [
				{
					name: t("settings.reportFolderName"),
					desc: t("settings.reportFolderDesc"),
					control: {
						key: "reportFolder",
						type: "text",
						placeholder: DEFAULT_SETTINGS.reportFolder,
					},
				},
			],
		},
		{
			type: "group",
			heading: t("settings.dateFieldsHeading"),
			items: [dateFieldsDescRow(t), ...dateFieldToggles(t)],
		},
		{
			type: "group",
			heading: t("settings.tabGeneral"),
			items: [
				{
					name: t("settings.weekStartsMondayName"),
					desc: t("settings.weekStartsMondayDesc"),
					control: { key: "weekStartsOnMonday", type: "toggle" },
				},
				{
					name: t("settings.reportLanguageName"),
					desc: t("settings.reportLanguageDesc"),
					control: {
						key: "language",
						type: "text",
						placeholder: t("settings.reportLanguagePlaceholder"),
					},
				},
				{
					name: t("settings.uiLanguageName"),
					desc: t("settings.uiLanguageDesc"),
					control: {
						key: "uiLanguage",
						type: "dropdown",
						options: {
							auto: t("settings.uiLanguageAuto"),
							zh: t("settings.uiLanguageZh"),
							en: t("settings.uiLanguageEn"),
						},
					},
				},
			],
		},
	];
}

function dateFieldToggles(t: Translator): SettingGroupItem[] {
	return DATE_FIELD_TABLE.map((entry) => ({
		name: t(entry.labelKey),
		control: { key: `dateField.${entry.field}`, type: "toggle" as const },
	}));
}

/**
 * 日期口径的说明段落：group 没有 desc 字段，静态文字走 `render`（官方给
 * 「非一等控件」的口子）。与旧版 `display()` 里手写的说明段同形。
 */
function dateFieldsDescRow(t: Translator): SettingGroupItem {
	const desc = t("settings.dateFieldsDesc");
	return {
		name: "",
		desc,
		searchable: false,
		render: (setting: Setting) => {
			setting.settingEl.empty();
			setting.settingEl.createDiv({ cls: "setting-item-description", text: desc });
		},
	};
}
