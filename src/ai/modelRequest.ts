/**
 * 「当前模型 → 请求」唯一装配缝（#111，ADR-0032）。
 *
 * 同一个（供应商, 模型）解析出的事实（方言 / 协议 / 思考 / 请求策略 / 行级额度）曾在
 * 生成、思考测试、「测试」按钮三处各自手工投影成请求配置，可选字段各带静默缺省——
 * 漏抄不报错、只静默顶上。本模块把它们收成四个入口：
 *
 * 1. `resolveModelFacts`：事实解析（总函数、逐层回落、无失败分支）；
 * 2. `assembleChatRequest`：生成与「测试」按钮共用，策略在此**烤成定案**；
 * 3. `assembleProbeRequest`：思考测试逐步装配（提示与预算内化、不吃额度下限）；
 * 4. `probeOffCandidates`：思考测试候选分派（providerId 由流程显式递入）。
 *
 * 纯模块：不 import settings 侧任何模块，不碰 obsidian / DOM。执行层（ai/client）只消费
 * 装配产物 `ModelRequest` 并放字段，不做策略算术。
 */

import type {
	ChatMessage,
	ModelFacts,
	ModelProvider,
	ModelRequest,
	RequestGlobals,
	RequestPolicy,
	RequestTarget,
	ThinkingParam,
} from "../types";
import { apiStyleOf } from "../core/apiStyle";
import { protocolOf, resolveWireProtocol } from "../core/wireProtocol";
import { resolveRequestPolicy } from "../core/requestPolicy";
import { thinkingFor, thinkingOffCandidates } from "../core/thinking";

// ===== 事实解析 =====

/**
 * 行级事实的**入参**（不是读面）：`resolveActive` 传 `modelParams(provider, model)` 读面，
 * 「测试」按钮传输入框值。事实解析不回头读设置，也就不依赖 settings 侧模块。
 */
export interface ModelFactsParams {
	/** 行级输出上限；undefined＝未设置（生成回落全局）。 */
	maxTokens?: number;
}

/**
 * 解析（供应商, 模型）的请求事实：接口方言 / 接口协议 / 思考 / 模型请求策略 / 行级额度。
 * 总函数：任何（供应商, 模型）都有答案——未命中回落各自缺省，无失败分支。
 * 行参数经**入参**递入（见 `ModelFactsParams`）；本函数不 import settings 侧任何模块。
 */
export function resolveModelFacts(
	provider: ModelProvider,
	model: string,
	params: ModelFactsParams = {}
): ModelFacts {
	const apiStyle = apiStyleOf(provider);
	const facts: ModelFacts = {
		apiStyle,
		// 「思考」解析与请求策略解析同路（ADR-0024 / ADR-0030）；自定义供应商与预设同路。
		thinking: thinkingFor(provider, model),
		requestPolicy: resolveRequestPolicy(provider.id, model),
	};
	// 「接口协议」只属于 OpenAI 方言（ADR-0031）：Anthropic 永远 Messages，配置里不带该字段。
	if (apiStyle === "openai") facts.protocol = resolveWireProtocol(provider.id, model);
	if (params.maxTokens !== undefined) facts.maxTokens = params.maxTokens;
	return facts;
}

// ===== 策略算术（#106 裁决 9 / #111：从执行层搬到装配层） =====

const MAX_SAFE_TOKENS = 384 * 1024;
/** 非法配置的输出上限回落值（现状零变更）。 */
const FALLBACK_MAX_TOKENS = 8192;

/**
 * 温度判定（#106 裁决 9）：输入是「策略 × 本次生效 effort」。
 * 生效 effort ＝实际发出的思考参数里的 effort 取值：开＝`high`、关＝`none`（能力表给出）；
 * 强制 / 无思考 / 未知不发参数，等于官方默认 `medium`。
 * `send` 恒发；`omit-always` 永不发；`omit-unless-none` 仅在生效 effort 为 `none` 时发。
 * 两种携带形态都认（#110）：Chat 的顶层 `reasoning_effort`、Responses 的嵌套 `reasoning.effort`。
 */
function shouldSendTemperature(
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
function effectiveEffort(thinking: ThinkingParam | null | undefined): string | null {
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

/**
 * 生成请求额度：`max(配置上限, 策略下限)`，钳制上限仍 384K；非法配置回落 8192。
 * **探测不调用它**（探测预算恒 256，不受下限影响）。
 */
function effectiveMaxTokens(policy: RequestPolicy, maxTokens: number): number {
	const configured = Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : FALLBACK_MAX_TOKENS;
	return Math.min(Math.max(configured, policy.minMaxTokens), MAX_SAFE_TOKENS);
}

/** 生成与探测超时：`max(全局超时, 策略下限)`；用户更大的设置优先。清单拉取不调用它。 */
function effectiveTimeoutSeconds(policy: RequestPolicy, timeoutSeconds: number): number {
	return Math.max(timeoutSeconds, policy.minTimeoutSeconds);
}

// ===== 生成 / 「测试」按钮：同一装配 =====

/** 生成与「测试」按钮共用的装配输入：目标 + 事实 + 消息 + 全局参数三元组。 */
export interface ChatRequestInput {
	target: RequestTarget;
	facts: ModelFacts;
	messages: ChatMessage[];
	globals: RequestGlobals;
}

/**
 * 装配一次对话请求（生成与「测试」按钮共用）：策略在此烤成定案——
 * 温度按「策略 × 本次生效 effort」判死、额度 `max(行级 ?? 全局, 下限)` 并钳 384K、超时抬下限。
 * 装配产物是完整 `ModelRequest`：执行层只放字段，不再算一遍。
 */
export function assembleChatRequest(input: ChatRequestInput): ModelRequest {
	const { target, facts, messages, globals } = input;
	const thinking = facts.thinking.param ?? null;
	return buildRequest(facts, target, messages, {
		maxTokens: effectiveMaxTokens(facts.requestPolicy, facts.maxTokens ?? globals.maxTokens),
		timeoutSeconds: effectiveTimeoutSeconds(facts.requestPolicy, globals.timeoutSeconds),
		thinking,
		temperature: shouldSendTemperature(facts.requestPolicy, thinking)
			? globals.temperature
			: undefined,
	});
}

// ===== 思考测试：逐步装配 =====

/** 探测微型请求的提示与输出上限（#89）：越小越省，够读出推理段读面即可。 */
const PROBE_PROMPT = "1+1=? Reply with the number only.";
const PROBE_MAX_TOKENS = 256;
/** 探测温度：结构性取值，与生成的用户温度无关。 */
const PROBE_TEMPERATURE = 0;

/** 探测逐步装配的输入：状态机每步现装配一次（基线 → 逐字段）。 */
export interface ProbeRequestInput {
	target: RequestTarget;
	facts: ModelFacts;
	timeoutSeconds: number;
	/** 本条探测要发的思考参数；null＝基线（不发思考参数，先判会不会思考）。 */
	param: ThinkingParam | null;
}

/**
 * 装配一条思考测试微型请求：提示与预算 256 内化（不吃额度下限）、超时仍吃下限、
 * `param` 并入覆盖 `facts.thinking`（基线 `null` 即不发）。温度同样按「策略 × 本步参数」判死。
 */
export function assembleProbeRequest(input: ProbeRequestInput): ModelRequest {
	const { target, facts, timeoutSeconds, param } = input;
	return buildRequest(facts, target, [{ role: "user", content: PROBE_PROMPT }], {
		maxTokens: PROBE_MAX_TOKENS,
		timeoutSeconds: effectiveTimeoutSeconds(facts.requestPolicy, timeoutSeconds),
		thinking: param,
		temperature: shouldSendTemperature(facts.requestPolicy, param)
			? PROBE_TEMPERATURE
			: undefined,
	});
}

/**
 * 思考测试的关字段候选：按（供应商 id, 方言, 协议）分派（#106 / #110）。
 * 状态机（基线 → 逐字段 → 四值判定）与判定规则不因候选清单分叉。
 */
export function probeOffCandidates(facts: ModelFacts, providerId: string): readonly ThinkingParam[] {
	return thinkingOffCandidates(facts.apiStyle, providerId, facts.protocol);
}

// ===== 三变体分派（两处装配共用） =====

/**
 * 已定案的数值 → 三变体请求联合：`dialect` × `protocol` 两级判别。
 * 矛盾组合编译期不可表示（Anthropic 变体没有 protocol / temperature 字段）。
 */
function buildRequest(
	facts: ModelFacts,
	target: RequestTarget,
	messages: ChatMessage[],
	decided: {
		maxTokens: number;
		timeoutSeconds: number;
		thinking: ThinkingParam | null;
		/** undefined＝不发温度（策略已判死）；Anthropic 变体一律丢弃。 */
		temperature: number | undefined;
	}
): ModelRequest {
	const base = {
		baseUrl: target.baseUrl,
		apiKey: target.apiKey,
		model: target.model,
		messages,
		maxTokens: decided.maxTokens,
		timeoutSeconds: decided.timeoutSeconds,
		thinking: decided.thinking,
	};
	if (facts.apiStyle === "anthropic") {
		return { ...base, dialect: "anthropic" };
	}
	const protocol = protocolOf(facts);
	if (protocol === "responses") {
		return { ...base, dialect: "openai", protocol: "responses", ...temperatureOf(decided.temperature) };
	}
	return {
		...base,
		dialect: "openai",
		protocol: "chat-completions",
		outputField: facts.requestPolicy.outputField,
		...temperatureOf(decided.temperature),
	};
}

/** 温度缺席＝不发（#111 的联合形状）；Anthropic 变体没有该字段，自然不会渲染。 */
function temperatureOf(value: number | undefined): { temperature?: number } {
	return value === undefined ? {} : { temperature: value };
}
