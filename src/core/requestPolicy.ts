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

import type { RequestPolicy } from "../types";
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

/*
 * 策略算术（温度判定 / 额度下限与钳制 / 超时下限）不在此处：它随请求装配落在
 * `src/ai/modelRequest.ts`（#111，ADR-0032）——执行层（ai/client）不再 import 本模块，
 * 本模块只负责解析出策略事实。
 */
