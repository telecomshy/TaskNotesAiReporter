/**
 * i18n 核心：界面语言解析与翻译器构造。
 * 纯逻辑，不依赖 Obsidian，可直接单元测试。
 */

import { en, type Strings } from "./en";
import { zh } from "./zh";

export type Language = "en" | "zh";
export type LanguageSetting = "auto" | "zh" | "en";
export type Vars = Record<string, string | number>;
export type Translator = (key: string, vars?: Vars) => string;

/** 所有受支持语言的字符串表。 */
export const BUNDLES: Record<Language, Strings> = { en, zh };

/** 把 Obsidian 的语言码与用户的手动设置解析为受支持的界面语言。 */
export function resolveLanguage(obsidianLang: string, override: LanguageSetting): Language {
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
export function calendarLabels(language: Language): Strings["calendar"] {
	return BUNDLES[language].calendar;
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
