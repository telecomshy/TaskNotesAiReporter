/**
 * 设置的**值域规则**：「何为合法设置值」只此一处判定。
 * 载入（`logic.ts` 的 normalizeSettings）与变更（`appSettings.ts` 的命令）共用同一套规则，
 * 使不变式不会在两处漂移（见 #46）。
 *
 * 纯函数，无 obsidian、无 DOM。
 */

import {
	DEFAULT_SETTINGS,
	type DateField,
	type ReportTemplate,
	type TaskSource,
} from "../types";
import type { UiLanguageSetting } from "../i18n";
import { DATE_FIELDS } from "../core/dateFields";

/**
 * 日期口径的合法取值：来自「日期口径」表（`../core/dateFields`），与自动筛选、
 * 日期范围推导、设置页文案同源（见 #50）。
 */
export const DATE_FIELD_VALUES: readonly DateField[] = DATE_FIELDS;

/** 界面语言的合法取值。 */
export const UI_LANGUAGE_VALUES: readonly UiLanguageSetting[] = ["auto", "zh", "en"];

/** 任务来源的合法取值。 */
export const TASK_SOURCE_VALUES: readonly TaskSource[] = ["tasknotes", "obsidian-tasks"];

export function isDateField(value: unknown): value is DateField {
	return DATE_FIELD_VALUES.includes(value as DateField);
}

/** 生成唯一 id（模板等）。 */
export function genId(): string {
	return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ===== 标量 =====

/** 报告输出目录：去空白。 */
export function coerceReportFolder(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/** 报告语言：去空白；**空或纯空白回退默认语言**（载入与变更一致）。 */
export function coerceReportLanguage(value: unknown): string {
	return typeof value === "string" ? value.trim() || DEFAULT_SETTINGS.language : DEFAULT_SETTINGS.language;
}

/** 界面语言：非法值归一为 `auto`（载入与变更一致）。 */
export function coerceUiLanguage(value: unknown): UiLanguageSetting {
	return UI_LANGUAGE_VALUES.includes(value as UiLanguageSetting)
		? (value as UiLanguageSetting)
		: "auto";
}

/** 任务来源：非法值归一为 `tasknotes`（既有用户的默认行为不变）。 */
export function coerceTaskSource(value: unknown): TaskSource {
	return TASK_SOURCE_VALUES.includes(value as TaskSource) ? (value as TaskSource) : "tasknotes";
}

/** 周起始日：非布尔视为缺省（返回 null，由调用方决定是否回退默认）。 */
export function coerceWeekStartsOnMonday(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

/** 生成参数：非有限数值视为缺省（返回 null）。 */
export function coerceFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ===== 集合 =====

/**
 * 日期口径：保留合法项并去重。
 * **空数组是合法值**（= 自动筛选关闭），不得被回退成默认——这是 #46 的用户可见修正。
 * 非数组返回 `null`，表示「数据里没有这一项」，由调用方回退默认。
 */
export function coerceDateFields(value: unknown): DateField[] | null {
	if (!Array.isArray(value)) return null;
	const out: DateField[] = [];
	for (const item of value) {
		if (isDateField(item) && !out.includes(item)) out.push(item);
	}
	return out;
}

/** 单个模板的值域：必须有字符串 name 与 content。 */
export function coerceTemplate(value: unknown): ReportTemplate | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as { id?: unknown; name?: unknown; content?: unknown };
	if (typeof raw.name !== "string" || typeof raw.content !== "string") return null;
	return {
		id: typeof raw.id === "string" ? raw.id : genId(),
		name: raw.name,
		content: raw.content,
	};
}

/** 模板列表：逐个按值域过滤。非数组返回 `null`（数据里没有这一项）。 */
export function coerceTemplates(value: unknown): ReportTemplate[] | null {
	if (!Array.isArray(value)) return null;
	const out: ReportTemplate[] = [];
	for (const item of value) {
		const template = coerceTemplate(item);
		if (template) out.push(template);
	}
	return out;
}

/**
 * 所选模板 id：**仅当模板存在时保留**，否则回退为空串（= 不选模板，极简模式）。
 * 载入与变更一致——这是「删除模板后 selectedTemplateId 悬空」的不变式归属（见 #33 / ADR-0012）。
 */
export function coerceSelectedTemplateId(templates: ReportTemplate[], value: unknown): string {
	if (typeof value !== "string" || value === "") return "";
	return templates.some((t) => t.id === value) ? value : "";
}
