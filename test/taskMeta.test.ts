import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTagContext } from "../src/ui/taskMeta";

test("summarizeTagContext 空或未定义返回 null", () => {
	assert.equal(summarizeTagContext(undefined, 3, "#"), null);
	assert.equal(summarizeTagContext([], 3, "#"), null);
});

test("summarizeTagContext 数量未超上限时全部显示", () => {
	assert.deepEqual(summarizeTagContext(["前端", "后端"], 3, "#"), {
		shown: "#前端 #后端",
		rest: 0,
		full: "#前端 #后端",
	});
});

test("summarizeTagContext 数量等于上限时全部显示", () => {
	assert.deepEqual(summarizeTagContext(["a", "b", "c"], 3, "@"), {
		shown: "@a @b @c",
		rest: 0,
		full: "@a @b @c",
	});
});

test("summarizeTagContext 数量超上限时折叠并保留完整文本", () => {
	const result = summarizeTagContext(["a", "b", "c", "d", "e"], 3, "#");
	assert.equal(result?.shown, "#a #b #c");
	assert.equal(result?.rest, 2);
	assert.equal(result?.full, "#a #b #c #d #e");
});
