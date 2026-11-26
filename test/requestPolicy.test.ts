/**
 * 「模型请求策略」与 OpenAI 预设定清单过滤（#106，ADR-0030）。
 *
 * 纯函数缝：策略表首个命中 / 前缀匹配 / 两套缺省；温度判定矩阵（策略 × 生效 effort）；
 * 过滤表的粗白名单 / 排除优先 / 顺序保留 / 其它供应商零变更。
 * 事实锚点：docs/research/openai-official-preset.md。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	EMPTY_REQUEST_POLICY,
	OPENAI_REQUEST_POLICY,
	effectiveMaxTokens,
	effectiveTimeoutSeconds,
	resolveRequestPolicy,
	shouldSendTemperature,
} from "../src/core/requestPolicy";
import { filterModelCatalog, isOpenAIChatModel } from "../src/core/modelCatalogFilter";

// ===== 策略表 =====

test("策略表：GPT-6.2 / GPT-6 Astra / GPT-6.1 Sol 恒不发温度（omit-always）", () => {
	for (const model of ["gpt-6.2-astra", "gpt-6.2-sol", "gpt-6-astra", "gpt-6.1-sol"]) {
		const policy = resolveRequestPolicy("openai", model);
		assert.equal(policy.temperature, "omit-always", model);
		assert.equal(policy.outputField, "max_completion_tokens", model);
		assert.equal(policy.minMaxTokens, 25000, model);
		assert.equal(policy.minTimeoutSeconds, 120, model);
	}
});

test("策略表：老的非推理对话模型温度照发、预算无下限（超时下限仍 120）", () => {
	for (const model of ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"]) {
		const policy = resolveRequestPolicy("openai", model);
		assert.equal(policy.temperature, "send", model);
		assert.equal(policy.outputField, "max_completion_tokens", model);
		assert.equal(policy.minMaxTokens, 0, model);
		assert.equal(policy.minTimeoutSeconds, 120, model);
	}
});

test("策略表：未登记的 OpenAI 模型回落预设缺省（max_completion_tokens + omit-unless-none + 25k + 120）", () => {
	for (const model of ["gpt-5.2", "gpt-5.4-mini", "gpt-5.6-sol", "gpt-5.5", "gpt-6-cyber", "gpt-7-future"]) {
		const policy = resolveRequestPolicy("openai", model);
		assert.deepEqual(policy, OPENAI_REQUEST_POLICY, model);
	}
});

test("策略表：其它供应商（四家国产预设与自定义）回落空策略（max_tokens + send + 无下限）", () => {
	for (const providerId of ["deepseek", "qwen", "kimi", "minimax", "anthropic", "custom_x"]) {
		assert.deepEqual(resolveRequestPolicy(providerId, "gpt-6.2-astra"), EMPTY_REQUEST_POLICY, providerId);
		assert.deepEqual(resolveRequestPolicy(providerId, "m"), EMPTY_REQUEST_POLICY, providerId);
	}
});

test("策略表：首个命中行生效、只按供应商 id 命中（不按模型名跨供应商串门）", () => {
	const table = [
		{ providerId: "openai", modelPattern: "gpt-6.2*", policy: { ...OPENAI_REQUEST_POLICY, temperature: "omit-always" as const } },
		{ providerId: "openai", modelPattern: "gpt-*", policy: { ...OPENAI_REQUEST_POLICY, temperature: "send" as const } },
	];
	assert.equal(resolveRequestPolicy("openai", "gpt-6.2-astra", table).temperature, "omit-always");
	assert.equal(resolveRequestPolicy("openai", "gpt-5.2", table).temperature, "send");
	// 本表没有 openai 缺省以外的行；供应商不匹配时走该供应商的空策略
	assert.deepEqual(resolveRequestPolicy("custom_x", "gpt-6.2-astra", table), EMPTY_REQUEST_POLICY);
});

// ===== 温度判定矩阵 =====

test("温度判定：send 恒发（含任何思考参数与无参数）", () => {
	const policy = { ...EMPTY_REQUEST_POLICY, temperature: "send" as const };
	assert.equal(shouldSendTemperature(policy, undefined), true);
	assert.equal(shouldSendTemperature(policy, { name: "reasoning_effort", value: "none" }), true);
	assert.equal(shouldSendTemperature(policy, { name: "reasoning_effort", value: "high" }), true);
});

test("温度判定：omit-always 永不发（含生效 effort 为 none）", () => {
	const policy = { ...OPENAI_REQUEST_POLICY, temperature: "omit-always" as const };
	assert.equal(shouldSendTemperature(policy, undefined), false);
	assert.equal(shouldSendTemperature(policy, { name: "reasoning_effort", value: "none" }), false);
	assert.equal(shouldSendTemperature(policy, { name: "reasoning_effort", value: "high" }), false);
});

test("温度判定：omit-unless-none 仅在生效 effort 为 none 时发（开＝high 不给，关＝none 才给）", () => {
	const policy = OPENAI_REQUEST_POLICY;
	assert.equal(shouldSendTemperature(policy, { name: "reasoning_effort", value: "none" }), true, "关：none 合法");
	assert.equal(shouldSendTemperature(policy, { name: "reasoning_effort", value: "high" }), false, "开：high 不合法");
	assert.equal(shouldSendTemperature(policy, undefined), false, "强制 / 无思考 / 未知：默认 medium，不合法");
	assert.equal(shouldSendTemperature(policy, { name: "thinking", value: { type: "disabled" } }), false, "别的字段不等于 effort=none");
});

// ===== 预算与超时的取值规则（两者都取 max，双向都要断言） =====

test("预算：取下限与配置中的较大者，双向都成立；仍钳制 384K，非法配置回落 8192", () => {
	assert.equal(effectiveMaxTokens(OPENAI_REQUEST_POLICY, 8192), 25000, "配置更小 → 下限生效");
	assert.equal(effectiveMaxTokens(OPENAI_REQUEST_POLICY, 30000), 30000, "用户配置更大 → 用户优先");
	assert.equal(effectiveMaxTokens(OPENAI_REQUEST_POLICY, 400000), 384 * 1024, "钳制上限仍 384K");
	assert.equal(effectiveMaxTokens(EMPTY_REQUEST_POLICY, 8192), 8192, "无下限 → 原值");
	assert.equal(effectiveMaxTokens(OPENAI_REQUEST_POLICY, 0), 25000, "非法配置按缺省 8192 再抬到下限");
	assert.equal(effectiveMaxTokens(OPENAI_REQUEST_POLICY, Number.NaN), 25000);
});

test("超时：取全局与下限中的较大者，双向都成立", () => {
	assert.equal(effectiveTimeoutSeconds(OPENAI_REQUEST_POLICY, 30), 120, "全局更小 → 下限生效");
	assert.equal(effectiveTimeoutSeconds(OPENAI_REQUEST_POLICY, 300), 300, "用户全局更大 → 用户优先");
	assert.equal(effectiveTimeoutSeconds(EMPTY_REQUEST_POLICY, 30), 30, "无下限 → 原值");
});

// ===== OpenAI 清单过滤 =====

test("清单过滤：只收对话模型，嵌入 / 图像 / 语音 / 实时 / 审核全部剔除", () => {
	const ids = [
		"gpt-6.2-astra",
		"text-embedding-3-large",
		"gpt-image-2.6-sunburst",
		"gpt-realtime-2.1",
		"gpt-live-1.1",
		"gpt-audio-1.5",
		"gpt-transcribe",
		"gpt-4o-transcribe",
		"gpt-4o-mini-tts",
		"tts-1",
		"whisper-1",
		"omni-moderation-latest",
		"sora-2",
	];
	assert.deepEqual(filterModelCatalog("openai", ids), ["gpt-6.2-astra"]);
});

test("清单过滤：保留老的非推理对话模型与未来新族，仅 Responses 族与 chat-latest 剔除", () => {
	const ids = [
		"gpt-4.1",
		"gpt-4o",
		"gpt-7-future",
		"gpt-5.5-pro",
		"gpt-oss-120b",
		"gpt-5.6-cyber",
		"chat-latest",
		"gpt-6.1-terra",
	];
	assert.deepEqual(filterModelCatalog("openai", ids), [
		"gpt-4.1",
		"gpt-4o",
		"gpt-7-future",
		"gpt-6.1-terra",
	]);
});

test("清单过滤：顺序原样保留、空清单保持为空", () => {
	assert.deepEqual(filterModelCatalog("openai", ["gpt-6.2-sol", "gpt-4.1", "gpt-6.2-astra"]), [
		"gpt-6.2-sol",
		"gpt-4.1",
		"gpt-6.2-astra",
	]);
	assert.deepEqual(filterModelCatalog("openai", []), []);
});

test("清单过滤：其它供应商零变更（不按模型名过滤）", () => {
	const ids = ["text-embedding-3-large", "gpt-6.2-astra", "deepseek-v4-flash"];
	assert.deepEqual(filterModelCatalog("deepseek", ids), ids);
	assert.deepEqual(filterModelCatalog("custom_x", ids), ids);
});

test("单模型判定：排除优先于 gpt-* 粗白名单", () => {
	assert.equal(isOpenAIChatModel("gpt-6.2-astra"), true);
	assert.equal(isOpenAIChatModel("gpt-image-2.6-sunburst"), false, "gpt- 开头但属图像族");
	assert.equal(isOpenAIChatModel("gpt-5.5-pro"), false, "仅 Responses");
	assert.equal(isOpenAIChatModel("gpt-oss-120b"), false);
	assert.equal(isOpenAIChatModel("gpt-5.6-cyber"), false);
	assert.equal(isOpenAIChatModel("chat-latest"), false, "白名单之外");
});
