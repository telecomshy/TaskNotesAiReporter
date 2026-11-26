/**
 * 「当前模型 → 请求」单缝装配（#111，ADR-0032）：
 * 事实解析 / 生成与「测试」按钮共用的装配（策略算术）/ 思考测试逐步装配 / 候选分派。
 *
 * 纯断言、无传输 mock——策略算术从执行层搬来此处，测试随之搬来（替换，不叠层）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	assembleChatRequest,
	assembleProbeRequest,
	probeOffCandidates,
	resolveModelFacts,
} from "../src/ai/modelRequest";
import {
	EMPTY_REQUEST_POLICY,
	OPENAI_REQUEST_POLICY,
} from "../src/core/requestPolicy";
import { resolveActive } from "../src/settings/providerSettings";
import { modelTestRequest } from "../src/settings/modelTest";
import type { ChatMessage, ModelFacts, ModelProvider, ModelRequest, RequestGlobals } from "../src/types";

// ===== 假件 =====

function provider(over: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "custom_x",
		name: "c",
		type: "custom",
		baseUrl: "https://api.example.com",
		apiKeySecretId: "",
		authType: "none",
		models: [],
		customModels: [],
		...over,
	};
}

function facts(over: Partial<ModelFacts> = {}): ModelFacts {
	return {
		apiStyle: "openai",
		protocol: "chat-completions",
		thinking: { setting: "off", param: null, note: "unknown", learned: null },
		requestPolicy: EMPTY_REQUEST_POLICY,
		...over,
	};
}

const target = { baseUrl: "https://api.example.com", apiKey: "sk", model: "m" };
const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
const globals: RequestGlobals = { temperature: 0.7, maxTokens: 8192, timeoutSeconds: 30 };

/** 一个思考参数（顶层 reasoning_effort 形态）。 */
function effort(value: string): { name: string; value: unknown } {
	return { name: "reasoning_effort", value };
}

/** 温度读面：Anthropic 变体没有该字段；OpenAI 变体缺席＝不发。 */
function temperatureField(req: ModelRequest): number | undefined {
	return "temperature" in req ? req.temperature : undefined;
}

// ===== 事实解析：总函数、逐层回落 =====

test("事实解析：OpenAI 预设未登记模型回落缺省策略、Chat 协议、能力未知", () => {
	const p = provider({ id: "openai", type: "preset", apiKeySecretId: "k", models: ["gpt-7-future"] });
	const resolved = resolveModelFacts(p, "gpt-7-future");
	assert.equal(resolved.apiStyle, "openai");
	assert.equal(resolved.protocol, "chat-completions");
	assert.deepEqual(resolved.requestPolicy, OPENAI_REQUEST_POLICY);
	assert.deepEqual(resolved.thinking, { setting: "off", param: null, note: "unknown", learned: null });
	assert.equal(resolved.maxTokens, undefined, "未设行参数＝缺席（生成回落全局）");
});

test("事实解析：Responses-only 模型解析出 responses 协议", () => {
	const p = provider({ id: "openai", type: "preset", apiKeySecretId: "k", models: ["gpt-5.5-pro"] });
	assert.equal(resolveModelFacts(p, "gpt-5.5-pro").protocol, "responses");
});

test("事实解析：Anthropic 方言不带 protocol（协议只属于 OpenAI，ADR-0031）", () => {
	const p = provider({
		id: "anthropic",
		type: "preset",
		apiStyle: "anthropic",
		apiKeySecretId: "k",
		models: ["claude-sonnet-4-6"],
	});
	const resolved = resolveModelFacts(p, "claude-sonnet-4-6");
	assert.equal(resolved.apiStyle, "anthropic");
	assert.equal("protocol" in resolved, false, "Anthropic 恒 Messages，配置里不带该字段");
	assert.deepEqual(resolved.requestPolicy, EMPTY_REQUEST_POLICY);
	assert.deepEqual(resolved.thinking.param, { name: "thinking", value: { type: "disabled" } });
});

test("事实解析：思考读能力表与习得条目（委托 core/thinking 的同一读面）", () => {
	const p = provider({
		id: "deepseek",
		type: "preset",
		apiKeySecretId: "k",
		models: ["deepseek-v4"],
		thinkingByModel: { "deepseek-v4": "on" },
		learnedByModel: {
			"deepseek-v4": {
				verdict: "switchable",
				off: { name: "thinking", value: { type: "disabled" } },
				testedAt: "2026-11-25T00:00:00.000Z",
			},
		},
	});
	const resolved = resolveModelFacts(p, "deepseek-v4");
	assert.equal(resolved.thinking.setting, "on");
	assert.deepEqual(resolved.thinking.param, null, "习得可关：开档无开参数则不发");
	assert.ok(resolved.thinking.learned, "习得条目随事实带出（呈现层仍读它）");
});

test("事实解析：行级 maxTokens 经入参递入并原样成为事实", () => {
	const p = provider();
	assert.equal(resolveModelFacts(p, "m", { maxTokens: 4096 }).maxTokens, 4096);
	assert.equal(resolveModelFacts(p, "m").maxTokens, undefined);
});

test("事实解析是总函数：任意（供应商, 模型）都有答案，无失败分支", () => {
	const resolved = resolveModelFacts(provider({ id: "never-seen" }), "unknown-model");
	assert.equal(resolved.apiStyle, "openai");
	assert.equal(resolved.protocol, "chat-completions");
	assert.deepEqual(resolved.requestPolicy, EMPTY_REQUEST_POLICY);
	assert.equal(resolved.thinking.note, "unknown");
});

// ===== 生成装配：温度 × 本次生效 effort =====

test("温度判定：send 恒发（含无参数与任意 effort）", () => {
	const policy = { ...EMPTY_REQUEST_POLICY, temperature: "send" as const };
	for (const thinking of [null, effort("none"), effort("high")]) {
		const req = assembleChatRequest({
			target,
			facts: facts({
				requestPolicy: policy,
				thinking: { setting: "off", param: thinking, note: null, learned: null },
			}),
			messages,
			globals,
		});
		assert.equal(temperatureField(req), 0.7, JSON.stringify(thinking));
	}
});

test("温度判定：omit-always 永不发（含生效 effort 为 none）", () => {
	const policy = { ...OPENAI_REQUEST_POLICY, temperature: "omit-always" as const };
	for (const thinking of [null, effort("none"), effort("high")]) {
		const req = assembleChatRequest({
			target,
			facts: facts({
				requestPolicy: policy,
				thinking: { setting: "off", param: thinking, note: null, learned: null },
			}),
			messages,
			globals,
		});
		assert.equal("temperature" in req, false, JSON.stringify(thinking));
	}
});

test("温度判定：omit-unless-none 仅在生效 effort 为 none 时发", () => {
	const send = (thinking: { name: string; value: unknown } | null): boolean => {
		const req = assembleChatRequest({
			target,
			facts: facts({
				requestPolicy: OPENAI_REQUEST_POLICY,
				thinking: { setting: "off", param: thinking, note: null, learned: null },
			}),
			messages,
			globals,
		});
		return "temperature" in req;
	};
	assert.equal(send(effort("none")), true, "关（none）合法");
	assert.equal(send(effort("high")), false, "开（high）不合法");
	assert.equal(send(null), false, "强制 / 无思考 / 未知：默认 medium，不合法");
	assert.equal(
		send({ name: "thinking", value: { type: "disabled" } }),
		false,
		"别的字段不等于 effort=none"
	);
});

test("温度判定（#110）：嵌套 reasoning.effort 与顶层 reasoning_effort 等价", () => {
	const send = (value: unknown): boolean => {
		const req = assembleChatRequest({
			target,
			facts: facts({
				requestPolicy: OPENAI_REQUEST_POLICY,
				thinking: { setting: "off", param: { name: "reasoning", value }, note: null, learned: null },
			}),
			messages,
			globals,
		});
		return "temperature" in req;
	};
	assert.equal(send({ effort: "none" }), true, "Responses 的关＝reasoning.effort:none 也合法");
	assert.equal(send({ effort: "high" }), false);
	assert.equal(send({}), false, "不带 effort 的对象不算 none");
});

test("温度判定：非法 effort 形态不解释（非字符串 / 缺字段 → 不合法）", () => {
	const send = (value: unknown): boolean => {
		const req = assembleChatRequest({
			target,
			facts: facts({
				requestPolicy: OPENAI_REQUEST_POLICY,
				thinking: { setting: "off", param: { name: "reasoning_effort", value }, note: null, learned: null },
			}),
			messages,
			globals,
		});
		return "temperature" in req;
	};
	assert.equal(send(1), false);
	assert.equal(send(undefined), false);
});

// ===== 生成装配：额度合并 / 下限 / 钳制 / 超时下限 =====

test("额度：行级 ?? 全局，再抬下限并钳 384K（双向都成立）", () => {
	const budget = (over: Partial<ModelFacts>, globalMaxTokens = globals.maxTokens): number =>
		assembleChatRequest({ target, facts: facts(over), messages, globals: { ...globals, maxTokens: globalMaxTokens } })
			.maxTokens;

	assert.equal(budget({ requestPolicy: OPENAI_REQUEST_POLICY }), 25000, "配置更小 → 下限生效");
	assert.equal(budget({ requestPolicy: OPENAI_REQUEST_POLICY }, 30000), 30000, "用户配置更大 → 用户优先");
	assert.equal(budget({ requestPolicy: OPENAI_REQUEST_POLICY }, 400000), 384 * 1024, "钳制上限仍 384K");
	assert.equal(budget({ requestPolicy: EMPTY_REQUEST_POLICY }), 8192, "无下限 → 原值");
	assert.equal(budget({ requestPolicy: OPENAI_REQUEST_POLICY }, 0), 25000, "非法配置按缺省 8192 再抬到下限");
	assert.equal(budget({ requestPolicy: OPENAI_REQUEST_POLICY }, Number.NaN), 25000);
});

test("额度：行级参数优先于全局（无下限时原样生效）", () => {
	assert.equal(
		assembleChatRequest({ target, facts: facts({ maxTokens: 4096 }), messages, globals }).maxTokens,
		4096
	);
});

test("超时：取全局与下限中的较大者，双向都成立", () => {
	const timeout = (policy: ModelFacts["requestPolicy"], seconds: number): number =>
		assembleChatRequest({
			target,
			facts: facts({ requestPolicy: policy }),
			messages,
			globals: { ...globals, timeoutSeconds: seconds },
		}).timeoutSeconds;
	assert.equal(timeout(OPENAI_REQUEST_POLICY, 30), 120, "全局更小 → 下限生效");
	assert.equal(timeout(OPENAI_REQUEST_POLICY, 300), 300, "用户全局更大 → 用户优先");
	assert.equal(timeout(EMPTY_REQUEST_POLICY, 30), 30, "无下限 → 原值");
});

// ===== 三变体端到端：方言 × 协议 =====

test("Anthropic 变体：无 protocol / 无温度 / 无 outputField；messages 与思考参数原样交出", () => {
	const req = assembleChatRequest({
		target,
		facts: facts({
			apiStyle: "anthropic",
			protocol: undefined,
			thinking: { setting: "off", param: { name: "thinking", value: { type: "disabled" } }, note: null, learned: null },
		}),
		messages,
		globals,
	});
	assert.equal(req.dialect, "anthropic");
	assert.equal("protocol" in req, false);
	assert.equal("temperature" in req, false, "Messages API 已删除温度（ADR-0030 分层）");
	assert.equal("outputField" in req, false);
	assert.deepEqual(req.thinking, { name: "thinking", value: { type: "disabled" } });
	assert.equal(req.maxTokens, 8192, "空策略无下限");
	assert.deepEqual(req.messages, messages);
	assert.deepEqual(
		{ baseUrl: req.baseUrl, apiKey: req.apiKey, model: req.model },
		target,
		"身份三件套原样交出"
	);
});

test("OpenAI Chat 变体：协议 chat-completions + 策略定案的额度字段名", () => {
	const req = assembleChatRequest({
		target,
		facts: facts({ requestPolicy: OPENAI_REQUEST_POLICY }),
		messages,
		globals,
	});
	assert.equal(req.dialect, "openai");
	if (req.dialect !== "openai" || req.protocol !== "chat-completions") assert.fail("应为 chat 变体");
	assert.equal(req.protocol, "chat-completions");
	assert.equal(req.outputField, "max_completion_tokens", "OpenAI 预设缺省额度字段");
	assert.equal(req.maxTokens, 25000);
	assert.equal(req.timeoutSeconds, 120);
	assert.equal("temperature" in req, false, "无 effort ⇒ 温度不发");
});

test("OpenAI Responses 变体：协议 responses，无 outputField（额度字段恒 max_output_tokens）", () => {
	const req = assembleChatRequest({
		target,
		facts: facts({ protocol: "responses", requestPolicy: OPENAI_REQUEST_POLICY }),
		messages,
		globals,
	});
	assert.equal(req.dialect, "openai");
	if (req.dialect !== "openai") assert.fail("应为 openai 变体");
	assert.equal(req.protocol, "responses");
	assert.equal("outputField" in req, false);
	assert.equal(req.maxTokens, 25000);
});

test("四家国产预设零变更：空策略下额度与温度照发（无策略字段被装配夹带）", () => {
	for (const providerId of ["deepseek", "qwen", "kimi", "minimax"]) {
		const req = assembleChatRequest({
			target,
			facts: facts({ requestPolicy: EMPTY_REQUEST_POLICY }),
			messages,
			globals,
		});
		assert.equal(req.maxTokens, 8192, providerId);
		assert.equal(temperatureField(req), 0.7, providerId);
		assert.equal(req.dialect === "openai" && req.protocol, "chat-completions", providerId);
	}
});

// ===== 探测装配 =====

test("探测：预算恒 256，不吃额度下限（OpenAI 25k 下限不生效）", () => {
	const req = assembleProbeRequest({
		target,
		facts: facts({ requestPolicy: OPENAI_REQUEST_POLICY }),
		timeoutSeconds: 5,
		param: null,
	});
	assert.equal(req.maxTokens, 256);
});

test("探测：超时仍吃下限；param 并入覆盖事实思考（基线 null 即不发）", () => {
	const base = facts({
		requestPolicy: OPENAI_REQUEST_POLICY,
		thinking: {
			setting: "off",
			param: { name: "reasoning_effort", value: "none" },
			note: null,
			learned: null,
		},
	});
	const baseline = assembleProbeRequest({ target, facts: base, timeoutSeconds: 5, param: null });
	assert.equal(baseline.timeoutSeconds, 120, "超时吃下限");
	assert.equal(baseline.thinking, null, "基线覆盖事实思考 → 不发参数");
	assert.equal("temperature" in baseline, false, "基线无 effort ⇒ 温度不发");

	const candidate = assembleProbeRequest({
		target,
		facts: base,
		timeoutSeconds: 5,
		param: { name: "reasoning", value: { effort: "none" } },
	});
	assert.deepEqual(candidate.thinking, { name: "reasoning", value: { effort: "none" } });
	assert.equal(temperatureField(candidate), 0, "探测温度是结构性 0，且 none 时合法");
});

test("探测：提示内化（单条 user 消息），Anthropic 变体仍无温度", () => {
	const openai = assembleProbeRequest({
		target,
		facts: facts({ requestPolicy: OPENAI_REQUEST_POLICY }),
		timeoutSeconds: 5,
		param: null,
	});
	assert.deepEqual(openai.messages, [{ role: "user", content: "1+1=? Reply with the number only." }]);

	const anthropic = assembleProbeRequest({
		target,
		facts: facts({ apiStyle: "anthropic", protocol: undefined }),
		timeoutSeconds: 5,
		param: { name: "thinking", value: { type: "disabled" } },
	});
	assert.equal(anthropic.dialect, "anthropic");
	assert.equal("temperature" in anthropic, false);
});

// ===== 候选分派 =====

test("候选分派收进缝内：providerId 显式递入，方言与协议各自决定字段", () => {
	const openaiChat = probeOffCandidates(facts({ apiStyle: "openai", protocol: "chat-completions" }), "openai");
	assert.deepEqual(openaiChat, [{ name: "reasoning_effort", value: "none" }], "Chat 只探顶层字段");

	const openaiResponses = probeOffCandidates(facts({ apiStyle: "openai", protocol: "responses" }), "openai");
	assert.deepEqual(openaiResponses, [{ name: "reasoning", value: { effort: "none" } }], "Responses 只探嵌套字段");

	const anthropic = probeOffCandidates(facts({ apiStyle: "anthropic", protocol: undefined }), "anthropic");
	assert.deepEqual(anthropic, [{ name: "thinking", value: { type: "disabled" } }]);

	const others = probeOffCandidates(facts({ apiStyle: "openai", protocol: "chat-completions" }), "deepseek");
	assert.deepEqual(others.map((p) => p.name), ["thinking", "enable_thinking", "reasoning_effort"], "其余方言保持三字段");
});

// ===== 「测试」按钮 ≡ 生成（同一事实、同一 globals） =====

test("按钮 ≡ 生成等价：同一（供应商, 模型）与同一 globals 下装配结果一致", () => {
	const p = provider({
		customModels: [{ id: "mc1", modelId: "m", maxTokens: 2048 }],
		thinkingByModel: { m: "off" },
		learnedByModel: {
			m: {
				verdict: "switchable",
				off: { name: "thinking", value: { type: "disabled" } },
				testedAt: "2026-11-25T00:00:00.000Z",
			},
		},
	});
	const state = { providers: [p], activeProviderId: "custom_x", activeModel: "m" };
	const resolved = resolveActive(state, () => null);
	assert.equal(resolved.ok, true, "无认证供应商不要求密钥");
	if (!resolved.ok) return;

	// 生成路径：解析结果 = 事实 & 目标（装配层切成两半）。
	const generation = assembleChatRequest({
		target: {
			baseUrl: resolved.config.baseUrl,
			apiKey: resolved.config.apiKey,
			model: resolved.config.model,
		},
		facts: resolved.config,
		messages,
		globals,
	});

	// 「测试」按钮路径：生产代码的装配（modelTestRequest）现解析事实（行参数取输入框值）。
	const button = modelTestRequest({
		provider: p,
		modelId: "m",
		maxTokens: 2048,
		apiKey: "",
		globals,
	});

	assert.deepEqual(button.messages, [{ role: "user", content: "ping" }], "ping 是按钮的装配输入");
	assert.deepEqual(
		{ ...button, messages: generation.messages },
		generation,
		"两条路径装配出同一请求（消息内容本就是各自的输入）"
	);
	// 行为变化（ADR-0032 如实记录）：带习得条目的自定义行「测试」发该行解析出的思考参数。
	assert.deepEqual(generation.thinking, { name: "thinking", value: { type: "disabled" } });
	assert.equal(generation.maxTokens, 2048, "行级上限对按钮与生成同样生效");
});

test("按钮 ≡ 生成等价：OpenAI 预设的响应协议与策略同样一致", () => {
	const p = provider({
		id: "openai",
		type: "preset",
		baseUrl: "https://api.openai.com/v1",
		apiKeySecretId: "k",
		models: ["gpt-5.5-pro"],
	});
	const state = { providers: [p], activeProviderId: "openai", activeModel: "gpt-5.5-pro" };
	const resolved = resolveActive(state, () => "sk");
	assert.equal(resolved.ok, true);
	if (!resolved.ok) return;

	const generation = assembleChatRequest({
		target: {
			baseUrl: resolved.config.baseUrl,
			apiKey: resolved.config.apiKey,
			model: resolved.config.model,
		},
		facts: resolved.config,
		messages,
		globals,
	});
	const button = modelTestRequest({
		provider: p,
		modelId: "gpt-5.5-pro",
		apiKey: "sk",
		globals,
	});
	assert.deepEqual({ ...button, messages: generation.messages }, generation);
	assert.equal(generation.dialect === "openai" && generation.protocol, "responses");
});
