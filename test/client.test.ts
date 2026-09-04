import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatCompletionsUrl, buildModelsUrl } from "../src/core/aiUrl";

test("buildChatCompletionsUrl 拼接端点", () => {
	assert.equal(buildChatCompletionsUrl("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
	assert.equal(buildChatCompletionsUrl("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/chat/completions");
	assert.equal(
		buildChatCompletionsUrl("https://api.deepseek.com/chat/completions"),
		"https://api.deepseek.com/chat/completions"
	);
});

test("buildModelsUrl 拼接端点", () => {
	assert.equal(buildModelsUrl("https://api.deepseek.com"), "https://api.deepseek.com/models");
	assert.equal(buildModelsUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1/models");
	assert.equal(buildModelsUrl("https://api.deepseek.com/models"), "https://api.deepseek.com/models");
});
