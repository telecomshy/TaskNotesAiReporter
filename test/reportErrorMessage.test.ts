import { test } from "node:test";
import assert from "node:assert/strict";
import { AIClientError } from "../src/ai/errors";
import { describeReportFailure } from "../src/report/errorMessage";
import { createTranslator } from "../src/i18n";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";

test("无任务 → 中英文提示一致", () => {
	const failure = { ok: false, reason: "no-tasks" } as const;
	assert.equal(describeReportFailure(failure, createTranslator(zh)), "请先添加要生成报告的任务");
	assert.equal(
		describeReportFailure(failure, createTranslator(en)),
		"Add tasks before generating a report"
	);
});

test("未选模型 → 中英文提示一致", () => {
	const failure = { ok: false, reason: "no-model" } as const;
	assert.equal(
		describeReportFailure(failure, createTranslator(zh)),
		"请先在插件设置中选择模型并配置 API 密钥"
	);
	assert.equal(
		describeReportFailure(failure, createTranslator(en)),
		"Select a model and configure its API key in the plugin settings first"
	);
});

test("缺凭证 → 中文提示", () => {
	assert.equal(
		describeReportFailure({ ok: false, reason: "missing-credentials" }, createTranslator(zh)),
		"请先在插件设置中填写所选供应商的 Base URL 和 API 密钥"
	);
});

test("ai-error：结构化 AI 错误走 AI 描述器，携带服务端详情", () => {
	const error = new AIClientError("chat.http", { status: 500, detail: "boom" });
	assert.equal(
		describeReportFailure({ ok: false, reason: "ai-error", error }, createTranslator(zh)),
		"生成失败：模型接口返回错误（HTTP 500）：boom"
	);
});

test("ai-error：普通错误回退原始 message", () => {
	assert.equal(
		describeReportFailure(
			{ ok: false, reason: "ai-error", error: new Error("boom") },
			createTranslator(en)
		),
		"Generation failed: boom"
	);
});

test("save-error：原始 message 包进通用文案", () => {
	assert.equal(
		describeReportFailure(
			{ ok: false, reason: "save-error", error: new Error("disk full") },
			createTranslator(en)
		),
		"Generation failed: disk full"
	);
});
