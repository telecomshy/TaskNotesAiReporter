/**
 * 卡级 view-model 表驱动测试（#100 step 2）：preset / custom × configured × count 0/3 ×
 * stale × active × draft 行 × orphan 三态（命中 / 不在 options / 无当前模型不算）×
 * 无 selectable 供应商。纯函数（无 DOM、无 obsidian）：直接构造 ModelProvider 与
 * ProviderStateRead，断言投影全量形状（deepEqual，多余字段即失败）。
 *
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/modelTabModel.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModelProvider } from "../src/types";
import {
	activeModelCardModel,
	providerCardModel,
	type CustomCardModel,
	type PresetCardModel,
} from "../src/settings/modelTabModel";
import { activeModelInfo } from "../src/settings/providerSettings";
import { BUNDLES, createTranslator } from "../src/i18n";

const t = createTranslator(BUNDLES.zh);

/** 预设供应商速造（已配置：有密钥名）。 */
function preset(overrides: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "p1",
		name: "Kimi（月之暗面）",
		type: "preset",
		baseUrl: "https://api.moonshot.cn/v1",
		models: ["kimi-latest", "moonshot-v1-8k", "moonshot-v1-32k"],
		authType: "bearer",
		apiKeySecretId: "sk",
		modelCatalog: ["kimi-latest", "moonshot-v1-8k", "moonshot-v1-32k"],
		...overrides,
	};
}

/** 自定义供应商速造（已配置：地址 + 非空模型行）。 */
function custom(overrides: Partial<ModelProvider> = {}): ModelProvider {
	return {
		id: "c1",
		name: "自定义供应商",
		type: "custom",
		baseUrl: "https://api.example.com/v1",
		models: [],
		authType: "bearer",
		apiKeySecretId: "sk",
		customModels: [
			{ id: "mc1", modelId: "gpt-x", contextLength: 204800, maxTokens: 65535 },
			{ id: "mc2", modelId: "gpt-y" },
		],
		modelCatalog: ["gpt-x", "gpt-y"],
		...overrides,
	};
}

// ===== 供应商卡投影：头部三件套 + count 显隐规则 + 行 flag 表 =====

interface CardCase {
	name: string;
	provider: ModelProvider;
	activeProviderId: string;
	activeModel: string;
	expected: PresetCardModel | CustomCardModel;
}

const cardCases: CardCase[] = [
	{
		name: "preset：已配置 + count 3 显示 + 当前模型高亮",
		provider: preset(),
		activeProviderId: "p1",
		activeModel: "kimi-latest",
		expected: {
			kind: "preset",
			name: "Kimi（月之暗面）",
			configured: true,
			deletable: false,
			count: { show: true, value: 3 },
			entries: [
				{ modelId: "kimi-latest", stale: false, active: true },
				{ modelId: "moonshot-v1-8k", stale: false, active: false },
				{ modelId: "moonshot-v1-32k", stale: false, active: false },
			],
		},
	},
	{
		name: "preset：未配置不显示计数（显隐规则：预设须已配置）",
		provider: preset({ apiKeySecretId: "" }),
		activeProviderId: "p1",
		activeModel: "",
		expected: {
			kind: "preset",
			name: "Kimi（月之暗面）",
			configured: false,
			deletable: false,
			count: { show: false, value: 3 },
			entries: [
				{ modelId: "kimi-latest", stale: false, active: false },
				{ modelId: "moonshot-v1-8k", stale: false, active: false },
				{ modelId: "moonshot-v1-32k", stale: false, active: false },
			],
		},
	},
	{
		name: "preset：count 0（未拉取）",
		provider: preset({ models: [], modelCatalog: [] }),
		activeProviderId: "p1",
		activeModel: "",
		expected: {
			kind: "preset",
			name: "Kimi（月之暗面）",
			configured: true,
			deletable: false,
			count: { show: false, value: 0 },
			entries: [],
		},
	},
	{
		name: "preset：拉取到空清单 → 全部标「已失效」（#92 空表照实记账）",
		provider: preset({ modelCatalog: [] }),
		activeProviderId: "p1",
		activeModel: "",
		expected: {
			kind: "preset",
			name: "Kimi（月之暗面）",
			configured: true,
			deletable: false,
			count: { show: true, value: 3 },
			entries: [
				{ modelId: "kimi-latest", stale: true, active: false },
				{ modelId: "moonshot-v1-8k", stale: true, active: false },
				{ modelId: "moonshot-v1-32k", stale: true, active: false },
			],
		},
	},
	{
		name: "custom：已配置 + count 2 + 行参数 + 当前模型行高亮",
		provider: custom(),
		activeProviderId: "c1",
		activeModel: "gpt-x",
		expected: {
			kind: "custom",
			name: "自定义供应商",
			configured: true,
			deletable: true,
			count: { show: true, value: 2 },
			rows: [
				{
					rowId: "mc1",
					modelId: "gpt-x",
					params: { contextLength: 204800, maxTokens: 65535 },
					stale: false,
					active: true,
					draft: false,
				},
				{ rowId: "mc2", modelId: "gpt-y", params: {}, stale: false, active: false, draft: false },
			],
		},
	},
	{
		name: "custom：空白草稿行 draft＝true 且不算「当前模型」、不入计数",
		provider: custom({
			customModels: [{ id: "mc0", modelId: "" }, { id: "mc1", modelId: "gpt-x" }],
			modelCatalog: ["gpt-x"],
		}),
		activeProviderId: "c1",
		activeModel: "",
		expected: {
			kind: "custom",
			name: "自定义供应商",
			configured: true,
			deletable: true,
			count: { show: true, value: 1 },
			rows: [
				{ rowId: "mc0", modelId: "", params: {}, stale: false, active: false, draft: true },
				{ rowId: "mc1", modelId: "gpt-x", params: {}, stale: false, active: false, draft: false },
			],
		},
	},
	{
		name: "custom：全部草稿 → 未配置（无启用模型）且 count 0 隐藏",
		provider: custom({ customModels: [{ id: "mc0", modelId: "" }], modelCatalog: [] }),
		activeProviderId: "c1",
		activeModel: "",
		expected: {
			kind: "custom",
			name: "自定义供应商",
			configured: false,
			deletable: true,
			count: { show: false, value: 0 },
			rows: [{ rowId: "mc0", modelId: "", params: {}, stale: false, active: false, draft: true }],
		},
	},
	{
		name: "custom：清单为空 → 非草稿行标「已失效」",
		provider: custom({ modelCatalog: [] }),
		activeProviderId: "c1",
		activeModel: "",
		expected: {
			kind: "custom",
			name: "自定义供应商",
			configured: true,
			deletable: true,
			count: { show: true, value: 2 },
			rows: [
				{ rowId: "mc1", modelId: "gpt-x", params: { contextLength: 204800, maxTokens: 65535 }, stale: true, active: false, draft: false },
				{ rowId: "mc2", modelId: "gpt-y", params: {}, stale: true, active: false, draft: false },
			],
		},
	},
	{
		name: "custom：地址为空 → 未配置，但计数仍显示（custom 恒可显示）",
		provider: custom({ baseUrl: "" }),
		activeProviderId: "c1",
		activeModel: "",
		expected: {
			kind: "custom",
			name: "自定义供应商",
			configured: false,
			deletable: true,
			count: { show: true, value: 2 },
			rows: [
				{ rowId: "mc1", modelId: "gpt-x", params: { contextLength: 204800, maxTokens: 65535 }, stale: false, active: false, draft: false },
				{ rowId: "mc2", modelId: "gpt-y", params: {}, stale: false, active: false, draft: false },
			],
		},
	},
];

for (const c of cardCases) {
	test(`providerCardModel：${c.name}`, () => {
		const info = activeModelInfo({
			providers: [c.provider],
			activeProviderId: c.activeProviderId,
			activeModel: c.activeModel,
		});
		assert.deepEqual(providerCardModel(c.provider, info), c.expected);
	});
}

// ===== 「选择模型」卡投影：分组、孤儿三态、stale 后缀、info 原样携带 =====

test("activeModelCardModel：按 selectable 供应商分组，stale 选项带「已失效」后缀", () => {
	const a = preset({ id: "a", name: "Alpha", modelCatalog: [] });
	const b = custom({ id: "b", name: "Beta" });
	const state = { providers: [a, b], activeProviderId: "a", activeModel: "kimi-latest" };
	const info = activeModelInfo(state);
	const model = activeModelCardModel(state, info, t);

	assert.deepEqual(model.options, [
		{
			providerId: "a",
			providerName: "Alpha",
			models: [
				{ value: "a::kimi-latest", label: `kimi-latest · ${t("model.staleBadge")}`, stale: true },
				{
					value: "a::moonshot-v1-8k",
					label: `moonshot-v1-8k · ${t("model.staleBadge")}`,
					stale: true,
				},
				{
					value: "a::moonshot-v1-32k",
					label: `moonshot-v1-32k · ${t("model.staleBadge")}`,
					stale: true,
				},
			],
		},
		{
			providerId: "b",
			providerName: "Beta",
			models: [
				{ value: "b::gpt-x", label: "gpt-x", stale: false },
				{ value: "b::gpt-y", label: "gpt-y", stale: false },
			],
		},
	]);
	assert.equal(model.selected, "a::kimi-latest");
	assert.equal(model.orphan, false, "已失效模型仍在选项里（保留可选，AC6），不算孤儿");
	assert.equal(model.info, info, "info 原样携带（同一引用，思考组合留给候选 4）");
});

test("activeModelCardModel：孤儿三态——命中 / 不在 options / 无当前模型不算", () => {
	// 命中：当前模型在选项里
	const ok = preset();
	const okState = { providers: [ok], activeProviderId: "p1", activeModel: "kimi-latest" };
	assert.equal(activeModelCardModel(okState, activeModelInfo(okState), t).orphan, false);

	// 不在 options：当前模型所在供应商已不可选（bearer 清空密钥名 → isSelectable false）
	const lost = custom({ apiKeySecretId: "" });
	const lostState = { providers: [lost], activeProviderId: "c1", activeModel: "gpt-x" };
	const lostModel = activeModelCardModel(lostState, activeModelInfo(lostState), t);
	assert.deepEqual(lostModel.options, [], "不可选供应商不进选项");
	assert.equal(lostModel.selected, "c1::gpt-x");
	assert.equal(lostModel.orphan, true);

	// 无当前模型：selected 为空串且不算孤儿（下拉留空即可）
	const emptyState = { providers: [ok], activeProviderId: "p1", activeModel: "" };
	const emptyModel = activeModelCardModel(emptyState, activeModelInfo(emptyState), t);
	assert.equal(emptyModel.selected, "");
	assert.equal(emptyModel.orphan, false);
});

test("activeModelCardModel：无 selectable 供应商 → options 空（视图显示 noModels）", () => {
	const none = preset({ apiKeySecretId: "", models: [], modelCatalog: [] });
	const state = { providers: [none], activeProviderId: "p1", activeModel: "" };
	const model = activeModelCardModel(state, activeModelInfo(state), t);
	assert.deepEqual(model.options, []);
	assert.equal(model.selected, "");
	assert.equal(model.orphan, false);
});
