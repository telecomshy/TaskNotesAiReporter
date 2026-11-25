/**
 * 思考测试流程（ai/thinkingTest 的编排薄壳）回归：
 * - 「（供应商, 模型）键单一来源」取自解析结果——探测与落 / 清习得用同一对键（双源漂移收敛）；
 * - 重测先清习得（清习得并重跑）；解析失败不动习得数据（不清也不跑）。
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/thinkingFlow.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runThinkingTestFlow, type ThinkingTestStateSlice } from "../src/ai/thinkingTest";
import type { HttpResponse, RequestFn, RequestParams } from "../src/ai/request";
import type { ActiveModelResolution, LearnedCapability } from "../src/types";
import { runAndAnnounceThinkingTest } from "../src/ui/thinkingTestAction";
import { BUNDLES, createTranslator } from "../src/i18n";
import { notices } from "./fakes/obsidian-stub";

/** 带推理段的微型响应（基线「会思考」）。 */
function reasoningPresent(): HttpResponse {
	return {
		status: 200,
		json: { choices: [{ message: { content: "2", reasoning_content: "想想" } }] },
		text: "",
	};
}

/** 无推理段的微型响应（某关字段使其消失）。 */
function reasoningAbsent(): HttpResponse {
	return {
		status: 200,
		json: { choices: [{ message: { content: "2" } }] },
		text: "",
	};
}

/** 按调用次序回放的假请求（基线 → 逐字段）。 */
function replayRequest(responses: HttpResponse[]): { request: RequestFn; calls: number[] } {
	const calls: number[] = [];
	let index = 0;
	const request: RequestFn = async () => {
		calls.push(index);
		return responses[Math.min(index++, responses.length - 1)];
	};
	return { request, calls };
}

interface RecordingSlice extends ThinkingTestStateSlice {
	cleared: Array<[string, string]>;
	recorded: Array<[string, string, LearnedCapability]>;
}

function fakeSlice(resolution: ActiveModelResolution): RecordingSlice {
	const cleared: Array<[string, string]> = [];
	const recorded: Array<[string, string, LearnedCapability]> = [];
	return {
		resolveActive: () => resolution,
		clearLearnedThinking: (providerId, model) => void cleared.push([providerId, model]),
		recordThinkingTest: (providerId, model, entry) =>
			void recorded.push([providerId, model, entry]),
		cleared,
		recorded,
	};
}

function activeResolution(): ActiveModelResolution {
	return {
		ok: true,
		providerId: "prov-x",
		config: {
			apiStyle: "openai",
			baseUrl: "https://api.example.com",
			apiKey: "sk",
			model: "model-y",
			thinking: { setting: "off", param: null, note: null, learned: null },
		},
	};
}

test("落习得键单一来源：取自解析结果的（供应商, 模型），不收调用方传键", async () => {
	const { request } = replayRequest([reasoningPresent(), reasoningAbsent()]);
	const slice = fakeSlice(activeResolution());
	const result = await runThinkingTestFlow(slice, 5, false, request);
	assert.ok(result, "解析成功应有结论");
	assert.equal(result.verdict, "switchable");
	assert.deepEqual(slice.cleared, [], "非重测不清习得");
	assert.deepEqual(
		slice.recorded.map(([providerId, model]) => [providerId, model]),
		[["prov-x", "model-y"]],
		"落习得条目用解析结果的键"
	);
	assert.equal(slice.recorded[0][2].verdict, "switchable");
});

test("重测先清习得并重跑（清习得并重跑）", async () => {
	const { request } = replayRequest([reasoningPresent(), reasoningAbsent()]);
	const slice = fakeSlice(activeResolution());
	const result = await runThinkingTestFlow(slice, 5, true, request);
	assert.ok(result);
	assert.deepEqual(slice.cleared, [["prov-x", "model-y"]], "重测先清旧结论");
	assert.equal(slice.recorded.length, 1, "重跑落新结论");
});

test("解析失败不动习得数据：不清也不跑", async () => {
	const slice = fakeSlice({ ok: false, reason: "no-model" });
	const { request, calls } = replayRequest([reasoningPresent()]);
	const result = await runThinkingTestFlow(slice, 5, true, request);
	assert.equal(result, null, "当前模型不可用返回 null");
	assert.deepEqual(slice.cleared, [], "解析失败不清习得");
	assert.deepEqual(slice.recorded, [], "解析失败不落习得");
	assert.equal(calls.length, 0, "解析失败不发探测请求");
});

// ===== 接口方言（#105）：探测请求按方言构造 =====

function anthropicResolution(): ActiveModelResolution {
	return {
		ok: true,
		providerId: "anthropic",
		config: {
			apiStyle: "anthropic",
			baseUrl: "https://api.anthropic.com/v1",
			apiKey: "sk-ant",
			model: "claude-sonnet-4-6",
			thinking: {
				setting: "off",
				param: { name: "thinking", value: { type: "disabled" } },
				note: null,
				learned: null,
			},
		},
	};
}

test("Anthropic 方言（#105）：探测走 /messages + x-api-key，基线不复用生成期关参数、候选只试 thinking", async () => {
	const calls: RequestParams[] = [];
	let index = 0;
	const responses: HttpResponse[] = [
		{
			status: 200,
			json: { content: [{ type: "thinking", thinking: "想想" }, { type: "text", text: "2" }] },
			text: "",
		},
		{ status: 200, json: { content: [{ type: "text", text: "2" }] }, text: "" },
	];
	const request: RequestFn = async (params) => {
		calls.push(params);
		return responses[Math.min(index++, responses.length - 1)];
	};

	const slice = fakeSlice(anthropicResolution());
	const result = await runThinkingTestFlow(slice, 5, false, request);

	assert.ok(result);
	assert.equal(result.verdict, "switchable", "Claude 上基线有思考 + disabled 候选消失 → 可关");
	assert.equal(calls.length, 2, "基线 + 单字段候选（不试 OpenAI 字段）");
	assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
	assert.equal(calls[0].headers["x-api-key"], "sk-ant");
	assert.equal(calls[0].headers["anthropic-version"], "2026-10-21");
	assert.equal(calls[0].headers.Authorization, undefined, "不发 Bearer");
	const baseline = JSON.parse(calls[0].body!);
	const probe = JSON.parse(calls[1].body!);
	assert.equal("temperature" in baseline, false, "Anthropic 方言不发温度");
	assert.equal("temperature" in probe, false);
	assert.equal("thinking" in baseline, false, "基线不发思考参数");
	assert.deepEqual(probe.thinking, { type: "disabled" });
	assert.equal(probe.max_tokens, 256);
	assert.deepEqual(slice.recorded[0].slice(0, 2), ["anthropic", "claude-sonnet-4-6"]);
	assert.deepEqual(slice.recorded[0][2].off, { name: "thinking", value: { type: "disabled" } });
});

// ===== 共享界面动作（#97）：跑 + 报 + 回调 =====

test("共享动作：成功路径提示结论并回调刷新", async () => {
	notices.length = 0;
	const t = createTranslator(BUNDLES.zh);
	const { request } = replayRequest([reasoningPresent(), reasoningAbsent()]);
	const slice = fakeSlice(activeResolution());
	let done = 0;

	const result = await runAndAnnounceThinkingTest(
		{
			providers: slice,
			timeoutSeconds: 5,
			t,
			onDone: () => void done++,
			request,
		},
		false
	);

	assert.ok(result);
	assert.equal(result.verdict, "switchable");
	assert.equal(
		notices[notices.length - 1],
		t("model.thinkingTestVerdictSwitchable"),
		"结论以提示上浮"
	);
	assert.equal(done, 1, "跑完回调刷新");
});

test("共享动作：当前模型不可用也提示并回调（不留静默路径）", async () => {
	notices.length = 0;
	const t = createTranslator(BUNDLES.zh);
	const slice = fakeSlice({ ok: false, reason: "no-model" });
	let done = 0;

	const result = await runAndAnnounceThinkingTest(
		{
			providers: slice,
			timeoutSeconds: 5,
			t,
			onDone: () => void done++,
		},
		true
	);

	assert.equal(result, null);
	assert.equal(notices[notices.length - 1], t("model.thinkingTestNeedModel"), "提示先选择模型");
	assert.equal(done, 1, "失败也回调（设置页刷新语义）");
});
