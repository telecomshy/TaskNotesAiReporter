/**
 * 「思考测试」的共享界面动作（#89 / #97）：跑流程 → 上浮结论提示 →（可选）刷新。
 * 两个入口共用：设置页「当前模型」卡的测试 / 重测，与报告弹窗假关告警的「重新测试」。
 * 流程与判定归 ai/thinkingTest / core/thinking，文案键归 i18n；本模块只做提示与回调。
 */

import { Notice } from "obsidian";
import {
	runThinkingTestFlow,
	type ThinkingTestResult,
	type ThinkingTestStateSlice,
} from "../ai/thinkingTest";
import type { RequestFn } from "../ai/client";
import { thinkingVerdictNoticeKey, type Translator } from "../i18n";

/** 共享动作的依赖：解析 / 落清习得的窄切片、超时、翻译器与可选回调。 */
export interface ThinkingTestActionDeps {
	/** 解析当前模型 / 落清习得的窄切片（ProviderSettings 满足）。 */
	providers: ThinkingTestStateSlice;
	timeoutSeconds: number;
	t: Translator;
	/** 流程结束后的回调（设置页重渲染）；报告弹窗不传。 */
	onDone?: () => void;
	/** 可注入传输缝（测试用）；缺省走真实请求。 */
	request?: RequestFn;
}

/**
 * 跑一次「思考测试」并把结论上浮为提示。
 * 当前模型不可用时同样提示（不留静默路径），并照常调用 `onDone`——
 * 设置页「失败也刷新」的既有行为由此保留。
 */
export async function runAndAnnounceThinkingTest(
	deps: ThinkingTestActionDeps,
	retest: boolean
): Promise<ThinkingTestResult | null> {
	const result = await runThinkingTestFlow(
		deps.providers,
		deps.timeoutSeconds,
		retest,
		deps.request
	);
	new Notice(
		result
			? deps.t(thinkingVerdictNoticeKey(result.verdict))
			: deps.t("model.thinkingTestNeedModel")
	);
	deps.onDone?.();
	return result;
}
