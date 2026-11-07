/**
 * 「思考行」呈现规格表驱动测试（#102）：7 个显示状态（builtin / forced / none / unknown /
 * learned-* 三档）的完整 model 快照 ＋ 变体（run 入口 hasModel 真/假、习得档带/不带
 * triedFields、toggle.checked 两态）。纯函数（无 DOM、无 obsidian）：输入经
 * `activeModelInfo` 读面构造（与 renderModelTab 顶部同一路径），断言投影全量形状
 * （deepEqual，多余字段即失败）。
 *
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/thinkingCardModel.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { THINKING_OFF_CANDIDATES } from "../src/core/thinking";
import { activeModelInfo } from "../src/settings/providerSettings";
import { thinkingCardModel, type ThinkingCardModel } from "../src/settings/thinkingCardModel";
import type { ModelProvider } from "../src/types";

/** 思考测试固定时钟的测试时间戳（习得徽标日期取其日期部分）。 */
const TESTED_AT = "2026-11-04T08:00:00.000Z";
const TESTED_DATE = "2026-11-04";

/** 预设供应商速造（已配置；默认 DeepSeek 直连，命中内置能力表·可关）。 */
function preset(overrides: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "deepseek",
		name: "DeepSeek",
		type: "preset",
		baseUrl: "https://api.deepseek.com/v1",
		models: ["deepseek-v4-pro"],
		authType: "bearer",
		apiKeySecretId: "sk",
		modelCatalog: ["deepseek-v4-pro"],
		...overrides,
	};
}

/** 自定义供应商速造（id 不在能力表内 → 思考能力未知）。 */
function custom(overrides: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "c1",
		name: "自定义供应商",
		type: "custom",
		baseUrl: "https://api.example.com/v1",
		models: [],
		authType: "bearer",
		apiKeySecretId: "sk",
		customModels: [{ id: "mc1", modelId: "gpt-x" }],
		modelCatalog: ["gpt-x"],
		...overrides,
	};
}

interface CardCase {
	name: string;
	provider: ModelProvider;
	model: string;
	expected: ThinkingCardModel;
}

const cardCases: CardCase[] = [
	{
		name: "builtin：内置能力表·可关（开关可用，done 入口）",
		provider: preset(),
		model: "deepseek-v4-pro",
		expected: {
			toggle: { checked: false, enabled: true, titleKey: "model.thinkingOff" },
			badge: { tone: "builtin", key: "model.thinkingBadgeBuiltin" },
			footnote: { key: "model.thinkingNoteBuiltin", warn: false },
			test: { kind: "done", labelKey: "model.thinkingTestDone", disabled: true },
		},
	},
	{
		name: "forced：强制思考（警示徽标，开关置灰，done 入口）",
		provider: preset({
			id: "kimi",
			name: "Kimi（月之暗面）",
			baseUrl: "https://api.moonshot.cn/v1",
			models: ["kimi-k3-max"],
			modelCatalog: ["kimi-k3-max"],
		}),
		model: "kimi-k3-max",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "warn", key: "model.thinkingBadgeForced" },
			footnote: { key: "model.thinkingForced", warn: true },
			test: { kind: "done", labelKey: "model.thinkingTestDone", disabled: true },
		},
	},
	{
		name: "none：无思考（未知徽标不警示，开关置灰，done 入口）",
		provider: preset({
			id: "kimi",
			name: "Kimi（月之暗面）",
			baseUrl: "https://api.moonshot.cn/v1",
			models: ["moonshot-v1-8k"],
			modelCatalog: ["moonshot-v1-8k"],
		}),
		model: "moonshot-v1-8k",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "unknown", key: "model.thinkingBadgeNone" },
			footnote: { key: "model.thinkingNone", warn: false },
			test: { kind: "done", labelKey: "model.thinkingTestDone", disabled: true },
		},
	},
	{
		name: "unknown：能力表未命中（run 入口，有模型可点）",
		provider: custom(),
		model: "gpt-x",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "unknown", key: "model.thinkingBadgeUnknown" },
			footnote: { key: "model.thinkingUnknown", warn: true },
			test: { kind: "run", labelKey: "model.thinkingTestRun", disabled: false },
		},
	},
	{
		name: "learned-switchable：实测可关（习得徽标带实测日期，retest 入口）",
		provider: preset({
			learnedByModel: {
				"deepseek-v4-pro": {
					verdict: "switchable",
					off: { name: "thinking", value: { type: "disabled" } },
					testedAt: TESTED_AT,
				},
			},
		}),
		model: "deepseek-v4-pro",
		expected: {
			toggle: { checked: false, enabled: true, titleKey: "model.thinkingOff" },
			badge: { tone: "learned", key: "model.thinkingBadgeLearned", vars: { date: TESTED_DATE } },
			footnote: { key: "model.thinkingNoteLearnedSwitchable", warn: false },
			test: { kind: "retest", labelKey: "model.thinkingTestRetest", disabled: false },
		},
	},
	{
		name: "learned-switchable：开关「开」档（checked 两态变体，titleKey 随档）",
		provider: preset({
			thinkingByModel: { "deepseek-v4-pro": "on" },
			learnedByModel: {
				"deepseek-v4-pro": {
					verdict: "switchable",
					off: { name: "thinking", value: { type: "disabled" } },
					testedAt: TESTED_AT,
				},
			},
		}),
		model: "deepseek-v4-pro",
		expected: {
			toggle: { checked: true, enabled: true, titleKey: "model.thinkingOn" },
			badge: { tone: "learned", key: "model.thinkingBadgeLearned", vars: { date: TESTED_DATE } },
			footnote: { key: "model.thinkingNoteLearnedSwitchable", warn: false },
			test: { kind: "retest", labelKey: "model.thinkingTestRetest", disabled: false },
		},
	},
	{
		name: "learned-not-detected：实测未检出思考（开关不可用，retest 入口）",
		provider: preset({
			learnedByModel: { "deepseek-v4-pro": { verdict: "not-detected", testedAt: TESTED_AT } },
		}),
		model: "deepseek-v4-pro",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "learned", key: "model.thinkingBadgeLearned", vars: { date: TESTED_DATE } },
			footnote: { key: "model.thinkingNoteLearnedNotDetected", warn: false },
			test: { kind: "retest", labelKey: "model.thinkingTestRetest", disabled: false },
		},
	},
	{
		name: "learned-not-switchable：实测未能关闭（备注带实测字段数，警示）",
		provider: preset({
			learnedByModel: {
				"deepseek-v4-pro": { verdict: "not-switchable", triedFields: 3, testedAt: TESTED_AT },
			},
		}),
		model: "deepseek-v4-pro",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "warn", key: "model.thinkingBadgeLearned", vars: { date: TESTED_DATE } },
			footnote: { key: "model.thinkingNoteLearnedNotSwitchable", warn: true, vars: { count: 3 } },
			test: { kind: "retest", labelKey: "model.thinkingTestRetest", disabled: false },
		},
	},
	{
		name: "learned-not-switchable：无 triedFields → 兜底候选清单长度（view 不再 import 测试算法）",
		provider: preset({
			learnedByModel: {
				"deepseek-v4-pro": { verdict: "not-switchable", testedAt: TESTED_AT },
			},
		}),
		model: "deepseek-v4-pro",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "warn", key: "model.thinkingBadgeLearned", vars: { date: TESTED_DATE } },
			footnote: {
				key: "model.thinkingNoteLearnedNotSwitchable",
				warn: true,
				vars: { count: THINKING_OFF_CANDIDATES.length },
			},
			test: { kind: "retest", labelKey: "model.thinkingTestRetest", disabled: false },
		},
	},
	{
		name: "无当前模型：unknown 呈现且 run 入口置灰（hasModel 假变体）",
		provider: custom(),
		model: "",
		expected: {
			toggle: { checked: false, enabled: false, titleKey: "model.thinkingOff" },
			badge: { tone: "unknown", key: "model.thinkingBadgeUnknown" },
			footnote: { key: "model.thinkingUnknown", warn: true },
			test: { kind: "run", labelKey: "model.thinkingTestRun", disabled: true },
		},
	},
];

for (const c of cardCases) {
	test(`thinkingCardModel：${c.name}`, () => {
		const info = activeModelInfo({
			providers: [c.provider],
			activeProviderId: c.provider.id,
			activeModel: c.model,
		});
		assert.ok(info, "读面应产出 ActiveModelInfo");
		assert.deepEqual(thinkingCardModel(info), c.expected);
	});
}
