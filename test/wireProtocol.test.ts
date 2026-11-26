/**
 * 「接口协议」解析（#110，ADR-0031）。
 *
 * 纯函数缝：表按（供应商, 模型）首个命中、`*-pro` 后缀匹配、缺省 Chat Completions、
 * 其它供应商零命中；读取侧缺省与模型匹配的后缀分支。
 * 事实锚点：docs/research/responses-api.md。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_WIRE_PROTOCOL,
	WIRE_PROTOCOLS,
	protocolOf,
	resolveWireProtocol,
} from "../src/core/wireProtocol";
import { matchModelPattern } from "../src/core/thinking";

test("协议表：只有 Chat Completions 不可用的模型走 Responses（*-pro / gpt-oss-* / gpt-5.6-cyber）", () => {
	for (const model of [
		"gpt-5.5-pro",
		"gpt-5.4-pro",
		"gpt-5.2-pro",
		// 后缀匹配覆盖未来 pro 族：不必每上新一版就补一行。
		"gpt-6.5-pro",
		"gpt-oss-120b",
		"gpt-oss-20b",
		"gpt-5.6-cyber",
	]) {
		assert.equal(resolveWireProtocol("openai", model), "responses", model);
	}
});

test("协议表：Chat Completions 可用的模型保持 chat-completions（不因官方性能偏好切换）", () => {
	for (const model of [
		"gpt-6.2-astra",
		"gpt-6.2-sol",
		"gpt-6.1-terra",
		"gpt-5.6-sol",
		"gpt-5.4",
		"gpt-4.1",
		"gpt-4o",
		"gpt-7-future",
		// 后缀分支只认结尾的 `-pro`，前缀 `pro-` 不误命中。
		"pro-preview",
	]) {
		assert.equal(resolveWireProtocol("openai", model), DEFAULT_WIRE_PROTOCOL, model);
	}
});

test("协议表：其它供应商零命中（不按模型名嗅探官方端点）", () => {
	for (const providerId of ["deepseek", "qwen", "kimi", "minimax", "anthropic", "custom_x"]) {
		for (const model of ["gpt-5.5-pro", "gpt-oss-120b", "m"]) {
			assert.equal(resolveWireProtocol(providerId, model), "chat-completions", `${providerId}/${model}`);
		}
	}
});

test("协议表：首个命中行生效（表顺序由测试显式构造）", () => {
	const table = [
		{ providerId: "openai", modelPattern: "gpt-5.5-pro", protocol: "chat-completions" as const },
		{ providerId: "openai", modelPattern: "*-pro", protocol: "responses" as const },
	];
	assert.equal(resolveWireProtocol("openai", "gpt-5.5-pro", table), "chat-completions");
	assert.equal(resolveWireProtocol("openai", "gpt-6.5-pro", table), "responses");
});

test("协议表：内置表的行都只对 openai 开（防止误开其它供应商）", () => {
	for (const row of WIRE_PROTOCOLS) {
		assert.equal(row.providerId, "openai", row.modelPattern);
		assert.equal(row.protocol, "responses", row.modelPattern);
	}
});

test("读取侧缺省：未带 protocol / 显式 undefined 都读作 chat-completions", () => {
	assert.equal(protocolOf({}), "chat-completions");
	assert.equal(protocolOf({ protocol: undefined }), "chat-completions");
	assert.equal(protocolOf({ protocol: "responses" }), "responses");
});

// ===== 模型匹配（共享判定，#110 新增后缀分支） =====

test("matchModelPattern：精确 / 前缀 / 后缀 / 单独 *；既有前缀语义不变", () => {
	assert.equal(matchModelPattern("gpt-6.2*", "gpt-6.2-astra"), true);
	assert.equal(matchModelPattern("gpt-6.2*", "gpt-5.4"), false);
	assert.equal(matchModelPattern("gpt-5.5-pro", "gpt-5.5-pro"), true);
	assert.equal(matchModelPattern("*-pro", "gpt-5.5-pro"), true);
	assert.equal(matchModelPattern("*-pro", "gpt-5.6-cyber"), false);
	assert.equal(matchModelPattern("*-pro", "pro"), false, "后缀不能是空串以外的整串误配");
	assert.equal(matchModelPattern("*", "anything"), true, "单独 * 仍恒命中");
});
