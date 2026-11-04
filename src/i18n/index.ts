/**
 * i18n 核心：界面语言解析与翻译器构造。
 * 纯逻辑，不依赖 Obsidian，可直接单元测试。
 */

import type { DateField, ThinkingTestVerdict } from "../types";
import type { ThinkingDisplayState } from "../core/thinking";
import { en, type Strings } from "./en";
import { zh } from "./zh";

export type UiLanguage = "en" | "zh";
export type UiLanguageSetting = "auto" | "zh" | "en";
export type Vars = Record<string, string | number>;

/**
 * 从英文表派生的全部可翻译键（点号路径）。
 * 数组节点不算键：日历月份 / 星期走 `calendarLabels` 直取，不经过 `t()`。
 */
type LeafKeys<T> = {
	[K in keyof T & string]: T[K] extends string
		? K
		: T[K] extends readonly unknown[]
			? never
			: `${K}.${LeafKeys<T[K]>}`;
}[keyof T & string];

/** 可翻译键的联合：用于约束文案映射的字面量值（拼错 = 编译失败）。 */
export type TranslationKey = LeafKeys<Strings>;

export type Translator = (key: string, vars?: Vars) => string;

/** 所有受支持语言的字符串表。 */
export const BUNDLES: Record<UiLanguage, Strings> = { en, zh };

/** 把 Obsidian 的语言码与用户的手动设置解析为受支持的界面语言。 */
export function resolveLanguage(obsidianLang: string, override: UiLanguageSetting): UiLanguage {
	if (override === "zh" || override === "en") return override;
	const code = (obsidianLang ?? "").toLowerCase();
	return code === "zh" || code.startsWith("zh-") ? "zh" : "en";
}

/** 基于某个字符串表构造翻译器：`count !== 1` 取 `_plural`，缺失则回退英文表，再回退 key 本身。 */
export function createTranslator(bundle: DeepPartial<Strings>): Translator {
	return (key, vars) => {
		const plural = typeof vars?.count === "number" && vars.count !== 1;
		const template = resolve(bundle, key, plural) ?? resolve(en, key, plural) ?? key;
		return interpolate(template, vars);
	};
}

/** 在单个字符串表内解析 key：优先 `_plural`（复数时），否则基础 key。 */
function resolve(source: unknown, key: string, plural: boolean): string | undefined {
	if (plural) {
		const pluralValue = lookup(source, `${key}_plural`);
		if (pluralValue !== undefined) return pluralValue;
	}
	return lookup(source, key);
}

/** 日历所需的数组型文案（月份、星期），按语言取。 */
export function calendarLabels(language: UiLanguage): Strings["calendar"] {
	return BUNDLES[language].calendar;
}

/**
 * 「日期口径」文案键的命名约定（#81）：`settings.dateField` + 字段名去 `date` 前缀后首字母大写
 * （如 `completedDate → settings.dateFieldCompletedDate`、`dateCreated → settings.dateFieldCreated`）。
 * 约定本身不逐字符单测；由文案登记测试在双语 bundle 上间接兜底（漏登记即报红）。
 */
export function dateFieldLabelKey(field: DateField): string {
	const suffix = field.replace(/^date/, "");
	return `settings.dateField${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
}

/**
 * 「显示矩阵」行状态 → 徽标 / 备注文案键（ADR-0005：纯模块只出数据，文案键归 UI）。
 * 值受 `TranslationKey` 约束：映射里拼错 = 编译失败；登记测试再兜一层双语存在性。
 */
export const thinkingDisplayCopy: Record<
	ThinkingDisplayState,
	{ badge: TranslationKey; footnote: TranslationKey }
> = {
	builtin: { badge: "model.thinkingBadgeBuiltin", footnote: "model.thinkingNoteBuiltin" },
	forced: { badge: "model.thinkingBadgeForced", footnote: "model.thinkingForced" },
	none: { badge: "model.thinkingBadgeNone", footnote: "model.thinkingNone" },
	unknown: { badge: "model.thinkingBadgeUnknown", footnote: "model.thinkingUnknown" },
	"learned-switchable": {
		badge: "model.thinkingBadgeLearned",
		footnote: "model.thinkingNoteLearnedSwitchable",
	},
	"learned-not-detected": {
		badge: "model.thinkingBadgeLearned",
		footnote: "model.thinkingNoteLearnedNotDetected",
	},
	"learned-not-switchable": {
		badge: "model.thinkingBadgeLearned",
		footnote: "model.thinkingNoteLearnedNotSwitchable",
	},
};

/** 「思考测试」四值判定 → 结论提示文案键（#89）；措辞诚实（不写「强制思考」「无思考」）。 */
export const THINKING_VERDICT_NOTICE_KEYS: Record<ThinkingTestVerdict, TranslationKey> = {
	"not-detected": "model.thinkingTestVerdictNotDetected",
	switchable: "model.thinkingTestVerdictSwitchable",
	"not-switchable": "model.thinkingTestVerdictNotSwitchable",
	interrupted: "model.thinkingTestInterrupted",
};

/** 取「思考测试」判定的结论提示文案键。 */
export function thinkingVerdictNoticeKey(verdict: ThinkingTestVerdict): TranslationKey {
	return THINKING_VERDICT_NOTICE_KEYS[verdict];
}

/** 字符串表的深层可选类型：允许翻译器按部分目录构造（测试与渐进迁移）。 */
type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends readonly unknown[]
		? T[K]
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K];
};

/** 按点号路径在嵌套字符串表中查找叶子字符串。 */
function lookup(source: unknown, key: string): string | undefined {
	let current: unknown = source;
	for (const part of key.split(".")) {
		if (typeof current !== "object" || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === "string" ? current : undefined;
}

/** 用 vars 替换模板中的 {{name}} 占位符；缺值时保留原占位符。 */
function interpolate(template: string, vars?: Vars): string {
	if (!vars) return template;
	return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
		const value = vars[name];
		return value === undefined ? match : String(value);
	});
}
