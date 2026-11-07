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
 * - 「未能关闭」备注的字段数兜底：`triedFields ?? THINKING_OFF_CANDIDATES.length`
 *   （view 不再 import 测试算法的候选清单）；
 * - `hasModel`（providerId 与 model 均非空）：开关可用性与测试入口置灰都吃它，
 *   以 `hasActiveModel` 导出（view 的 startTest 守卫同吃，口径不二份）。
 */

import {
	THINKING_OFF_CANDIDATES,
	type ThinkingBadgeTone,
	type ThinkingTestEntry,
} from "../core/thinking";
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
	/** 仅 learned-not-switchable：`triedFields ?? THINKING_OFF_CANDIDATES.length`。 */
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
	return {
		toggle: {
			checked: on,
			enabled: display.toggleEnabled && hasModel,
			titleKey: on ? "model.thinkingOn" : "model.thinkingOff",
		},
		badge: {
			tone: display.badge,
			key: copy.badge,
			// 习得徽标带「实测 {{date}}」；非习得档不带 vars。
			...(thinking.learned ? { vars: { date: thinking.learned.testedAt.slice(0, 10) } } : {}),
		},
		footnote: {
			key: copy.footnote,
			// 「未能关闭」带实测字段数，兜底候选清单长度；其余状态不带 vars。
			...(display.state === "learned-not-switchable"
				? { vars: { count: thinking.learned?.triedFields ?? THINKING_OFF_CANDIDATES.length } }
				: {}),
			warn: display.footnoteWarn,
		},
		test: {
			...TEST_ENTRY[display.testEntry],
			// run：无模型置灰；done：恒置灰（已知无需测试）；retest：可点（清习得并重跑）。
			disabled: display.testEntry === "available" ? !hasModel : display.testEntry === "done",
		},
	};
}
