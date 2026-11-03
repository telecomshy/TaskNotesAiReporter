import { test } from "node:test";
import assert from "node:assert/strict";
import { isThinkingFakeOff, resolveThinking, THINKING_CAPABILITIES } from "../src/core/thinking";

test("「关」产出关参数：DeepSeek 发 thinking:{type:disabled}，单键", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "thinking", value: { type: "disabled" } });
	assert.equal(r.note, null);
});

test("「自动」不发任何参数（保持服务端默认）", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "auto",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, null);
});

test("「开」发开参数：thinking:{type:enabled}", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "deepseek",
		model: "deepseek-v4-pro",
		setting: "on",
	});
	assert.deepEqual(r.param, { name: "thinking", value: { type: "enabled" } });
});

test("DashScope：qwen3.8 关参数是 enable_thinking:false（参数名逐供应商不同）", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "qwen",
		model: "qwen3.8-max",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "enable_thinking", value: false });
});

test("强制思考模型（Kimi K3）：不发参数，标注 forced（强行关会硬失败）", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "kimi",
		model: "kimi-k3",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "forced");
});

test("强制思考模型（MiniMax M3.1-Flash）：不发参数，标注 forced（关参数会 400）", () => {
	const r = resolveThinking({
		providerType: "preset",
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
			providerType: "preset",
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
		const r = resolveThinking({ providerType: "preset", providerId, model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});

test("MiniMax M3 可关：关=thinking:{type:disabled}，开=thinking:{type:adaptive}（开≠关的简单取反）", () => {
	const off = resolveThinking({
		providerType: "preset",
		providerId: "minimax",
		model: "MiniMax-M3",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolveThinking({
		providerType: "preset",
		providerId: "minimax",
		model: "MiniMax-M3",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "adaptive" } });
});

test("Kimi K2.6 可关：thinking:{type:disabled}；「开」显式发 enabled", () => {
	const off = resolveThinking({
		providerType: "preset",
		providerId: "kimi",
		model: "kimi-k2.6",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolveThinking({
		providerType: "preset",
		providerId: "kimi",
		model: "kimi-k2.6",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "enabled" } });
});

test("能力表未知模型：不发参数，标注 unknown（对未知模型降级）", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "kimi",
		model: "some-future-model",
		setting: "off",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, "unknown");
});

test("智谱 GLM 可关档（glm-5.2 / 4.7 族）：thinking:{type:disabled|enabled}", () => {
	const off = resolveThinking({
		providerType: "preset",
		providerId: "zhipu",
		model: "glm-5.2",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const on = resolveThinking({
		providerType: "preset",
		providerId: "zhipu",
		model: "glm-4.7-flash",
		setting: "on",
	});
	assert.deepEqual(on.param, { name: "thinking", value: { type: "enabled" } });
});

test("一次请求只发一个开关参数：全表 × 全三态解析，非空参数并入请求体恰好占一个键", () => {
	for (const row of THINKING_CAPABILITIES) {
		const model = row.modelPattern.endsWith("*")
			? `${row.modelPattern.slice(0, -1)}sample`
			: row.modelPattern;
		for (const setting of ["auto", "on", "off"] as const) {
			const label = `${row.providerId} ${row.modelPattern} ${setting}`;
			const r = resolveThinking({ providerType: "preset", providerId: row.providerId, model, setting });
			if (r.param === null) continue;
			// 与 client.chatCompletion 同款合成：参数并入请求体顶层后恰好多一个键（互斥参数不同时发）
			const body: Record<string, unknown> = { model };
			body[r.param.name] = r.param.value;
			assert.equal(Object.keys(body).length, 2, label);
		}
	}
});

test("自定义供应商：思考参数名发布尔参数（关=false / 开=true），自动不发", () => {
	const input = {
		providerType: "custom" as const,
		providerId: "custom_x",
		model: "my-model",
		customParamName: "enable_thinking",
	};
	assert.deepEqual(resolveThinking({ ...input, setting: "off" }).param, {
		name: "enable_thinking",
		value: false,
	});
	assert.deepEqual(resolveThinking({ ...input, setting: "on" }).param, {
		name: "enable_thinking",
		value: true,
	});
	assert.equal(resolveThinking({ ...input, setting: "auto" }).param, null);
});

test("自定义供应商思考参数名留空：不发参数（不猜参数名）", () => {
	const r = resolveThinking({
		providerType: "custom",
		providerId: "custom_x",
		model: "my-model",
		setting: "off",
		customParamName: "  ",
	});
	assert.equal(r.param, null);
	assert.equal(r.note, null);
});

test("假关判定：设关且发出关参数、响应仍带推理段 → 假关", () => {
	const r = resolveThinking({
		providerType: "preset",
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
		const r = resolveThinking({ providerType: "preset", providerId, model, setting: "off" });
		assert.equal(isThinkingFakeOff(r, true), false, model);
	}
});

test("假关判定：自动/开档不判假关", () => {
	for (const setting of ["auto", "on"] as const) {
		const r = resolveThinking({ providerType: "preset", providerId: "deepseek", model: "m", setting });
		assert.equal(isThinkingFakeOff(r, true), false, setting);
	}
});

test("同一模型跨网关参数不同：百炼的 kimi-k2.6 用 enable_thinking（Moonshot 直连用 thinking 对象）", () => {
	const r = resolveThinking({
		providerType: "preset",
		providerId: "qwen",
		model: "kimi-k2.6",
		setting: "off",
	});
	assert.deepEqual(r.param, { name: "enable_thinking", value: false });
});

test("百炼稀宇直供 MiniMax 用 thinking 对象：M3 可关，M3.1-Flash 强制思考", () => {
	const off = resolveThinking({
		providerType: "preset",
		providerId: "qwen",
		model: "MiniMax/MiniMax-M3",
		setting: "off",
	});
	assert.deepEqual(off.param, { name: "thinking", value: { type: "disabled" } });
	const forced = resolveThinking({
		providerType: "preset",
		providerId: "qwen",
		model: "MiniMax/MiniMax-M3.1-Flash",
		setting: "off",
	});
	assert.equal(forced.param, null);
	assert.equal(forced.note, "forced");
});

test("百炼仅思考型号（qwen3.8-2.4t-a95b / kimi-k3）：forced；旧命名 qwen-max/turbo/long 无思考开关：none", () => {
	for (const model of ["qwen3.8-2.4t-a95b", "kimi-k3", "deepseek-r1-distill-qwen-32b"]) {
		const r = resolveThinking({ providerType: "preset", providerId: "qwen", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "forced", model);
	}
	for (const model of ["qwen-max", "qwen-turbo", "qwen-long"]) {
		const r = resolveThinking({ providerType: "preset", providerId: "qwen", model, setting: "off" });
		assert.equal(r.param, null, model);
		assert.equal(r.note, "none", model);
	}
});
