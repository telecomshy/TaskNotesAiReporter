import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isThinkingFakeOff,
	learnedSourceOf,
	normalizeThinkingSetting,
	probeOutcomeOfError,
	resolveThinking,
	startThinkingTest,
	stepThinkingTest,
	thinkingDisplay,
	THINKING_CAPABILITIES,
	THINKING_OFF_CANDIDATES,
	ANTHROPIC_THINKING_OFF_CANDIDATES,
	OPENAI_THINKING_OFF_CANDIDATES,
	RESPONSES_THINKING_OFF_CANDIDATES,
	thinkingOffCandidates,
	type ThinkingCapabilityRow,
	type ThinkingInput,
} from "../src/core/thinking";
import type { LearnedSource } from "../src/types";

/** 思考测试状态机测试的固定时钟（习得条目时间戳断言用）。 */
const NOW = () => "2026-11-04T08:00:00.000Z";
const TESTED_AT = "2026-11-04T08:00:00.000Z";

/** 当前来源固定件（#112）：默认 OpenAI Chat；来源相关用例显式传别的值。 */
const OPENAI_CHAT: LearnedSource = { apiStyle: "openai", protocol: "chat-completions" };
const OPENAI_RESPONSES: LearnedSource = { apiStyle: "openai", protocol: "responses" };
const ANTHROPIC_SOURCE: LearnedSource = { apiStyle: "anthropic" };

/** 解析辅助：默认「当前来源＝OpenAI Chat」，本文件其余用例零改动；来源用例显式覆盖。 */
function resolve(
	input: Omit<ThinkingInput, "source"> & { source?: LearnedSource },
	table?: readonly ThinkingCapabilityRow[]
) {
	const { source = OPENAI_CHAT, ...rest } = input;
	return resolveThinking({ ...rest, source }, table);
}

/** 默认候选 + OpenAI Chat 来源开始一次测试。 */
function startDefault() {
	return startThinkingTest(THINKING_OFF_CANDIDATES, OPENAI_CHAT);
}

test("两档迁移（#88）：存量「自动」迁移为「开」，on / off 原样保留（幂等）", () => {
	assert.equal(normalizeThinkingSetting("auto"), "on", "auto → on");
	assert.equal(normalizeThinkingSetting("on"), "on", "on → on（迁移幂等）");
	assert.equal(normalizeThinkingSetting("off"), "off", "off → off");
	assert.equal(normalizeThinkingSetting(normalizeThinkingSetting("auto")), "on", "再归一不变");
});

test("两档迁移（#88）：非法取值剔除（返回 undefined，读取侧缺省＝关）", () => {
	for (const raw of ["sometimes", "", null, undefined, 1, {}, ["on"]] as unknown[]) {
		assert.equal(normalizeThinkingSetting(raw), undefined, String(raw));
	}
});

test("「关」产出关参数：DeepSeek 发 thinking:{type:disabled}，单键", () => {
	const r = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "thinking", value: { type: "disabled" } });
	assert.equal(r.note, null);
});

test("「开」发开参数：thinking:{type:enabled}", () => {
	const r = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "on",
	});
	assert.deepEqual(r.param, { name: "thinking", value: { type: "enabled" } });
});

test("「开」该模型无开参数则不发（开＝发开参数（无则不发），#88 两档语义）", () => {
	const table = [
		{
			providerId: "p",
			modelPattern: "m",
			capability: {
				kind: "switchable" as const,
				off: { name: "enable_thinking", value: false },
			},
		},
	];
	for (const setting of ["on", "off"] as const) {
		const r = resolve({ providerId: "p", model: "m", setting }, table);
		if (setting === "on") {
			assert.equal(r.param, null, "无开参数：「开」不发");
		} else {
			assert.deepEqual(r.param, { name: "enable_thinking", value: false }, "「关」发关参数");
		}
		assert.equal(r.note, null);
	}
});

test("DashScope：qwen3.8 关参数是 enable_thinking:false（参数名逐供应商不同）", () => {
	const r = resolve({
		providerId: "qwen",
		model: "qwen3.8-max",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "enable_thinking", value: false });
});

test("强制思考模型（Kimi K3）：不发参数，标注 forced（强行关会硬失败）", () => {
	const r = resolve({
		providerId: "kimi",
		model: "kimi-k3",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "forced");
});

test("强制思考模型（MiniMax M3.1-Flash）：不发参数，标注 forced（关参数会 400）", () => {
	const r = resolve({
		providerId: "minimax",
		model: "MiniMax-M3.1-Flash",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "forced");
});

test("强制思考模型（GLM-5.3 全系）：不发参数，标注 forced", () => {
	for (const model of ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx-legal"]) {
		const r = resolve({
			providerId: "zhipu",
			model,
			setting: "off",
		});
		assert.equal(r.param, null, model);
		assert.equal(r.note, "forced", model);
	}
});

test("无思考模型（moonshot-v1-* / glm-4-long）：不发参数，标注 none", () => {
	for (const [providerId, model] of [
		["kimi", "moonshot-v1-8k"],
		["zhipu", "glm-4-long"],
		["zhipu", "glm-4-flash-250414"],
	] as const) {
		const r = resolve({ providerId, model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});

test("MiniMax M3 可关：关=thinking:{type:disabled}，开=thinking:{type:adaptive}（开≠关的简单取反）", () => {
	const off = resolve({
		providerId: "minimax",
		model: "MiniMax-M3",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolve({
		providerId: "minimax",
		model: "MiniMax-M3",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "adaptive" } });
});

test("Kimi K2.6 可关：thinking:{type:disabled}；「开」显式发 enabled", () => {
	const off = resolve({
		providerId: "kimi",
		model: "kimi-k2.6",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolve({
		providerId: "kimi",
		model: "kimi-k2.6",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "enabled" } });
});

test("能力表未知模型：不发参数，标注 unknown（对未知模型降级）", () => {
	const r = resolve({
		providerId: "kimi",
		model: "some-future-model",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "unknown");
});

test("智谱 GLM 可关档（glm-5.2 / 4.7 族）：thinking:{type:disabled|enabled}", () => {
	const off = resolve({
		providerId: "zhipu",
		model: "glm-5.2",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolve({
		providerId: "zhipu",
		model: "glm-4.7-flash",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "enabled" } });
});

test("一次请求只发一个开关参数：全表 × 全两态解析，非空参数并入请求体恰好占一个键", () => {
	for (const row of THINKING_CAPABILITIES) {
		const model = row.modelPattern.endsWith("*")
			? `${row.modelPattern.slice(0, -1)}sample`
			: row.modelPattern;
		for (const setting of ["on", "off"] as const) {
			const label = `${row.providerId} ${row.modelPattern} ${setting}`;
			const r = resolve({ providerId: row.providerId, model, setting });
			if (r.param === null) continue;
			// 与 client.chatCompletion 同款合成：参数并入请求体顶层后恰好多一个键（互斥参数不同时发）
			const body: Record<string, unknown> = { model };
			body[r.param.name] = r.param.value;
			assert.equal(Object.keys(body).length, 2, label);
		}
	}
});

test("自定义供应商与预设同路（ADR-0026）：能力表未命中即未知档——不发参数、标注 unknown", () => {
	for (const setting of ["on", "off"] as const) {
		const r = resolve({
			providerId: "custom_x",
			model: "my-model",
			setting,
		});
		assert.equal(r.param, null, setting);
		assert.equal(r.note, "unknown", setting);
	}
});

test("显示矩阵（#88）：内置·可关 → 开关激活、徽标内置能力表、测试入口置灰", () => {
	const r = resolve({ providerId: "deepseek", model: "deepseek-v4-pro", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "builtin",
		badge: "builtin",
		toggleEnabled: true,
		footnoteWarn: false,
		testEntry: "done",
	});
});

test("显示矩阵（#88）：强制思考 → 开关置灰、徽标警示、备注警示、无需测试", () => {
	const r = resolve({ providerId: "kimi", model: "kimi-k3", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "forced",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "done",
	});
});

test("显示矩阵（#88）：无思考 → 开关置灰、徽标未知、备注不警示、无需测试", () => {
	const r = resolve({ providerId: "kimi", model: "moonshot-v1-8k", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "none",
		badge: "unknown",
		toggleEnabled: false,
		footnoteWarn: false,
		testEntry: "done",
	});
});

test("显示矩阵（#88）：未知 → 开关置灰、徽标未知、备注警示、测试入口留位", () => {
	const r = resolve({ providerId: "kimi", model: "some-future-model", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "unknown",
		badge: "unknown",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "available",
	});
});

test("假关判定：设关且发出关参数、响应仍带推理段 → 假关", () => {
	const r = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
	});
	assert.equal(isThinkingFakeOff(r, true), true);
	assert.equal(isThinkingFakeOff(r, false), false);
});

test("假关判定：设关但未发参数（强制思考/无思考/未知）→ 不判假关", () => {
	for (const [providerId, model] of [
		["kimi", "kimi-k3"],
		["kimi", "moonshot-v1-8k"],
		["kimi", "future-model"],
	] as const) {
		const r = resolve({ providerId, model, setting: "off" });
		assert.equal(isThinkingFakeOff(r, true), false, model);
	}
});

test("假关判定：「开」不判假关", () => {
	const r = resolve({ providerId: "deepseek", model: "m", setting: "on" });
	assert.equal(isThinkingFakeOff(r, true), false);
});

test("同一模型跨网关参数不同：百炼的 kimi-k2.6 用 enable_thinking（Moonshot 直连用 thinking 对象）", () => {
	const r = resolve({
		providerId: "qwen",
		model: "kimi-k2.6",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "enable_thinking", value: false });
});

test("百炼稀宇直供 MiniMax 用 thinking 对象：M3 可关，M3.1-Flash 强制思考", () => {
	const off = resolve({
		providerId: "qwen",
		model: "MiniMax/MiniMax-M3",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const forced = resolve({
		providerId: "qwen",
		model: "MiniMax/MiniMax-M3.1-Flash",
		setting: "off",
	});
	assert.equal(forced.param, null);
	assert.equal(forced.note, "forced");
});

test("百炼仅思考型号（qwen3.8-2.4t-a95b / kimi-k3）：forced；旧命名 qwen-max/turbo/long 无思考开关：none", () => {
	for (const model of ["qwen3.8-2.4t-a95b", "kimi-k3", "deepseek-r1-distill-qwen-32b"]) {
		const r = resolve({ providerId: "qwen", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "forced", model);
	}
	for (const model of ["qwen-max", "qwen-turbo", "qwen-long"]) {
		const r = resolve({ providerId: "qwen", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});

// ===== OpenAI 官方预设（#106）：能力表 openai 行 =====

test("OpenAI 能力表（#106）：强制思考族不发参数（关态发 none 会 400）", () => {
	for (const model of ["gpt-6-astra", "gpt-6.1-sol", "gpt-6.2-astra", "gpt-6.2-sol"]) {
		for (const setting of ["on", "off"] as const) {
			const r = resolve({ providerId: "openai", model, setting });
			assert.equal(r.param, null, `${model} ${setting}`);
			assert.equal(r.note, "forced", `${model} ${setting}`);
		}
	}
});

test("OpenAI 能力表（#106）：可关族关＝reasoning_effort:\"none\"、开＝\"high\"", () => {
	for (const model of [
		"gpt-6.1-terra",
		"gpt-6-sol",
		"gpt-6-luna",
		"gpt-5.2",
		"gpt-5.4-mini",
		"gpt-5.6-terra",
	]) {
		const off = resolve({ providerId: "openai", model, setting: "off" });
		assert.deepEqual(off.param, { name: "reasoning_effort", value: "none" }, model);
		assert.equal(off.note, null, model);
		const on = resolve({ providerId: "openai", model, setting: "on" });
		assert.deepEqual(on.param, { name: "reasoning_effort", value: "high" }, model);
	}
});

test("OpenAI 能力表（#106）：无思考族不发参数、标注 none", () => {
	for (const model of ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]) {
		const r = resolve({ providerId: "openai", model, setting: "on" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});

test("OpenAI 能力表（#106）：未登记族（gpt-5.5 / gpt-6-cyber）为未知——不擅自假定，测试入口可点", () => {
	for (const model of ["gpt-5.5", "gpt-6-cyber"]) {
		const r = resolve({ providerId: "openai", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "unknown", model);
		assert.equal(thinkingDisplay(r).testEntry, "available", model);
	}
});

test("Responses-only 族（#110）：显式「未知」行挡住同族前缀行——不发 Chat 的 reasoning_effort，测试可点", () => {
	for (const model of ["gpt-5.2-pro", "gpt-5.4-pro", "gpt-5.5-pro", "gpt-oss-120b", "gpt-5.6-cyber"]) {
		for (const setting of ["off", "on"] as const) {
			const r = resolve({ providerId: "openai", model, setting });
			assert.equal(r.param, null, `${model} ${setting}：不发任何思考参数`);
			assert.equal(r.note, "unknown", `${model} ${setting}：能力未知，不擅自假定`);
		}
		assert.equal(thinkingDisplay(resolve({ providerId: "openai", model, setting: "off" })).testEntry, "available", model);
	}
	// 同族前缀行的既有行为不变：gpt-5.4 / gpt-5.6-sol 仍是可关族（Chat 协议）。
	assert.equal(resolve({ providerId: "openai", model: "gpt-5.4", setting: "off" }).param?.name, "reasoning_effort");
	assert.equal(resolve({ providerId: "openai", model: "gpt-5.6-sol", setting: "off" }).param?.name, "reasoning_effort");
});

test("OpenAI 能力表（#106）：强制族行排在通用族之前，逐族各归其位（不被前缀行吞掉）", () => {
	assert.equal(resolve({ providerId: "openai", model: "gpt-6.1-sol", setting: "off" }).note, "forced");
	assert.equal(resolve({ providerId: "openai", model: "gpt-6.1-terra", setting: "off" }).param !== null, true);
	assert.deepEqual(thinkingDisplay(resolve({ providerId: "openai", model: "gpt-6.2-astra", setting: "off" })), {
		state: "forced",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "done",
	});
});

// ===== 思考测试纯状态机（#89，缝 1） =====

test("思考测试（#89）：先发基线微型请求（不发思考参数）", () => {
	const started = startDefault();
	assert.deepEqual(started.action, { kind: "probe", param: null }, "第一步是基线微型请求");
});

// ===== 接口方言（#105）：能力表 anthropic 行 + 候选按方言注入 =====

test("Anthropic 能力表（#105）：claude-* 可关可开——关 {type:\"disabled\"}、开 {type:\"adaptive\"}", () => {
	const off = resolve({ providerId: "anthropic", model: "claude-sonnet-4-6", setting: "off" });
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolve({ providerId: "anthropic", model: "claude-opus-4-7", setting: "on" });
	assert.deepEqual(on.param, { name: "thinking", value: { type: "adaptive" } });
});

test("Anthropic 能力表（#105）：表外模型 / 自定义 Anthropic 网关 → 未知（靠思考测试学习）", () => {
	const unknownModel = resolve({ providerId: "anthropic", model: "future-model", setting: "off" });
	assert.equal(unknownModel.note, "unknown");
	assert.equal(unknownModel.param, null);
	const customGateway = resolve({ providerId: "custom_x", model: "claude-sonnet-4-6", setting: "off" });
	assert.equal(customGateway.note, "unknown", "自定义供应商不在表内，不擅自假定");
	assert.equal(customGateway.param, null);
});

test("Anthropic 候选（#105）：单字段 thinking{type:\"disabled\"}，不试 OpenAI 字段", () => {
	assert.deepEqual(ANTHROPIC_THINKING_OFF_CANDIDATES, [
		{ name: "thinking", value: { type: "disabled" } },
	]);
	assert.deepEqual(thinkingOffCandidates("openai"), THINKING_OFF_CANDIDATES, "OpenAI 方言缺省三字段保持现状");
	assert.deepEqual(thinkingOffCandidates("anthropic"), ANTHROPIC_THINKING_OFF_CANDIDATES);
});

test("OpenAI 预设候选（#106）：按供应商 id 收窄为单字段 reasoning_effort:\"none\"", () => {
	assert.deepEqual(OPENAI_THINKING_OFF_CANDIDATES, [{ name: "reasoning_effort", value: "none" }]);
	assert.deepEqual(
		thinkingOffCandidates("openai", "openai"),
		OPENAI_THINKING_OFF_CANDIDATES,
		"内置 OpenAI 预设只探 reasoning_effort"
	);
	assert.deepEqual(
		thinkingOffCandidates("openai", "custom_x"),
		THINKING_OFF_CANDIDATES,
		"自定义供应商即使走 OpenAI 方言也不收窄"
	);
	assert.deepEqual(
		thinkingOffCandidates("anthropic", "anthropic"),
		ANTHROPIC_THINKING_OFF_CANDIDATES,
		"Anthropic 路径不变"
	);
});

test("Responses 候选（#110）：按协议收窄为嵌套 reasoning.effort:\"none\"，不试顶层字段", () => {
	assert.deepEqual(RESPONSES_THINKING_OFF_CANDIDATES, [
		{ name: "reasoning", value: { effort: "none" } },
	]);
	assert.deepEqual(
		thinkingOffCandidates("openai", "openai", "responses"),
		RESPONSES_THINKING_OFF_CANDIDATES,
		"Responses 只探嵌套对象路径"
	);
	assert.deepEqual(
		thinkingOffCandidates("openai", "openai", "chat-completions"),
		OPENAI_THINKING_OFF_CANDIDATES,
		"Chat 协议仍只探顶层 reasoning_effort"
	);
	assert.deepEqual(
		thinkingOffCandidates("openai", "custom_x", "responses"),
		THINKING_OFF_CANDIDATES,
		"协议只在内置 OpenAI 预设上改变候选"
	);
});

test("Anthropic 状态机（#105）：候选注入后语义不变——基线有推理段 → 试 thinking 关字段", () => {
	const start = startThinkingTest(ANTHROPIC_THINKING_OFF_CANDIDATES, ANTHROPIC_SOURCE);
	const step = stepThinkingTest(start.state, "reasoning-present", NOW);
	assert.deepEqual(step.action, {
		kind: "probe",
		param: { name: "thinking", value: { type: "disabled" } },
	});
});

test("Anthropic 状态机（#105）：候选仅一个字段——400（字段不适用）也直接落「未能关闭」，triedFields=1", () => {
	const start = startThinkingTest(ANTHROPIC_THINKING_OFF_CANDIDATES, ANTHROPIC_SOURCE);
	const probe = stepThinkingTest(start.state, "reasoning-present", NOW);
	const { action } = stepThinkingTest(probe.state, "reasoning-absent", NOW);
	assert.equal(action.kind, "conclude");
	assert.equal(action.kind === "conclude" && action.verdict, "switchable");
	assert.deepEqual(action.kind === "conclude" && action.entry?.off, {
		name: "thinking",
		value: { type: "disabled" },
	});
	assert.deepEqual(
		action.kind === "conclude" && action.entry?.source,
		ANTHROPIC_SOURCE,
		"条目出生带本次测试的接口形状（#112）"
	);

	const rejectedStart = startThinkingTest(ANTHROPIC_THINKING_OFF_CANDIDATES, ANTHROPIC_SOURCE);
	const rejectedProbe = stepThinkingTest(rejectedStart.state, "reasoning-present", NOW);
	const rejected = stepThinkingTest(rejectedProbe.state, "rejected", NOW);
	assert.equal(rejected.action.kind === "conclude" && rejected.action.verdict, "not-switchable");
	assert.equal(rejected.action.kind === "conclude" && rejected.action.entry?.triedFields, 1);
});

test("思考测试（#89）：基线未检出推理段 → 「未检出思考」，落习得条目（含时间戳）", () => {
	const { action } = stepThinkingTest(startDefault().state, "reasoning-absent", NOW);
	assert.deepEqual(action, {
		kind: "conclude",
		verdict: "not-detected",
		entry: { verdict: "not-detected", testedAt: TESTED_AT, source: OPENAI_CHAT },
	});
});

test("思考测试（#89）：基线检出推理段 → 进入逐字段，先试 thinking 族关参数（一次只发一个）", () => {
	const { action } = stepThinkingTest(startDefault().state, "reasoning-present", NOW);
	assert.deepEqual(action, {
		kind: "probe",
		param: { name: "thinking", value: { type: "disabled" } },
	});
	assert.deepEqual(
		THINKING_OFF_CANDIDATES,
		[
			{ name: "thinking", value: { type: "disabled" } },
			{ name: "enable_thinking", value: false },
			{ name: "reasoning_effort", value: "none" },
		],
		"固定字段候选按研究笔记参数族有序排列"
	);
});

test("思考测试（#89）：基线 400 无字段可换，不算探测信号，按「中断」处理", () => {
	const { action } = stepThinkingTest(startDefault().state, "rejected", NOW);
	assert.deepEqual(action, { kind: "conclude", verdict: "interrupted", entry: null });
});

test("思考测试（#89）：基线超时/网络错误 → 「中断」，不留结论（可完整重测）", () => {
	const { action } = stepThinkingTest(startDefault().state, "interrupted", NOW);
	assert.deepEqual(action, { kind: "conclude", verdict: "interrupted", entry: null });
});

test("思考测试（#89）：某字段使推理段消失 → 「可关」，习得条目带该关参数（推理段消失是唯一证据）", () => {
	const probe1 = stepThinkingTest(startDefault().state, "reasoning-present", NOW);
	const { action } = stepThinkingTest(probe1.state, "reasoning-absent", NOW);
	assert.deepEqual(action, {
		kind: "conclude",
		verdict: "switchable",
		entry: {
			verdict: "switchable",
			off: { name: "thinking", value: { type: "disabled" } },
			testedAt: TESTED_AT,
			source: OPENAI_CHAT,
		},
	});
});

test("思考测试（#89）：400 视为字段不适用，继续下一个候选（enable_thinking 族）", () => {
	const probe1 = stepThinkingTest(startDefault().state, "reasoning-present", NOW);
	assert.deepEqual(probe1.action, {
		kind: "probe",
		param: { name: "thinking", value: { type: "disabled" } },
	});
	const probe2 = stepThinkingTest(probe1.state, "rejected", NOW);
	assert.deepEqual(probe2.action, {
		kind: "probe",
		param: { name: "enable_thinking", value: false },
	});
});

test("思考测试（#89）：200 但推理段仍在（参数被静默忽略）也换下一个，不认 HTTP 200", () => {
	const probe1 = stepThinkingTest(startDefault().state, "reasoning-present", NOW);
	const probe2 = stepThinkingTest(probe1.state, "reasoning-present", NOW);
	assert.deepEqual(probe2.action, {
		kind: "probe",
		param: { name: "enable_thinking", value: false },
	});
});

test("思考测试（#89）：候选耗尽仍未关掉 → 「未能关闭」（不写「强制思考」），条目带实测字段数", () => {
	const probe1 = stepThinkingTest(startDefault().state, "reasoning-present", NOW);
	const probe2 = stepThinkingTest(probe1.state, "rejected", NOW);
	const probe3 = stepThinkingTest(probe2.state, "reasoning-present", NOW);
	const { action } = stepThinkingTest(probe3.state, "reasoning-present", NOW);
	assert.deepEqual(action, {
		kind: "conclude",
		verdict: "not-switchable",
		entry: { verdict: "not-switchable", triedFields: 3, testedAt: TESTED_AT, source: OPENAI_CHAT },
	});
});

test("思考测试（#89）：逐字段途中中断同样不留结论（可完整重测）", () => {
	const probe1 = stepThinkingTest(startDefault().state, "reasoning-present", NOW);
	const probe2 = stepThinkingTest(probe1.state, "rejected", NOW);
	const { action } = stepThinkingTest(probe2.state, "interrupted", NOW);
	assert.deepEqual(action, { kind: "conclude", verdict: "interrupted", entry: null });
});

test("微型请求错误归类（#89）：测试内 400＝字段不适用（rejected），其余异常一律中断", () => {
	assert.equal(probeOutcomeOfError(400), "rejected");
	for (const status of [200, 401, 403, 429, 500, undefined]) {
		assert.equal(probeOutcomeOfError(status), "interrupted", String(status));
	}
});

// ===== 习得能力解析（#89，缝 1） =====

const LEARNED_SWITCHABLE = {
	verdict: "switchable" as const,
	off: { name: "reasoning_effort", value: "none" },
	testedAt: TESTED_AT,
	source: OPENAI_CHAT,
};

test("习得能力盖过内置能力表（#89）：习得关参数优先于内置 thinking 族", () => {
	const r = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
	});
	assert.deepEqual(r.param, { name: "reasoning_effort", value: "none" }, "习得＞内置");
	assert.deepEqual(r.learned, LEARNED_SWITCHABLE);
});

test("习得·可关（#89）：「开」无开参数则不发（只实测了关）", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "on",
		learned: LEARNED_SWITCHABLE,
	});
	assert.equal(r.param, null);
});

test("习得盖过未知（#89）：自定义供应商模型实测可关后与预设同路（AC7）", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
	});
	assert.deepEqual(r.param, { name: "reasoning_effort", value: "none" });
	assert.equal(r.note, null);
});

test("习得弱结论（#89）：未检出思考 / 未能关闭 不发参数，但条目生效且盖过内置", () => {
	const notSwitchable = { verdict: "not-switchable" as const, triedFields: 3, testedAt: TESTED_AT, source: OPENAI_CHAT };
	const r1 = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: notSwitchable,
	});
	assert.equal(r1.param, null, "习得「未能关闭」盖过内置可关");
	assert.deepEqual(r1.learned, notSwitchable);
	const notDetected = { verdict: "not-detected" as const, testedAt: TESTED_AT, source: OPENAI_CHAT };
	const r2 = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "on",
		learned: notDetected,
	});
	assert.equal(r2.param, null);
	assert.deepEqual(r2.learned, notDetected);
});

test("假关判定（#89）：习得·可关同样受假关监视（设关发参而推理段残留 → 假关）", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
	});
	assert.equal(isThinkingFakeOff(r, true), true);
	assert.equal(isThinkingFakeOff(r, false), false);
});

// ===== 显示矩阵习得档（#89，缝 1） =====

test("显示矩阵（#89）：习得·可关 → 开关激活、徽标实测、转「重新测试」文字入口", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
	});
	assert.deepEqual(thinkingDisplay(r), {
		state: "learned-switchable",
		badge: "learned",
		toggleEnabled: true,
		footnoteWarn: false,
		testEntry: "retest",
	});
});

test("显示矩阵（#89）：习得·未检出思考 → 开关置灰、徽标实测、可重测（措辞不写「无思考」）", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: { verdict: "not-detected", testedAt: TESTED_AT, source: OPENAI_CHAT },
	});
	assert.deepEqual(thinkingDisplay(r), {
		state: "learned-not-detected",
		badge: "learned",
		toggleEnabled: false,
		footnoteWarn: false,
		testEntry: "retest",
	});
});

test("显示矩阵（#89）：习得·未能关闭 → 开关置灰、徽标警示、备注警示、可重测（措辞不写「强制思考」）", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: { verdict: "not-switchable", triedFields: 3, testedAt: TESTED_AT, source: OPENAI_CHAT },
	});
	assert.deepEqual(thinkingDisplay(r), {
		state: "learned-not-switchable",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "retest",
	});
});

// ===== 习得来源（#112，ADR-0033） =====

test("learnedSourceOf（#112）：Anthropic 丢掉协议；OpenAI 缺省 Chat Completions", () => {
	assert.deepEqual(learnedSourceOf("anthropic", "responses"), ANTHROPIC_SOURCE);
	assert.deepEqual(learnedSourceOf("openai", "responses"), OPENAI_RESPONSES);
	assert.deepEqual(learnedSourceOf("openai"), OPENAI_CHAT);
	assert.deepEqual(learnedSourceOf(undefined, undefined), OPENAI_CHAT, "方言缺省＝OpenAI");
});

test("来源相符才生效（#112）：方言 / 协议都对上时习得条目照旧盖过内置", () => {
	const r = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
		source: OPENAI_CHAT,
	});
	assert.deepEqual(r.param, { name: "reasoning_effort", value: "none" });
	assert.deepEqual(r.learned, LEARNED_SWITCHABLE);
	assert.equal(r.staleLearned, null);
});

test("方言不符（#112）：条目保留为过期，不发参数、不回落内置能力表", () => {
	const r = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
		source: ANTHROPIC_SOURCE,
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "unknown", "不回落内置可关");
	assert.equal(r.learned, null);
	assert.deepEqual(r.staleLearned, LEARNED_SWITCHABLE, "原条目经 staleLearned 带出");
});

test("协议不符（#112）：Chat 下学到的结论不发给 Responses 报文", () => {
	const r = resolve({
		providerId: "openai",
		model: "gpt-5.5-pro",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
		source: OPENAI_RESPONSES,
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "unknown");
	assert.deepEqual(r.staleLearned, LEARNED_SWITCHABLE);
});

test("缺来源 / 来源不可解析（#112）：存量条目原样保留为过期，不伪造来源", () => {
	const legacy = {
		verdict: "switchable" as const,
		off: { name: "thinking", value: { type: "disabled" } },
		testedAt: TESTED_AT,
	};
	const legacyR = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: legacy,
	});
	assert.equal(legacyR.param, null);
	assert.deepEqual(legacyR.staleLearned, legacy, "条目原样带出（无 source 字段）");

	const unreadable = { ...LEARNED_SWITCHABLE, source: { apiStyle: "bogus" } as unknown as LearnedSource };
	const unreadableR = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: unreadable,
	});
	assert.equal(unreadableR.param, null);
	assert.deepEqual(unreadableR.staleLearned, unreadable, "不可读来源不作缺省补章");

	const missingProtocol = {
		...LEARNED_SWITCHABLE,
		source: { apiStyle: "openai" } as unknown as LearnedSource,
	};
	const missingProtocolR = resolve({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: missingProtocol,
	});
	assert.equal(missingProtocolR.param, null);
	assert.deepEqual(missingProtocolR.staleLearned, missingProtocol, "存档缺 protocol 同样按来源不明");
});

test("过期呈现（#112）：琥珀徽标沿用「实测 {{date}}」、脚注过期、重测入口可点、开关置灰", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
		source: ANTHROPIC_SOURCE,
	});
	assert.deepEqual(thinkingDisplay(r), {
		state: "learned-stale",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "retest",
	});
	assert.equal(isThinkingFakeOff(r, true), false, "没发参数就不判假关");
});

test("过期条目的「开」同样不发参数（#112）", () => {
	const r = resolve({
		providerId: "custom_x",
		model: "m",
		setting: "on",
		learned: LEARNED_SWITCHABLE,
		source: ANTHROPIC_SOURCE,
	});
	assert.equal(r.param, null);
	assert.deepEqual(r.staleLearned, LEARNED_SWITCHABLE);
});

