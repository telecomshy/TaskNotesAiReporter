import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTokens } from "../src/ui/taskMeta";

test("summarizeTokens 空或未定义返回 null", () => {
	assert.equal(summarizeTokens(undefined, 3, "#"), null);
	assert.equal(summarizeTokens([], 3, "#"), null);
});

test("summarizeTokens 数量未超上限时全部显示", () => {
	assert.deepEqual(summarizeTokens(["前端", "后端"], 3, "#"), {
		shown: "#前端 #后端",
		rest: 0,
		full: "#前端 #后端",
	});
});

test("summarizeTokens 数量等于上限时全部显示", () => {
	assert.deepEqual(summarizeTokens(["a", "b", "c"], 3, "@"), {
		shown: "@a @b @c",
		rest: 0,
		full: "@a @b @c",
	});
});

test("summarizeTokens 数量超上限时折叠并保留完整文本", () => {
	const result = summarizeTokens(["a", "b", "c", "d", "e"], 3, "#");
	assert.equal(result?.shown, "#a #b #c");
	assert.equal(result?.rest, 2);
	assert.equal(result?.full, "#a #b #c #d #e");
});
