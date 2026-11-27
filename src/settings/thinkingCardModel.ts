/**
 * 「思考行」的呈现规格（#102，架构候选 4）：「状态 → 控件组合」的 join 有了唯一 owner。
 * 输入 `ActiveModelInfo`（providerSettings 读面），输出开关 / 徽标 / 备注 / 测试入口的
 * 完整规格；modelTab 的 renderThinkingRow 只按规格建元素。
 *
 * 纯函数，无 DOM、无 obsidian。文案键仍归 i18n（ADR-0005）：本模块只引用键与变量，
 * 不产出文案。运行中态（「测试中…」、异步期禁用）是瞬态 view 状态，不入本模型。
 *
 * 从 view 内化的三条口径（原散在 modelTab.ts，各有单测锁定）：
 * - 习得徽标日期：`testedAt.slice(0, 10)`；
 * - 「未能关闭」备注只认记录值：有 `triedFields` 才显示字段数，缺失改显无数字文案变体
 *   （#114：不再拿候选清单长度兜底，呈现层与测试算法彻底脱钩）；
 * - `hasModel`（providerId 与 model 均非空）：开关可用性与测试入口置灰都吃它，
 *   以 `hasActiveModel` 导出（view 的 startTest 守卫同吃，口径不二份）。
 */

import type { ThinkingBadgeTone, ThinkingTestEntry } from "../core/thinking";
import { thinkingDisplayCopy, type TranslationKey } from "../i18n";
import type { ActiveModelInfo } from "./providerSettings";

/** 「思考开关」的呈现规格：两档滑动开关（思考开关，取值按模型持久化）。 */
export interface ThinkingToggleModel {
	/** `thinking.setting === "on"`。 */
	checked: boolean;
	/** `display.toggleEnabled && hasModel`（微归一：无模型时按钮也视觉置灰）。 */
	enabled: boolean;
	/** 开关 title 文案键：开＝model.thinkingOn / 关＝model.thinkingOff。 */
	titleKey: TranslationKey;
}

/** 能力徽标的呈现规格：色族 + 文案键（视图拼 `tah-thinking-badge-${tone}`）。 */
export interface ThinkingBadgeModel {
	tone: ThinkingBadgeTone;
	key: TranslationKey;
	/** 仅习得档：「实测 {{date}}」的日期（`testedAt.slice(0, 10)`）。 */
	vars?: { date: string };
}

/** 备注的呈现规格：文案键（「未能关闭」带实测字段数）＋ 警示色。 */
export interface ThinkingFootnoteModel {
	key: TranslationKey;
	/** 仅 learned-not-switchable 且有记录值：实测字段数（缺失时用无数字文案，不推断）。 */
	vars?: { count: number };
	/** 备注用警示色（琥珀）。 */
	warn: boolean;
}

/** 测试入口的呈现规格：run＝「测试思考能力」按钮 / retest＝「重新测试」文字链 / done＝置灰位。 */
export interface ThinkingTestModel {
	kind: "run" | "retest" | "done";
	labelKey: TranslationKey;
	/** run：无模型置灰；done：恒置灰（已知无需测试）；retest：可点。 */
	disabled: boolean;
}

/** 「思考行」完整呈现规格：状态 → 控件组合的 join 有了 owner（#102）。 */
export interface ThinkingCardModel {
	toggle: ThinkingToggleModel;
	badge: ThinkingBadgeModel;
	footnote: ThinkingFootnoteModel;
	test: ThinkingTestModel;
}

/** 测试入口形态 → 视图建何种控件 ＋ 入口文案键（display.testEntry 逐值映射）。 */
const TEST_ENTRY: Record<
	ThinkingTestEntry,
	{ kind: ThinkingTestModel["kind"]; labelKey: TranslationKey }
> = {
	available: { kind: "run", labelKey: "model.thinkingTestRun" },
	retest: { kind: "retest", labelKey: "model.thinkingTestRetest" },
	done: { kind: "done", labelKey: "model.thinkingTestDone" },
};

/** hasModel 口径（providerId 与 model 均非空）：开关可用性与测试入口置灰都吃它；view 的 startTest 守卫同吃。 */
export function hasActiveModel(info: ActiveModelInfo): boolean {
	return info.providerId !== "" && info.model !== "";
}

/** 「思考行」呈现规格：输入当前模型信息，输出开关 / 徽标 / 备注 / 测试入口的完整规格。 */
export function thinkingCardModel(info: ActiveModelInfo): ThinkingCardModel {
	const { thinking, display } = info;
	const hasModel = hasActiveModel(info);
	const on = thinking.setting === "on";
	const copy = thinkingDisplayCopy[display.state];
	// 习得徽标带「实测 {{date}}」；习得过期条目（#112）从 staleLearned 取日期——徽标文案不变。
	const learnedEntry = thinking.learned ?? thinking.staleLearned;
	const triedFields =
		display.state === "learned-not-switchable" ? thinking.learned?.triedFields : undefined;
	// 「未能关闭」缺记录值时改显无数字变体（#114）：候选清单长度不是实测事实，不能拿来兜底。
	const noCount = display.state === "learned-not-switchable" && triedFields === undefined;
	const footnoteKey = noCount ? (copy.footnoteNoCount ?? copy.footnote) : copy.footnote;
	return {
		toggle: {
			checked: on,
			enabled: display.toggleEnabled && hasModel,
			titleKey: on ? "model.thinkingOn" : "model.thinkingOff",
		},
		badge: {
			tone: display.badge,
			key: copy.badge,
			...(learnedEntry ? { vars: { date: learnedEntry.testedAt.slice(0, 10) } } : {}),
		},
		footnote: {
			key: footnoteKey,
			// 「未能关闭」只在有记录值时带实测字段数；其余状态（含缺记录值）不带 vars。
			...(triedFields !== undefined ? { vars: { count: triedFields } } : {}),
			warn: display.footnoteWarn,
		},
		test: {
			...TEST_ENTRY[display.testEntry],
			// run：无模型置灰；done：恒置灰（已知无需测试）；retest：可点（清习得并重跑）。
			disabled: display.testEntry === "available" ? !hasModel : display.testEntry === "done",
		},
	};
}
