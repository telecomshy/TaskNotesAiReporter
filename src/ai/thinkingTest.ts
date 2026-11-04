/**
 * 思考测试（#89）：HTTP 薄壳 + 流程编排。
 * 判定与习得条目由 core/thinking 纯状态机产出，本层不裁决（#86 决定）。
 * 「中断」时 entry 为 null——调用方据此不留结论、测试入口保持可点。
 */

import { startThinkingTest, stepThinkingTest } from "../core/thinking";
import type {
	ActiveModelResolution,
	LearnedCapability,
	ThinkingTestVerdict,
} from "../types";
import { thinkingProbe, type RequestFn, type ThinkingProbeConfig } from "./client";

/** 一次思考测试的结论（#89）：四值判定 + 习得条目（「中断」不落条目）。 */
export interface ThinkingTestResult {
	verdict: ThinkingTestVerdict;
	entry: LearnedCapability | null;
}

/** 跑一次完整思考测试：基线微型请求 → 逐字段探测 → 四值判定。 */
export async function runThinkingTest(
	config: ThinkingProbeConfig,
	request?: RequestFn
): Promise<ThinkingTestResult> {
	let { state, action } = startThinkingTest();
	while (action.kind === "probe") {
		const outcome = await thinkingProbe(config, action.param, request);
		({ state, action } = stepThinkingTest(state, outcome));
	}
	return { verdict: action.verdict, entry: action.entry };
}

/**
 * 思考测试流程所需的状态门面切片（设置门面满足它，#89）。
 * 只声明流程真正要动的三个口子：解析当前模型、落 / 清习得条目。
 */
export interface ThinkingTestStateSlice {
	resolveActive(): ActiveModelResolution;
	recordThinkingTest(providerId: string, model: string, entry: LearnedCapability): void;
	clearLearnedThinking(providerId: string, model: string): void;
}

/**
 * 思考测试流程（#89）：解析当前模型 →（重测先清习得：清习得并重跑）→ 基线 → 逐字段 → 落习得。
 * （供应商, 模型）键**单一来源**取自解析结果——探测与落 / 清习得用同一对键，
 * 不收调用方另传的键，渲染后切换模型也不会记到错的模型名下（双源漂移已收敛）。
 * 解析失败**不动**习得数据（不清也不跑）；「中断」不留结论（entry 为 null，可完整重测）。
 * 返回 null ＝ 当前模型不可用，调用方自陈原因。
 */
export async function runThinkingTestFlow(
	slice: ThinkingTestStateSlice,
	timeoutSeconds: number,
	retest: boolean,
	request?: RequestFn
): Promise<ThinkingTestResult | null> {
	const resolved = slice.resolveActive();
	if (!resolved.ok) return null;
	const providerId = resolved.providerId;
	const model = resolved.config.model;
	if (retest) slice.clearLearnedThinking(providerId, model);
	const result = await runThinkingTest(
		{
			baseUrl: resolved.config.baseUrl,
			apiKey: resolved.config.apiKey,
			model,
			timeoutSeconds,
		},
		request
	);
	if (result.entry) slice.recordThinkingTest(providerId, model, result.entry);
	return result;
}
