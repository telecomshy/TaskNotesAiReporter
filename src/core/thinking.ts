/**
 * 「思考」参数解析纯模块（#84，ADR-0024 / ADR-0025）：输入（供应商类型 + 模型 + 思考三态
 * + 能力表），输出请求体追加参数 / 不可关原因 / UI 标注 / 假关判定。
 * 能力表是插件内置数据（随 docs/research/thinking-toggle-apis.md 维护），非用户配置面；
 * 新增模型只改表，不改代码路径。一次请求只发一个开关参数（互斥参数同发会 400）。
 * 自定义供应商不提供思考开关（ADR-0025）：能力表按网关分派、自定义 URL 猜不得。
 */

import type {
	ThinkingParam,
	ThinkingResolution,
	ThinkingSetting,
} from "../types";

/** 解析输入。预设供应商查能力表；自定义供应商不提供思考开关（恒标注 unsupported）。 */
export interface ThinkingInput {
	providerType: "preset" | "custom";
	providerId: string;
	model: string;
	setting: ThinkingSetting;
}

/** 一个（供应商, 模型）的思考能力。 */
export type ThinkingCapability =
	/** 可关可开：off / on 为对应的开关参数。 */
	| { kind: "switchable"; off: ThinkingParam; on?: ThinkingParam }
	/** 强制思考（关参数会 400 或无关闭档），不发参数。 */
	| { kind: "forced" }
	/** 无思考模型（不支持思考参数），不发参数。 */
	| { kind: "none" };

/** 能力表一行：按（供应商, 模型）匹配，首个命中行生效。 */
export interface ThinkingCapabilityRow {
	providerId: string;
	/** 模型匹配：精确 ID，或以 `*` 结尾的前缀。 */
	modelPattern: string;
	capability: ThinkingCapability;
}

/** `thinking` 对象族开关参数（DeepSeek / Kimi K2.x / MiniMax / 智谱）。 */
function thinkingTypeSwitch(onValue: string): ThinkingCapability {
	return {
		kind: "switchable",
		off: { name: "thinking", value: { type: "disabled" } },
		on: { name: "thinking", value: { type: onValue } },
	};
}

/** `enable_thinking` 布尔族开关参数（DashScope / 百炼系）。 */
function enableThinkingSwitch(): ThinkingCapability {
	return {
		kind: "switchable",
		off: { name: "enable_thinking", value: false },
		on: { name: "enable_thinking", value: true },
	};
}

/** 内置（供应商, 模型）能力表；事实源 docs/research/thinking-toggle-apis.md。 */
export const THINKING_CAPABILITIES: readonly ThinkingCapabilityRow[] = [
	// DeepSeek 直连：全系统一语义（thinking 优先于 reasoning_effort，二者同发安全）。
	{ providerId: "deepseek", modelPattern: "*", capability: thinkingTypeSwitch("enabled") },
	// 阿里云百炼 DashScope：同一模型跨网关参数不同——先排仅思考与他厂直供型号，再落 Qwen 全系。
	{ providerId: "qwen", modelPattern: "qwen3.8-2.4t-a95b", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "qwen3.7-max-preview*", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "qwen3.7-max-2026-05-17", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "MiniMax/MiniMax-M3.1-Flash", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "MiniMax/MiniMax-M2*", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "MiniMax/MiniMax-M3", capability: thinkingTypeSwitch("adaptive") },
	{ providerId: "qwen", modelPattern: "kimi-k3*", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "kimi-k2.7-code*", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "kimi-k2.6*", capability: enableThinkingSwitch() },
	{ providerId: "qwen", modelPattern: "kimi-k2.5*", capability: enableThinkingSwitch() },
	{ providerId: "qwen", modelPattern: "glm-5.3*", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "glm-4-long*", capability: { kind: "none" } },
	{ providerId: "qwen", modelPattern: "glm-4-flash-250414*", capability: { kind: "none" } },
	{ providerId: "qwen", modelPattern: "glm-4-flashx-250414*", capability: { kind: "none" } },
	{ providerId: "qwen", modelPattern: "glm*", capability: enableThinkingSwitch() },
	{ providerId: "qwen", modelPattern: "deepseek-r1*", capability: { kind: "forced" } },
	{ providerId: "qwen", modelPattern: "deepseek*", capability: enableThinkingSwitch() },
	{ providerId: "qwen", modelPattern: "qwen-max", capability: { kind: "none" } },
	{ providerId: "qwen", modelPattern: "qwen-turbo", capability: { kind: "none" } },
	{ providerId: "qwen", modelPattern: "qwen-long", capability: { kind: "none" } },
	{ providerId: "qwen", modelPattern: "qwen*", capability: enableThinkingSwitch() },
	// Kimi（月之暗面）：K3 全系强制思考（不支持 thinking 参数、无关闭档）。
	{ providerId: "kimi", modelPattern: "kimi-k3*", capability: { kind: "forced" } },
	// K2.6 可关（thinking.type）；K2.7-code 只接受 enabled，传 disabled 报错。
	{ providerId: "kimi", modelPattern: "kimi-k2.6*", capability: thinkingTypeSwitch("enabled") },
	{ providerId: "kimi", modelPattern: "kimi-k2.7-code*", capability: { kind: "forced" } },
	// moonshot-v1 全系 / kimi-latest 无思考参数（且已下线）。
	{ providerId: "kimi", modelPattern: "moonshot-v1*", capability: { kind: "none" } },
	{ providerId: "kimi", modelPattern: "kimi-latest", capability: { kind: "none" } },
	// MiniMax：M3 可关（开＝adaptive）；M3.1-Flash 强制思考，传关参数会 400。
	{ providerId: "minimax", modelPattern: "MiniMax-M3", capability: thinkingTypeSwitch("adaptive") },
	{ providerId: "minimax", modelPattern: "MiniMax-M3.1-Flash", capability: { kind: "forced" } },
	// M2.x 思考无法关闭（传 disabled 被接收但不生效）。
	{ providerId: "minimax", modelPattern: "MiniMax-M2*", capability: { kind: "forced" } },
	// 智谱 GLM：5.3 全系强制思考（thinking.type 仅接受 enabled，传 disabled 报错）。
	{ providerId: "zhipu", modelPattern: "glm-5.3*", capability: { kind: "forced" } },
	// GLM-4.5 以下不支持 thinking 参数（glm-4-long / 老免费档）。
	{ providerId: "zhipu", modelPattern: "glm-4-long*", capability: { kind: "none" } },
	{ providerId: "zhipu", modelPattern: "glm-4-flash-250414*", capability: { kind: "none" } },
	{ providerId: "zhipu", modelPattern: "glm-4-flashx-250414*", capability: { kind: "none" } },
	// 其余支持思考的 GLM（5.2/5.1/5/5-turbo/4.7/4.6/4.5 族）可关可开。
	{ providerId: "zhipu", modelPattern: "glm-5*", capability: thinkingTypeSwitch("enabled") },
	{ providerId: "zhipu", modelPattern: "glm-4*", capability: thinkingTypeSwitch("enabled") },
];

/**
 * 解析「思考」三态到请求参数与 UI 标注：
 * - 「自动」不发参数（保持服务端默认）；「开」发开参数（无开参数等同「自动」）；「关」发关参数；
 * - 强制思考 / 无思考模型无论三态都不发参数，给出置灰标注；
 * - 能力表未知模型不发参数、标注未知（对未知模型降级，见研究笔记 9.6）；
 * - 自定义供应商不提供思考开关（ADR-0025）：恒不发参数、标注 unsupported。
 */
export function resolveThinking(
	input: ThinkingInput,
	table: readonly ThinkingCapabilityRow[] = THINKING_CAPABILITIES
): ThinkingResolution {
	const setting = input.setting;

	if (input.providerType === "custom") {
		return { setting, param: null, note: "unsupported" };
	}

	const row = table.find(
		(r) => r.providerId === input.providerId && matchModel(r.modelPattern, input.model)
	);
	if (!row) return { setting, param: null, note: "unknown" };

	const cap = row.capability;
	if (cap.kind === "forced") return { setting, param: null, note: "forced" };
	if (cap.kind === "none") return { setting, param: null, note: "none" };

	if (setting === "off") return { setting, param: cap.off, note: null };
	if (setting === "on" && cap.on) return { setting, param: cap.on, note: null };
	return { setting, param: null, note: null };
}

/**
 * 假关判定：设「关」、发出了关参数、响应仍带推理段（reasoning_content / reasoning_tokens），
 * 即「以为关了其实没关」。不看 HTTP 200（错误参数名会得到 200＋正常思考）。
 * 未发参数的情形（强制思考 / 无思考 / 未知）不判假关——UI 标注已如实告知。
 */
export function isThinkingFakeOff(
	resolution: ThinkingResolution,
	responseHasReasoning: boolean
): boolean {
	return resolution.setting === "off" && resolution.param !== null && responseHasReasoning;
}

/** 模型匹配：`*` 结尾为前缀匹配，否则精确匹配。 */
function matchModel(pattern: string, model: string): boolean {
	if (pattern.endsWith("*")) return model.startsWith(pattern.slice(0, -1));
	return pattern === model;
}
