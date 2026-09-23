import { test } from "node:test";
import assert from "node:assert/strict";
import { AIClientError } from "../src/ai/errors";
import { describeReportFailure } from "../src/report/errorMessage";
import { createTranslator } from "../src/i18n";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";

test("无任务：中英文提示一致", () => {
	const failure = { ok: false, reason: "no-tasks" } as const;
	assert.equal(describeReportFailure(failure, createTranslator(zh)), "请先添加要生成报告的任务");
	assert.equal(
		describeReportFailure(failure, createTranslator(en)),
		"Add tasks before generating a report"
	);
});

test("no-provider 与 no-model 渲染同一句（子原因留类型、文案不拆，#51 修订二）", () => {
	const zhT = createTranslator(zh);
	const enT = createTranslator(en);
	assert.equal(
		describeReportFailure({ ok: false, reason: "no-provider" }, zhT),
		"请先在插件设置中选择模型并配置 API 密钥"
	);
	assert.equal(
		describeReportFailure({ ok: false, reason: "no-model" }, zhT),
		"请先在插件设置中选择模型并配置 API 密钥"
	);
	assert.equal(
		describeReportFailure({ ok: false, reason: "no-provider" }, enT),
		describeReportFailure({ ok: false, reason: "no-model" }, enT)
	);
});

test("缺凭证：中文提示", () => {
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

test("save-error：独立文案，不再调用 AI 描述器（#51 修订三）", () => {
	const error = new AIClientError("chat.http", { status: 500, detail: "disk full" });
	const zhText = describeReportFailure({ ok: false, reason: "save-error", error }, createTranslator(zh));
	assert.equal(zhText, "报告保存失败：请检查报告输出目录与写入权限");
	assert.ok(!zhText.includes("HTTP"), "保存失败的提示不得携带模型接口细节");

	const enText = describeReportFailure(
		{ ok: false, reason: "save-error", error: new Error("disk full") },
		createTranslator(en)
	);
	assert.equal(enText, "Failed to save the report: check the report output folder and write permissions");
	assert.ok(!enText.includes("disk full"), "保存失败的提示不走通用文案，不带原始 message");
});
