/**
 * 思考测试流程（ai/thinkingTest 的编排薄壳）回归：
 * - 「（供应商, 模型）键单一来源」取自解析结果——探测与落 / 清习得用同一对键（双源漂移收敛）；
 * - 重测先清习得（清习得并重跑）；解析失败不动习得数据（不清也不跑）。
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/thinkingFlow.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runThinkingTestFlow, type ThinkingTestStateSlice } from "../src/ai/thinkingTest";
import type { HttpResponse, RequestFn } from "../src/ai/request";
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
