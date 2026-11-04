import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isThinkingFakeOff,
	normalizeThinkingSetting,
	probeOutcomeOfError,
	resolveThinking,
	startThinkingTest,
	stepThinkingTest,
	thinkingDisplay,
	THINKING_CAPABILITIES,
	THINKING_OFF_CANDIDATES,
} from "../src/core/thinking";

/** 思考测试状态机测试的固定时钟（习得条目时间戳断言用）。 */
const NOW = () => "2026-11-04T08:00:00.000Z";
const TESTED_AT = "2026-11-04T08:00:00.000Z";

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
	const r = resolveThinking({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "thinking", value: { type: "disabled" } });
	assert.equal(r.note, null);
});

test("「开」发开参数：thinking:{type:enabled}", () => {
	const r = resolveThinking({
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
		const r = resolveThinking({ providerId: "p", model: "m", setting }, table);
		if (setting === "on") {
			assert.equal(r.param, null, "无开参数：「开」不发");
		} else {
			assert.deepEqual(r.param, { name: "enable_thinking", value: false }, "「关」发关参数");
		}
		assert.equal(r.note, null);
	}
});

test("DashScope：qwen3.8 关参数是 enable_thinking:false（参数名逐供应商不同）", () => {
	const r = resolveThinking({
		providerId: "qwen",
		model: "qwen3.8-max",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "enable_thinking", value: false });
});

test("强制思考模型（Kimi K3）：不发参数，标注 forced（强行关会硬失败）", () => {
	const r = resolveThinking({
		providerId: "kimi",
		model: "kimi-k3",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "forced");
});

test("强制思考模型（MiniMax M3.1-Flash）：不发参数，标注 forced（关参数会 400）", () => {
	const r = resolveThinking({
		providerId: "minimax",
		model: "MiniMax-M3.1-Flash",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "forced");
});

test("强制思考模型（GLM-5.3 全系）：不发参数，标注 forced", () => {
	for (const model of ["glm-5.3", "glm-5.3-flash", "glm-5.3-flashx-legal"]) {
		const r = resolveThinking({
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
		const r = resolveThinking({ providerId, model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});

test("MiniMax M3 可关：关=thinking:{type:disabled}，开=thinking:{type:adaptive}（开≠关的简单取反）", () => {
	const off = resolveThinking({
		providerId: "minimax",
		model: "MiniMax-M3",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolveThinking({
		providerId: "minimax",
		model: "MiniMax-M3",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "adaptive" } });
});

test("Kimi K2.6 可关：thinking:{type:disabled}；「开」显式发 enabled", () => {
	const off = resolveThinking({
		providerId: "kimi",
		model: "kimi-k2.6",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolveThinking({
		providerId: "kimi",
		model: "kimi-k2.6",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "enabled" } });
});

test("能力表未知模型：不发参数，标注 unknown（对未知模型降级）", () => {
	const r = resolveThinking({
		providerId: "kimi",
		model: "some-future-model",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "unknown");
});

test("智谱 GLM 可关档（glm-5.2 / 4.7 族）：thinking:{type:disabled|enabled}", () => {
	const off = resolveThinking({
		providerId: "zhipu",
		model: "glm-5.2",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolveThinking({
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
			const r = resolveThinking({ providerId: row.providerId, model, setting });
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
		const r = resolveThinking({
			providerId: "custom_x",
			model: "my-model",
			setting,
		});
		assert.equal(r.param, null, setting);
		assert.equal(r.note, "unknown", setting);
	}
});

test("显示矩阵（#88）：内置·可关 → 开关激活、徽标内置能力表、测试入口置灰", () => {
	const r = resolveThinking({ providerId: "deepseek", model: "deepseek-v4-pro", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "builtin",
		badge: "builtin",
		toggleEnabled: true,
		footnoteWarn: false,
		testEntry: "done",
	});
});

test("显示矩阵（#88）：强制思考 → 开关置灰、徽标警示、备注警示、无需测试", () => {
	const r = resolveThinking({ providerId: "kimi", model: "kimi-k3", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "forced",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "done",
	});
});

test("显示矩阵（#88）：无思考 → 开关置灰、徽标未知、备注不警示、无需测试", () => {
	const r = resolveThinking({ providerId: "kimi", model: "moonshot-v1-8k", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "none",
		badge: "unknown",
		toggleEnabled: false,
		footnoteWarn: false,
		testEntry: "done",
	});
});

test("显示矩阵（#88）：未知 → 开关置灰、徽标未知、备注警示、测试入口留位", () => {
	const r = resolveThinking({ providerId: "kimi", model: "some-future-model", setting: "off" });
	assert.deepEqual(thinkingDisplay(r), {
		state: "unknown",
		badge: "unknown",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "available",
	});
});

test("假关判定：设关且发出关参数、响应仍带推理段 → 假关", () => {
	const r = resolveThinking({
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
		const r = resolveThinking({ providerId, model, setting: "off" });
		assert.equal(isThinkingFakeOff(r, true), false, model);
	}
});

test("假关判定：「开」不判假关", () => {
	const r = resolveThinking({ providerId: "deepseek", model: "m", setting: "on" });
	assert.equal(isThinkingFakeOff(r, true), false);
});

test("同一模型跨网关参数不同：百炼的 kimi-k2.6 用 enable_thinking（Moonshot 直连用 thinking 对象）", () => {
	const r = resolveThinking({
		providerId: "qwen",
		model: "kimi-k2.6",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "enable_thinking", value: false });
});

test("百炼稀宇直供 MiniMax 用 thinking 对象：M3 可关，M3.1-Flash 强制思考", () => {
	const off = resolveThinking({
		providerId: "qwen",
		model: "MiniMax/MiniMax-M3",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const forced = resolveThinking({
		providerId: "qwen",
		model: "MiniMax/MiniMax-M3.1-Flash",
		setting: "off",
	});
	assert.equal(forced.param, null);
	assert.equal(forced.note, "forced");
});

test("百炼仅思考型号（qwen3.8-2.4t-a95b / kimi-k3）：forced；旧命名 qwen-max/turbo/long 无思考开关：none", () => {
	for (const model of ["qwen3.8-2.4t-a95b", "kimi-k3", "deepseek-r1-distill-qwen-32b"]) {
		const r = resolveThinking({ providerId: "qwen", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "forced", model);
	}
	for (const model of ["qwen-max", "qwen-turbo", "qwen-long"]) {
		const r = resolveThinking({ providerId: "qwen", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});

// ===== 思考测试纯状态机（#89，缝 1） =====

test("思考测试（#89）：先发基线微型请求（不发思考参数）", () => {
	const started = startThinkingTest();
	assert.deepEqual(started.action, { kind: "probe", param: null }, "第一步是基线微型请求");
});

test("思考测试（#89）：基线未检出推理段 → 「未检出思考」，落习得条目（含时间戳）", () => {
	const { action } = stepThinkingTest(startThinkingTest().state, "reasoning-absent", NOW);
	assert.deepEqual(action, {
		kind: "conclude",
		verdict: "not-detected",
		entry: { verdict: "not-detected", testedAt: TESTED_AT },
	});
});

test("思考测试（#89）：基线检出推理段 → 进入逐字段，先试 thinking 族关参数（一次只发一个）", () => {
	const { action } = stepThinkingTest(startThinkingTest().state, "reasoning-present", NOW);
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
	const { action } = stepThinkingTest(startThinkingTest().state, "rejected", NOW);
	assert.deepEqual(action, { kind: "conclude", verdict: "interrupted", entry: null });
});

test("思考测试（#89）：基线超时/网络错误 → 「中断」，不留结论（可完整重测）", () => {
	const { action } = stepThinkingTest(startThinkingTest().state, "interrupted", NOW);
	assert.deepEqual(action, { kind: "conclude", verdict: "interrupted", entry: null });
});

test("思考测试（#89）：某字段使推理段消失 → 「可关」，习得条目带该关参数（推理段消失是唯一证据）", () => {
	const probe1 = stepThinkingTest(startThinkingTest().state, "reasoning-present", NOW);
	const { action } = stepThinkingTest(probe1.state, "reasoning-absent", NOW);
	assert.deepEqual(action, {
		kind: "conclude",
		verdict: "switchable",
		entry: {
			verdict: "switchable",
			off: { name: "thinking", value: { type: "disabled" } },
			testedAt: TESTED_AT,
		},
	});
});

test("思考测试（#89）：400 视为字段不适用，继续下一个候选（enable_thinking 族）", () => {
	const probe1 = stepThinkingTest(startThinkingTest().state, "reasoning-present", NOW);
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
	const probe1 = stepThinkingTest(startThinkingTest().state, "reasoning-present", NOW);
	const probe2 = stepThinkingTest(probe1.state, "reasoning-present", NOW);
	assert.deepEqual(probe2.action, {
		kind: "probe",
		param: { name: "enable_thinking", value: false },
	});
});

test("思考测试（#89）：候选耗尽仍未关掉 → 「未能关闭」（不写「强制思考」），条目带实测字段数", () => {
	const probe1 = stepThinkingTest(startThinkingTest().state, "reasoning-present", NOW);
	const probe2 = stepThinkingTest(probe1.state, "rejected", NOW);
	const probe3 = stepThinkingTest(probe2.state, "reasoning-present", NOW);
	const { action } = stepThinkingTest(probe3.state, "reasoning-present", NOW);
	assert.deepEqual(action, {
		kind: "conclude",
		verdict: "not-switchable",
		entry: { verdict: "not-switchable", triedFields: 3, testedAt: TESTED_AT },
	});
});

test("思考测试（#89）：逐字段途中中断同样不留结论（可完整重测）", () => {
	const probe1 = stepThinkingTest(startThinkingTest().state, "reasoning-present", NOW);
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
};

test("习得能力盖过内置能力表（#89）：习得关参数优先于内置 thinking 族", () => {
	const r = resolveThinking({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
	});
	assert.deepEqual(r.param, { name: "reasoning_effort", value: "none" }, "习得＞内置");
	assert.deepEqual(r.learned, LEARNED_SWITCHABLE);
});

test("习得·可关（#89）：「开」无开参数则不发（只实测了关）", () => {
	const r = resolveThinking({
		providerId: "custom_x",
		model: "m",
		setting: "on",
		learned: LEARNED_SWITCHABLE,
	});
	assert.equal(r.param, null);
});

test("习得盖过未知（#89）：自定义供应商模型实测可关后与预设同路（AC7）", () => {
	const r = resolveThinking({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: LEARNED_SWITCHABLE,
	});
	assert.deepEqual(r.param, { name: "reasoning_effort", value: "none" });
	assert.equal(r.note, null);
});

test("习得弱结论（#89）：未检出思考 / 未能关闭 不发参数，但条目生效且盖过内置", () => {
	const notSwitchable = { verdict: "not-switchable" as const, triedFields: 3, testedAt: TESTED_AT };
	const r1 = resolveThinking({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
		learned: notSwitchable,
	});
	assert.equal(r1.param, null, "习得「未能关闭」盖过内置可关");
	assert.deepEqual(r1.learned, notSwitchable);
	const notDetected = { verdict: "not-detected" as const, testedAt: TESTED_AT };
	const r2 = resolveThinking({
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "on",
		learned: notDetected,
	});
	assert.equal(r2.param, null);
	assert.deepEqual(r2.learned, notDetected);
});

test("假关判定（#89）：习得·可关同样受假关监视（设关发参而推理段残留 → 假关）", () => {
	const r = resolveThinking({
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
	const r = resolveThinking({
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
	const r = resolveThinking({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: { verdict: "not-detected", testedAt: TESTED_AT },
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
	const r = resolveThinking({
		providerId: "custom_x",
		model: "m",
		setting: "off",
		learned: { verdict: "not-switchable", triedFields: 3, testedAt: TESTED_AT },
	});
	assert.deepEqual(thinkingDisplay(r), {
		state: "learned-not-switchable",
		badge: "warn",
		toggleEnabled: false,
		footnoteWarn: true,
		testEntry: "retest",
	});
});
