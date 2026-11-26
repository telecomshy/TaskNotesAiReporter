/**
 * 「模型请求策略」纯数据模块（#106，ADR-0030）：方言基线之上的第二层窄化。
 *
 * 行键（供应商 id, 模型 pattern），与内置思考能力表同构；首个命中行生效。
 * 字段只允许**删掉该模型不接受的参数、抬高下限**——加回方言已删的参数不在本表职责内。
 * 只有内置预设按 `providerId` 命中：自定义供应商与四家国产预设回落空策略（现状零变更）。
 * OpenAI 预设未命中时回落「预设缺省策略」——新模型族无需更新即安全。
 *
 * 事实源 docs/research/openai-official-preset.md；新模型族上市时随版本维护。
 * 纯函数，无 obsidian、无 DOM。
 */

import type { RequestPolicy, ThinkingParam } from "../types";
import { matchModelPattern } from "./thinking";

/** 无策略（现状）：`max_tokens` + 温度恒发 + 无下限。其它供应商与自定义供应商的回落。 */
export const EMPTY_REQUEST_POLICY: RequestPolicy = {
	outputField: "max_tokens",
	temperature: "send",
	minMaxTokens: 0,
	minTimeoutSeconds: 0,
};

/**
 * OpenAI 预设的缺省策略（#106 裁决 4）：`max_completion_tokens` + 温度仅 `none` 时发
 * + 25,000 预算下限 + 120 秒超时下限（研究笔记的官方起步建议；超时数字是产品判断）。
 */
export const OPENAI_REQUEST_POLICY: RequestPolicy = {
	outputField: "max_completion_tokens",
	temperature: "omit-unless-none",
	minMaxTokens: 25000,
	minTimeoutSeconds: 120,
};

/** 策略表一行：按（供应商, 模型）匹配，首个命中行生效。 */
export interface RequestPolicyRow {
	providerId: string;
	/** 模型匹配：精确 ID，或以 `*` 结尾的前缀。 */
	modelPattern: string;
	policy: RequestPolicy;
}

/** OpenAI 预设内通用行（拿预设缺省做底，只改一处差异）。 */
function openaiPolicy(over: Partial<RequestPolicy>): RequestPolicy {
	return { ...OPENAI_REQUEST_POLICY, ...over };
}

/** 只按 OpenAI 官方文档可核实的族差异开行；未登记族走预设缺省（#106 裁决 10）。 */
export const REQUEST_POLICIES: readonly RequestPolicyRow[] = [
	// GPT-6.2 / GPT-6 Astra / GPT-6.1 Sol：恒不发温度（6.2 族不支持 none，6 Astra 无自定义值）。
	{ providerId: "openai", modelPattern: "gpt-6.2*", policy: openaiPolicy({ temperature: "omit-always" }) },
	{ providerId: "openai", modelPattern: "gpt-6-astra", policy: openaiPolicy({ temperature: "omit-always" }) },
	{ providerId: "openai", modelPattern: "gpt-6.1-sol", policy: openaiPolicy({ temperature: "omit-always" }) },
	// 老的非推理对话模型：可传温度，预算沿用全局值（不为非推理模型多花钱）。
	{ providerId: "openai", modelPattern: "gpt-4.1*", policy: openaiPolicy({ temperature: "send", minMaxTokens: 0 }) },
	{ providerId: "openai", modelPattern: "gpt-4o*", policy: openaiPolicy({ temperature: "send", minMaxTokens: 0 }) },
];

/**
 * 解析（供应商, 模型）的请求策略：首个命中行生效；未命中时 OpenAI 预设回落预设缺省，
 * 其余供应商回落空策略（现状零变更）。执行层只消费结果，不判断供应商类型。
 */
export function resolveRequestPolicy(
	providerId: string,
	model: string,
	table: readonly RequestPolicyRow[] = REQUEST_POLICIES
): RequestPolicy {
	const row = table.find(
		(r) => r.providerId === providerId && matchModelPattern(r.modelPattern, model)
	);
	if (row) return row.policy;
	return providerId === "openai" ? OPENAI_REQUEST_POLICY : EMPTY_REQUEST_POLICY;
}

/**
 * 温度判定（#106 裁决 9）：输入是「策略 × 本次生效 effort」。
 * 生效 effort ＝实际发出的思考参数里的 effort 取值：开＝`high`、关＝`none`（能力表给出）；
 * 强制 / 无思考 / 未知不发参数，等于官方默认 `medium`。
 * `send` 恒发；`omit-always` 永不发；`omit-unless-none` 仅在生效 effort 为 `none` 时发。
 * 两种携带形态都认（#110）：Chat 的顶层 `reasoning_effort`、Responses 的嵌套 `reasoning.effort`。
 */
export function shouldSendTemperature(
	policy: RequestPolicy,
	thinking: ThinkingParam | null | undefined
): boolean {
	if (policy.temperature === "send") return true;
	if (policy.temperature === "omit-always") return false;
	return effectiveEffort(thinking) === "none";
}

/**
 * 从思考参数提取「本次生效的 effort」（#110）：顶层 `reasoning_effort`（字符串）或
 * 嵌套 `reasoning.effort`（对象路径）；不带 effort 语义的参数（`thinking` / `enable_thinking`）
 * 返回 null。温度判定与协议无关，只认语义。
 */
export function effectiveEffort(thinking: ThinkingParam | null | undefined): string | null {
	if (!thinking) return null;
	if (thinking.name === "reasoning_effort" && typeof thinking.value === "string") {
		return thinking.value;
	}
	if (thinking.name === "reasoning") {
		const value = thinking.value as { effort?: unknown } | null;
		if (value !== null && typeof value === "object" && typeof value.effort === "string") {
			return value.effort;
		}
	}
	return null;
}

// ===== 请求体的策略消费（生成与微型探测共用，#106 裁决 7 / 8） =====

/**
 * 生成请求额度：`max(配置上限, 策略下限)`，钳制上限仍 384K；非法配置回落 8192。
 * 生成与探测共用同一套钳制——**探测不调用它**（探测预算恒 256，不受下限影响）。
 */
export function effectiveMaxTokens(policy: RequestPolicy, maxTokens: number): number {
	const MAX_SAFE = 384 * 1024;
	const configured = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 8192;
	return Math.min(Math.max(configured, policy.minMaxTokens), MAX_SAFE);
}

/** 生成与探测超时：`max(全局超时, 策略下限)`；用户更大的设置优先。清单拉取不调用它。 */
export function effectiveTimeoutSeconds(policy: RequestPolicy, timeoutSeconds: number): number {
	return Math.max(timeoutSeconds, policy.minTimeoutSeconds);
}
