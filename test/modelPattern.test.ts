/**
 * 模型行匹配（#114 从 wireProtocol.test.ts 迁入）：`*` 结尾＝前缀匹配、`*` 开头＝后缀匹配，
 * 否则精确匹配；单独 `*` 恒命中。三张行键同构表共用这一个判定（ADR-0035）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchModelPattern } from "../src/core/modelPattern";

test("matchModelPattern：精确 / 前缀 / 后缀 / 单独 *；既有前缀语义不变", () => {
	assert.equal(matchModelPattern("gpt-6.2*", "gpt-6.2-astra"), true);
	assert.equal(matchModelPattern("gpt-6.2*", "gpt-5.4"), false);
	assert.equal(matchModelPattern("gpt-5.5-pro", "gpt-5.5-pro"), true);
	assert.equal(matchModelPattern("*-pro", "gpt-5.5-pro"), true);
	assert.equal(matchModelPattern("*-pro", "gpt-5.6-cyber"), false);
	assert.equal(matchModelPattern("*-pro", "pro"), false, "后缀匹配要求 `*` 之前还有内容，`pro` 本身不应命中");
	assert.equal(matchModelPattern("*", "anything"), true, "单独 * 仍恒命中");
});
