/**
 * 思考测试（#89）：HTTP 薄壳 + 流程编排。
 * 判定与习得条目由 core/thinking 纯状态机产出，本层不裁决（#86 决定）。
 * 「中断」时 entry 为 null——调用方据此不留结论、测试入口保持可点。
 *
 * #111（ADR-0032）起探测请求由装配层逐步给出（`assembleProbeRequest`）：
 * 预算恒 256、超时吃下限、param 并入覆盖事实思考、候选分派收进装配缝。
 */

import { startThinkingTest, stepThinkingTest } from "../core/thinking";
import { assembleProbeRequest, probeOffCandidates } from "./modelRequest";
import type {
	ActiveModelResolution,
	LearnedCapability,
	ModelFacts,
	RequestTarget,
	ThinkingTestVerdict,
} from "../types";
import { thinkingProbe, type RequestFn } from "./client";

/** 一次思考测试的结论（#89）：四值判定 + 习得条目（「中断」不落条目）。 */
export interface ThinkingTestResult {
	verdict: ThinkingTestVerdict;
	entry: LearnedCapability | null;
}

/** 一次思考测试的输入：目标 + 事实（同一份解析产物）+ 供应商 id（候选分派用）+ 超时。 */
export interface ThinkingTestInput {
	target: RequestTarget;
	facts: ModelFacts;
	/** 候选分派按供应商 id（#106）：只有内置 OpenAI 预设收窄到 reasoning_effort。 */
	providerId: string;
	timeoutSeconds: number;
}

/** 跑一次完整思考测试：基线微型请求 → 逐字段探测 → 四值判定。 */
export async function runThinkingTest(
	input: ThinkingTestInput,
	request?: RequestFn
): Promise<ThinkingTestResult> {
	// 候选按（接口方言, 供应商 id, 接口协议）取（#105 / #106 / #110）：分派收进装配缝。
	let { state, action } = startThinkingTest(probeOffCandidates(input.facts, input.providerId));
	while (action.kind === "probe") {
		// 状态机照旧拥有「基线 → 逐字段 → 四值判定」循环；每步现装配一次（ADR-0032）。
		const probe = assembleProbeRequest({
			target: input.target,
			facts: input.facts,
			timeoutSeconds: input.timeoutSeconds,
			param: action.param,
		});
		const outcome = await thinkingProbe(probe, request);
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
	const config = resolved.config;
	const model = config.model;
	if (retest) slice.clearLearnedThinking(providerId, model);
	const result = await runThinkingTest(
		{
			// 目标与事实是同一份解析产物的两半：探测按方言 / 协议构造（#105 / #110）。
			target: { baseUrl: config.baseUrl, apiKey: config.apiKey, model },
			facts: config,
			// 候选分派按供应商 id（#106）：只有内置 OpenAI 预设收窄到 reasoning_effort。
			providerId,
			timeoutSeconds,
		},
		request
	);
	if (result.entry) slice.recordThinkingTest(providerId, model, result.entry);
	return result;
}
