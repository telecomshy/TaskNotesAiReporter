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
	resolveRequestPolicy,
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

// ===== 温度判定矩阵 / 额度与超时的取值规则 =====
// 已随请求装配搬到 test/modelRequest.test.ts（#111，ADR-0032：策略算术的实现与测试同迁，不留双份）。

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

test("清单过滤：Responses-only 对话族自 #110 放回；gpt-rosalind-research 与 chat-latest 仍剔除", () => {
	const ids = [
		"gpt-4.1",
		"gpt-4o",
		"gpt-7-future",
		"gpt-5.5-pro",
		"gpt-oss-120b",
		"gpt-5.6-cyber",
		"gpt-rosalind-research",
		"chat-latest",
		"gpt-6.1-terra",
	];
	assert.deepEqual(filterModelCatalog("openai", ids), [
		"gpt-4.1",
		"gpt-4o",
		"gpt-7-future",
		"gpt-5.5-pro",
		"gpt-oss-120b",
		"gpt-5.6-cyber",
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

test("单模型判定：排除优先于 gpt-* 粗白名单（Responses-only 对话族已放回）", () => {
	assert.equal(isOpenAIChatModel("gpt-6.2-astra"), true);
	assert.equal(isOpenAIChatModel("gpt-image-2.6-sunburst"), false, "gpt- 开头但属图像族");
	assert.equal(isOpenAIChatModel("gpt-5.5-pro"), true, "仅 Responses 的对话模型自 #110 放回");
	assert.equal(isOpenAIChatModel("gpt-oss-120b"), true);
	assert.equal(isOpenAIChatModel("gpt-5.6-cyber"), true);
	assert.equal(isOpenAIChatModel("gpt-rosalind-research"), false, "端点无官方依据");
	assert.equal(isOpenAIChatModel("chat-latest"), false, "官方不建议 API 使用");
});
