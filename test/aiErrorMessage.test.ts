import { test } from "node:test";
import assert from "node:assert/strict";
import { AIClientError } from "../src/ai/errors";
import { describeAIError } from "../src/ai/errorMessage";
import { createTranslator } from "../src/i18n";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";

test("AI 错误按中文描述（HTTP 状态 + 服务端详情）", () => {
	const t = createTranslator(zh);
	const e = new AIClientError("chat.http", { status: 500, detail: "boom" });
	assert.equal(describeAIError(e, t), "模型接口返回错误（HTTP 500）：boom");
});

test("AI 错误按英文描述（超时）", () => {
	const t = createTranslator(en);
	const e = new AIClientError("timeout", { ms: 30000 });
	assert.equal(describeAIError(e, t), "Request timed out (30000ms)");
});

test("AI 错误按中文描述（模型列表解析失败，无详情）", () => {
	const t = createTranslator(zh);
	assert.equal(describeAIError(new AIClientError("models.parse"), t), "解析模型列表响应失败");
});

test("非 AIClientError 回退原始 message", () => {
	const t = createTranslator(en);
	assert.equal(describeAIError(new Error("boom"), t), "boom");
	assert.equal(describeAIError("plain", t), "plain");
});
