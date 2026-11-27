/**
 * 「思考」参数解析纯模块（#84，ADR-0024 / ADR-0026）：输入（供应商 + 模型 + 思考两档
 * + 能力表），输出请求体追加参数 / 不可关原因 / UI 标注 / 假关判定。
 * 能力表是插件内置数据（随 docs/research/thinking-toggle-apis.md 维护），非用户配置面；
 * 新增模型只改表，不改代码路径。一次请求只发一个开关参数（互斥参数同发会 400）。
 * 能力按（供应商 ID, 模型）查表命中——自定义供应商与预设同路（ADR-0026）：ID 不在表内，
 * 未实测（#89 习得能力）前一律未知。
 */

import type { ApiStyle, WireProtocol } from "../types";
import { resolveApiStyle } from "./apiStyle";
import { matchModelPattern } from "./modelPattern";
import { protocolOf, resolveWireProtocol } from "./wireProtocol";
import type {
	LearnedCapability,
	LearnedSource,
	ModelProvider,
	ThinkingNote,
	ThinkingParam,
	ThinkingResolution,
	ThinkingSetting,
	ThinkingTestVerdict,
} from "../types";

/** 解析输入：按（供应商 ID, 模型）查能力表；两档取值见 `ThinkingSetting`。 */
export interface ThinkingInput {
	providerId: string;
	model: string;
	setting: ThinkingSetting;
	/**
	 * 当前（供应商, 模型）的接口形状（#112）：习得条目只有来源一致才生效。
	 * 必填——来源是判定前提，不允许调用方漏传后静默照信。
	 */
	source: LearnedSource;
	/** 习得能力条目（#89）：来源一致且命中才盖过内置能力表（习得 ＞ 内置 ＞ 未知）。 */
	learned?: LearnedCapability | null;
}

/** 一个（供应商, 模型）的思考能力。 */
export type ThinkingCapability =
	/** 可关可开：off / on 为对应的开关参数。 */
	| { kind: "switchable"; off: ThinkingParam; on?: ThinkingParam }
	/** 强制思考（关参数会 400 或无关闭档），不发参数。 */
	| { kind: "forced" }
	/** 无思考模型（不支持思考参数），不发参数。 */
	| { kind: "none" }
	/**
	 * 显式「未知」（#110）：为挡住同族通配行而设——按（供应商, 模型）查表是首个命中，
	 * 这些族若没有自己的行，会被相邻前缀行（如 `gpt-5.4*`）当成可关族，
	 * 从而在另一套报文上发出该协议不存在的字段。`kind:"unknown"` 与「表未命中」同义。
	 */
	| { kind: "unknown" };

/** 能力表一行：按（供应商, 模型）匹配，首个命中行生效。 */
export interface ThinkingCapabilityRow {
	providerId: string;
	/** 模型匹配：精确 ID，或以 `*` 结尾的前缀。 */
	modelPattern: string;
	capability: ThinkingCapability;
}

/*
 * 命名形状常量（#114，ADR-0035）：能力表开关构造器与四张候选清单共用同一份关参数形状。
 * 清单**仍显式有序**——不从能力行派生：Responses 的嵌套形状没有对应能力行（ADR-0026 不登记
 * 未知族），派生覆盖不到。模块私有：形状是内部约定，不新增导出面。
 */
const THINKING_DISABLED: ThinkingParam = { name: "thinking", value: { type: "disabled" } };
const ENABLE_THINKING_OFF: ThinkingParam = { name: "enable_thinking", value: false };
const REASONING_EFFORT_NONE: ThinkingParam = { name: "reasoning_effort", value: "none" };
const RESPONSES_REASONING_NONE: ThinkingParam = { name: "reasoning", value: { effort: "none" } };

/** `thinking` 对象族开关参数（DeepSeek / Kimi K2.x / MiniMax / 智谱）。 */
function thinkingTypeSwitch(onValue: string): ThinkingCapability {
	return {
		kind: "switchable",
		off: THINKING_DISABLED,
		on: { name: "thinking", value: { type: onValue } },
	};
}

/** `enable_thinking` 布尔族开关参数（DashScope / 百炼系）。 */
function enableThinkingSwitch(): ThinkingCapability {
	return {
		kind: "switchable",
		off: ENABLE_THINKING_OFF,
		on: { name: "enable_thinking", value: true },
	};
}

/**
 * 顶层 `reasoning_effort` 开关（OpenAI 官方预设，#106）：关＝`"none"`、开＝`"high"`。
 * 关态发 `none` 在强制族上会 400，故那几族用 `{kind:"forced"}` 而不是本开关。
 */
function reasoningEffortSwitch(): ThinkingCapability {
	return {
		kind: "switchable",
		off: REASONING_EFFORT_NONE,
		on: { name: "reasoning_effort", value: "high" },
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
	// Anthropic 官方预设（#105）：adaptive 时代——开 `{type:"adaptive"}`、关 `{type:"disabled"}`。
	// 自定义 Anthropic 网关不在表内，初始未知、由思考测试学习（#105 裁决 9）。
	{ providerId: "anthropic", modelPattern: "claude-*", capability: thinkingTypeSwitch("adaptive") },
	// OpenAI 官方预设（#106）：Chat Completions 的开关是顶层 `reasoning_effort`；
	// 开＝"high"、关＝"none"。强制族（关态发 none 会 400）行排在通用族之前。
	//
	// Responses-only 族（#110）：官方未给出 `none` 支持 ⇒ 不登记（ADR-0026），但必须用显式
	// 「未知」行挡住**所有**同族通用前缀行（`*-pro` 先于 gpt-6.x / gpt-5.x 各族，
	// `gpt-5.6-cyber` 先于 `gpt-5.6*`）——否则 `gpt-5.4-pro` 或未来的 `gpt-6.1-terra-pro`
	// 会被当成 Chat 的可关族，在 `/responses` 上发出不存在的顶层 `reasoning_effort`。
	// 开关因而置灰、思考测试可点（探嵌套 `reasoning.effort`），习得结论照旧盖过；
	// 顺序由 test/modelTableInvariants 交叉测试执法（#114，ADR-0035）。
	{ providerId: "openai", modelPattern: "*-pro", capability: { kind: "unknown" } },
	{ providerId: "openai", modelPattern: "gpt-oss-*", capability: { kind: "unknown" } },
	{ providerId: "openai", modelPattern: "gpt-5.6-cyber", capability: { kind: "unknown" } },
	{ providerId: "openai", modelPattern: "gpt-6-astra", capability: { kind: "forced" } },
	{ providerId: "openai", modelPattern: "gpt-6.1-sol", capability: { kind: "forced" } },
	{ providerId: "openai", modelPattern: "gpt-6.2*", capability: { kind: "forced" } },
	{ providerId: "openai", modelPattern: "gpt-6.1-terra*", capability: reasoningEffortSwitch() },
	{ providerId: "openai", modelPattern: "gpt-6-sol*", capability: reasoningEffortSwitch() },
	{ providerId: "openai", modelPattern: "gpt-6-luna*", capability: reasoningEffortSwitch() },
	{ providerId: "openai", modelPattern: "gpt-5.2*", capability: reasoningEffortSwitch() },
	{ providerId: "openai", modelPattern: "gpt-5.4*", capability: reasoningEffortSwitch() },
	{ providerId: "openai", modelPattern: "gpt-5.6*", capability: reasoningEffortSwitch() },
	// 老的非推理对话模型：不支持思考参数。
	{ providerId: "openai", modelPattern: "gpt-4.1*", capability: { kind: "none" } },
	{ providerId: "openai", modelPattern: "gpt-4o*", capability: { kind: "none" } },
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
 * 当前（供应商, 模型）的接口形状归一（#112，ADR-0033）：经 `resolveApiStyle` 与
 * `protocolOf` 的缺省口径——Anthropic 方言没有协议；OpenAI 方言缺省 Chat Completions。
 * 用于「当前来源」与「测试条目出生时的来源」同一份事实解析。
 */
export function learnedSourceOf(apiStyle?: ApiStyle, protocol?: WireProtocol): LearnedSource {
	if (resolveApiStyle(apiStyle) === "anthropic") return { apiStyle: "anthropic" };
	return { apiStyle: "openai", protocol: protocolOf({ protocol }) };
}

/**
 * 存档来源结构的严格解析（#112）：结构不可读返回 null（＝来源不明）。
 * 与 `learnedSourceOf` 的宽松缺省**刻意不对称**：存档里缺字段（含 OpenAI 缺 protocol）
 * 不是可确认的来源，不能拿缺省补章（ADR-0033 Considered Options 第一条）。
 */
export function parseLearnedSource(raw: unknown): LearnedSource | null {
	if (typeof raw !== "object" || raw === null) return null;
	const source = raw as Record<string, unknown>;
	if (source.apiStyle === "anthropic") return { apiStyle: "anthropic" };
	if (source.apiStyle !== "openai") return null;
	if (source.protocol !== "chat-completions" && source.protocol !== "responses") return null;
	return { apiStyle: "openai", protocol: source.protocol };
}

/** 两个来源是否同形（#112）：Anthropic 无协议，OpenAI 按协议区分。 */
function sameLearnedSource(a: LearnedSource, b: LearnedSource): boolean {
	if (a.apiStyle !== b.apiStyle) return false;
	if (a.apiStyle === "openai" && b.apiStyle === "openai") return a.protocol === b.protocol;
	return true;
}

/**
 * 内置能力表分支的结果（形状单源）：习得两栏恒空。把「无习得」六处重复收到一处。
 */
function builtinThinking(
	setting: ThinkingSetting,
	param: ThinkingParam | null,
	note: ThinkingNote | null
): ThinkingResolution {
	return { setting, param, note, learned: null, staleLearned: null };
}

/**
 * 「未知能力」的解析结果（形状单源）：能力表未命中、或尚未选出可用（供应商, 模型）时共用。
 * 只带两档取值，不发明参数与习得条目。
 */
export function unknownThinking(setting: ThinkingSetting): ThinkingResolution {
	return { setting, param: null, note: "unknown", learned: null, staleLearned: null };
}

/**
 * 解析「思考」两档到请求参数与 UI 标注（#88 两档语义）：
 * - 习得条目**来源一致**才生效（习得 ＞ 内置能力表 ＞ 未知，#89 / #112）：「可关」的「关」发
 *   习得关参数，「开」无开参数则不发；「未检出思考」「未能关闭」不发参数（措辞在呈现层，诚实化）；
 * - 来源缺失 / 不符 / 不可解析 → 条目不生效（`param: null`、`note: "unknown"`），
 *   原条目经 `staleLearned` 带出供呈现；**绝不回落内置表**（旧结论不能冒充当前能力）；
 * - 「开」发开参数（该模型无开参数则不发）；「关」发关参数；一次请求只发一个参数；
 * - 强制思考 / 无思考模型无论两档都不发参数，给出置灰标注；
 * - 能力表未命中（含自定义供应商）不发参数、标注未知（对未知模型降级，见研究笔记 9.6）。
 */
export function resolveThinking(
	input: ThinkingInput,
	table: readonly ThinkingCapabilityRow[] = THINKING_CAPABILITIES
): ThinkingResolution {
	const setting = input.setting;
	const learned = input.learned ?? null;

	if (learned) {
		const learnedSource = parseLearnedSource(learned.source);
		if (!learnedSource || !sameLearnedSource(learnedSource, input.source)) {
			return { setting, param: null, note: "unknown", learned: null, staleLearned: learned };
		}
		if (learned.verdict === "switchable") {
			const off = learned.off ?? null;
			return { setting, param: setting === "off" ? off : null, note: null, learned, staleLearned: null };
		}
		return { setting, param: null, note: null, learned, staleLearned: null };
	}

	const row = table.find(
		(r) => r.providerId === input.providerId && matchModelPattern(r.modelPattern, input.model)
	);
	if (!row) return unknownThinking(setting);

	const cap = row.capability;
	if (cap.kind === "unknown") return unknownThinking(setting);
	if (cap.kind === "forced") return builtinThinking(setting, null, "forced");
	if (cap.kind === "none") return builtinThinking(setting, null, "none");

	if (setting === "off") return builtinThinking(setting, cap.off, null);
	if (setting === "on" && cap.on) return builtinThinking(setting, cap.on, null);
	return builtinThinking(setting, null, null);
}

/**
 * 读取某个模型的「思考」解析结果：该模型的「思考开关」取值（缺省＝关）经能力层映射，
 * 请求参数与置灰标注一并带出（ADR-0024）。设置页与当前模型 解析共用这一个读面。
 * 能力层优先级（#89）：习得能力（来源一致）＞ 内置能力表 ＞ 未知——自定义供应商与预设同路。
 * 当前来源由（供应商, 模型）当场解析（#112，ADR-0033）：方言＋协议，与 #111 facts 同源。
 *
 * #111 起本函数落在 core：请求装配（ai/modelRequest）要读它，而 ai 不得依赖 settings 侧模块
 * （ADR-0032 防环）；settings/providerSettings 原位 re-export，既有调用方零改动。
 */
export function thinkingFor(provider: ModelProvider, model: string): ThinkingResolution {
	const apiStyle = resolveApiStyle(provider.apiStyle);
	return resolveThinking({
		providerId: provider.id,
		model,
		setting: provider.thinkingByModel?.[model] ?? "off",
		// 来源与 #111 facts 同一来源（ADR-0033）：Anthropic 由 learnedSourceOf 丢掉协议。
		source: learnedSourceOf(apiStyle, resolveWireProtocol(provider.id, model)),
		learned: provider.learnedByModel?.[model] ?? null,
	});
}

/**
 * 两档解析与迁移（#88）：把持久化的思考取值归一为两档。
 * 存量三态「自动」迁移为「开」（行为几乎不变，见 ADR-0026）；迁移幂等（on → on）。
 * 非法值剔除：返回 undefined，由调用方丢弃条目（读取侧缺省＝「关」）。
 */
export function normalizeThinkingSetting(raw: unknown): ThinkingSetting | undefined {
	if (raw === "on" || raw === "off") return raw;
	if (raw === "auto") return "on";
	return undefined;
}

/** 徽标色族（原型四色定案）：builtin＝内置（紫）/ learned＝实测（绿）/ unknown＝未知（灰）/ warn＝警示（琥珀）。 */
export type ThinkingBadgeTone = "builtin" | "learned" | "unknown" | "warn";

/** 测试入口形态：available＝可发起思考测试 / done＝已知无需测试 / retest＝已实测可「重新测试」（#89）。 */
export type ThinkingTestEntry = "available" | "done" | "retest";

/**
 * 「思考」显示矩阵一行（#86）：开关可用性 + 徽标 + 备注警示 + 测试入口。
 * 文案键由 UI 映射（ADR-0005），本模块只出数据。习得档徽标带测试时间戳（UI 取 learned.testedAt）。
 */
export interface ThinkingDisplay {
	state: ThinkingDisplayState;
	badge: ThinkingBadgeTone;
	/** 滑动开关可操作 ⇔ 思考能力已知且可关（内置可关或习得可关）。 */
	toggleEnabled: boolean;
	/** 备注用警示色（琥珀）。 */
	footnoteWarn: boolean;
	testEntry: ThinkingTestEntry;
}

/**
 * 显示矩阵的行状态（#86 / #88 / #89）：builtin＝内置能力表·可关 / forced＝强制思考 /
 * none＝无思考 / unknown＝未知能力；learned-*＝习得档（实测）三值——
 * 可关 / 未检出思考（措辞不写「无思考」）/ 未能关闭（措辞不写「强制思考」）；
 * learned-stale＝来源不符或无法确认的实测结论（#112，琥珀徽标 + 重测）。
 */
export type ThinkingDisplayState =
	| "builtin"
	| "forced"
	| "none"
	| "unknown"
	| "learned-switchable"
	| "learned-not-detected"
	| "learned-not-switchable"
	| "learned-stale";

/** 显示矩阵（#86 / #89）：行状态 → 呈现数据。习得档转「重新测试」文字入口（清习得并重跑）。 */
const THINKING_DISPLAY: Record<ThinkingDisplayState, ThinkingDisplay> = {
	builtin: { state: "builtin", badge: "builtin", toggleEnabled: true, footnoteWarn: false, testEntry: "done" },
	forced: { state: "forced", badge: "warn", toggleEnabled: false, footnoteWarn: true, testEntry: "done" },
	none: { state: "none", badge: "unknown", toggleEnabled: false, footnoteWarn: false, testEntry: "done" },
	unknown: { state: "unknown", badge: "unknown", toggleEnabled: false, footnoteWarn: true, testEntry: "available" },
	"learned-switchable": {
		state: "learned-switchable",
		badge: "learned",
		toggleEnabled: true,
		footnoteWarn: false,
		testEntry: "retest",
	},
	"learned-not-detected": {
		state: "learned-not-detected",
		badge: "learned",
		toggleEnabled: false,
		footnoteWarn: false,
		testEntry: "retest",
	},
	"learned-not-switchable": {
		state: "learned-not-switchable",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "retest",
	},
	"learned-stale": {
		state: "learned-stale",
		// 琥珀徽标沿用「实测 {{date}}」文案（#112）：消失会被读成数据丢失，习得过期要显性。
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "retest",
	},
};

/** 习得判定 → 显示矩阵行状态。 */
const LEARNED_DISPLAY_STATE: Record<LearnedCapability["verdict"], ThinkingDisplayState> = {
	switchable: "learned-switchable",
	"not-detected": "learned-not-detected",
	"not-switchable": "learned-not-switchable",
};

/** 由思考解析结果推导「当前模型」区呈现（显示矩阵，#88 落地；习得档 #89 / 习得过期档 #112）。 */
export function thinkingDisplay(resolution: ThinkingResolution): ThinkingDisplay {
	if (resolution.staleLearned) return THINKING_DISPLAY["learned-stale"];
	if (resolution.learned) return THINKING_DISPLAY[LEARNED_DISPLAY_STATE[resolution.learned.verdict]];
	const state: ThinkingDisplayState = resolution.note === null ? "builtin" : resolution.note;
	return THINKING_DISPLAY[state];
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

// ===== 思考测试纯状态机（#89，缝 1） =====

/**
 * 固定字段候选（#89）：按研究笔记的参数族有序排列（`thinking` 对象 / `enable_thinking` 布尔 /
 * `reasoning_effort` 字符串，见 docs/research/thinking-toggle-apis.md），一次只发一个
 * （ADR-0024 互斥约束）。候选清单之外的暗号不猜——漏网的真暗号只能给出「未能关闭」。
 */
export const THINKING_OFF_CANDIDATES: readonly ThinkingParam[] = [
	THINKING_DISABLED,
	ENABLE_THINKING_OFF,
	REASONING_EFFORT_NONE,
];

/**
 * Anthropic 方言的关字段候选（#105 裁决 10）：单字段 `thinking: {type:"disabled"}`。
 * 只试该方言自己的关字段——拿 OpenAI 字段去探 Claude 只会白落「未能关闭」。
 */
export const ANTHROPIC_THINKING_OFF_CANDIDATES: readonly ThinkingParam[] = [THINKING_DISABLED];

/**
 * OpenAI 官方预设的关字段候选（#106 裁决 12）：Chat Completions 上唯一的文档化开关是
 * 顶层 `reasoning_effort`，其余 OpenAI 参数名（`thinking` / `enable_thinking`）只会白落 400。
 */
export const OPENAI_THINKING_OFF_CANDIDATES: readonly ThinkingParam[] = [REASONING_EFFORT_NONE];

/**
 * Responses 协议下的关字段候选（#110）：开关是嵌套对象路径 `reasoning.effort`，
 * 顶层 `reasoning_effort` 在 `/responses` 上是不存在的字段。
 */
export const RESPONSES_THINKING_OFF_CANDIDATES: readonly ThinkingParam[] = [RESPONSES_REASONING_NONE];

/**
 * 取思考测试候选清单：内置 OpenAI 预设按**供应商 id + 协议**分派（#106 / #110）——
 * Chat Completions 只试顶层 `reasoning_effort`，Responses 只试嵌套 `reasoning.effort`；
 * 其余 OpenAI 方言保持三字段（#105 收窄到方言级）；Anthropic 方言只试自己的关字段。
 * 状态机（基线 → 逐字段 → 四值判定）与判定规则不因候选清单分叉。
 */
export function thinkingOffCandidates(
	apiStyle?: ApiStyle,
	providerId?: string,
	protocol?: WireProtocol
): readonly ThinkingParam[] {
	if (providerId === "openai") {
		// 同一家供应商的两种报文形态各有自己的字段名：发错顶层/嵌套都只会白落 400。
		return protocol === "responses"
			? RESPONSES_THINKING_OFF_CANDIDATES
			: OPENAI_THINKING_OFF_CANDIDATES;
	}
	return resolveApiStyle(apiStyle) === "anthropic"
		? ANTHROPIC_THINKING_OFF_CANDIDATES
		: THINKING_OFF_CANDIDATES;
}

/**
 * 微型请求的读面结果（思考测试状态机输入，#89）：
 * - `reasoning-present` / `reasoning-absent`：2xx，按响应推理段读面判定（唯一证据，不认 HTTP 200）；
 * - `rejected`：400，字段不适用（探测信号），换下一个候选；
 * - `interrupted`：超时 / 网络错误 / 其它异常，中断不留结论。
 */
export type ThinkingProbeOutcome =
	| "reasoning-present"
	| "reasoning-absent"
	| "rejected"
	| "interrupted";

/** 执行层错误 → 读面结果归类：测试内 400 是探测信号，其余异常一律中断（AC2）。 */
export function probeOutcomeOfError(status: number | undefined): ThinkingProbeOutcome {
	return status === 400 ? "rejected" : "interrupted";
}

/** 状态机的下一步：发微型请求（param null＝基线），或给出最终四值判定＋习得条目。 */
export type ThinkingTestAction =
	| { kind: "probe"; param: ThinkingParam | null }
	| { kind: "conclude"; verdict: ThinkingTestVerdict; entry: LearnedCapability | null };

/**
 * 思考测试状态：基线 → 逐字段（待试候选下标）→ 判定。纯状态，无 IO。
 * 候选清单随状态携带（按方言注入，#105 裁决 10）；接口形状随状态携带（#112）——
 * 条目出生即带来源，流程层不事后补字段。状态机的语义与判定规则不因方言分叉。
 */
export interface ThinkingTestState {
	phase: "baseline" | "probe";
	candidateIndex: number;
	/** 本次测试的关字段候选（缺省 OpenAI 兼容三字段）。 */
	candidates: readonly ThinkingParam[];
	/** 本次测试的接口形状（#112）：落档条目原样带上。 */
	source: LearnedSource;
}

/** 开始思考测试：第一步是基线微型请求（不发思考参数，先判会不会思考）。 */
export function startThinkingTest(
	candidates: readonly ThinkingParam[],
	source: LearnedSource
): { state: ThinkingTestState; action: ThinkingTestAction } {
	return {
		state: { phase: "baseline", candidateIndex: 0, candidates, source },
		action: { kind: "probe", param: null },
	};
}

/**
 * 状态机转移（#89）：输入上一步微型请求的读面结果，输出下一步。
 * 判定只认推理段读面：`reasoning-absent` 是「可关」的唯一证据；`rejected`（400）换下一个
 * 候选；`interrupted` 一律中断、不留结论（可完整重测）；候选耗尽仍未关掉 →「未能关闭」
 * （措辞不写「强制思考」）；基线未检出 →「未检出思考」（措辞不写「无思考」）。
 * `now` 注入时钟，产出的习得条目带测试时间戳。
 */
export function stepThinkingTest(
	state: ThinkingTestState,
	outcome: ThinkingProbeOutcome,
	now: () => string = () => new Date().toISOString()
): { state: ThinkingTestState; action: ThinkingTestAction } {
	const interrupted: ThinkingTestAction = { kind: "conclude", verdict: "interrupted", entry: null };
	if (outcome === "interrupted") return { state, action: interrupted };

	if (state.phase === "baseline") {
		// 基线无字段可换：400 不是探测信号，按中断处理。
		if (outcome === "rejected") return { state, action: interrupted };
		if (outcome === "reasoning-absent") {
			return {
				state,
				action: {
					kind: "conclude",
					verdict: "not-detected",
					entry: { verdict: "not-detected", testedAt: now(), source: state.source },
				},
			};
		}
		return {
			state: { ...state, phase: "probe", candidateIndex: 0 },
			action: { kind: "probe", param: state.candidates[0] },
		};
	}

	const current = state.candidates[state.candidateIndex];
	if (outcome === "reasoning-absent") {
		return {
			state,
			action: {
				kind: "conclude",
				verdict: "switchable",
				entry: { verdict: "switchable", off: current, testedAt: now(), source: state.source },
			},
		};
	}
	// rejected（字段不适用）或 reasoning-present（被静默忽略）：换下一个候选。
	const next = state.candidateIndex + 1;
	if (next < state.candidates.length) {
		return {
			state: { ...state, phase: "probe", candidateIndex: next },
			action: { kind: "probe", param: state.candidates[next] },
		};
	}
	return {
		state,
		action: {
			kind: "conclude",
			verdict: "not-switchable",
			entry: {
				verdict: "not-switchable",
				triedFields: state.candidates.length,
				testedAt: now(),
				source: state.source,
			},
		},
	};
}
