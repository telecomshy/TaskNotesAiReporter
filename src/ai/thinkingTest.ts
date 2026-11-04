/**
 * 思考测试执行层（#89）：HTTP 薄壳（#86 决定），照纯状态机发微型请求。
 * 基线 → 逐字段 → 四值判定；判定与习得条目由 core/thinking 状态机产出，本层不裁决。
 * 「中断」时 entry 为 null——调用方据此不留结论、保持测试入口可点。
 */

import { startThinkingTest, stepThinkingTest } from "../core/thinking";
import type { LearnedCapability, ThinkingTestVerdict } from "../types";
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
