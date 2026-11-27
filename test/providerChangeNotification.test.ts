/**
 * 契约（#108）：供应商门面的变更通知——每条写命令发布自己的类别，
 * `selectable` 命令必须被视图当作「顶卡可能变化」，`quiet` 命令（行参数 / 改名）不触发顶卡重绘。
 * 退订后不再回调。
 *
 * 断言公开接口行为：订阅者收到哪个类别、退订后还收不收；不检查内部如何调用命令。
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/providerChangeNotification.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createProviderSettings,
	type ProviderChangeKind,
	type ProviderSettings,
} from "../src/settings/providerSettings";
import { createSettingsOwner } from "../src/settings/owner";
import { DEFAULT_SETTINGS, type LearnedCapability, type ModelProvider } from "../src/types";
import { flush } from "./fakes/flush";

const PROVIDER_ID = "custom-1";
const ROW_ID = "mc-1";

const LEARNED: LearnedCapability = {
	verdict: "not-detected",
	testedAt: "2026-11-25T00:00:00.000Z",
};

interface FacadeOptions {
	/** 提供时落盘以该错误拒绝（缺省落盘成功）。 */
	saveError?: unknown;
	/** 落盘失败上报；缺省不关心（仅防未处理拒绝）。 */
	onSaveError?: (error: unknown) => void;
}

function makeFacade(options: FacadeOptions = {}): ProviderSettings {
	const provider: ModelProvider = {
		id: PROVIDER_ID,
		name: "自定义供应商",
		type: "custom",
		baseUrl: "https://gateway.example/v1",
		apiKeySecretId: "secret",
		models: [],
		authType: "bearer",
		customModels: [{ id: ROW_ID, modelId: "m" }],
	};
	const state = structuredClone(DEFAULT_SETTINGS);
	state.providers = [provider];
	state.activeProviderId = PROVIDER_ID;
	state.activeModel = "";
	const owner = createSettingsOwner(state, {
		save: async () => {
			if (options.saveError !== undefined) throw options.saveError;
		},
		getSecret: () => null,
	});
	return createProviderSettings({ owner, onSaveError: options.onSaveError ?? (() => {}) });
}

interface CommandCase {
	name: string;
	kind: ProviderChangeKind;
	run: (providers: ProviderSettings) => void;
}

/** 分类表（#108 规格的验收基准）：每条写命令恰好发布一次自己的类别。 */
const CASES: CommandCase[] = [
	{
		name: "setProviderName",
		kind: "quiet",
		run: (p) => p.setProviderName(PROVIDER_ID, "改名"),
	},
	{
		name: "setProviderBaseUrl",
		kind: "selectable",
		run: (p) => p.setProviderBaseUrl(PROVIDER_ID, "https://new.example/v1"),
	},
	{
		name: "setSecretId",
		kind: "selectable",
		run: (p) => p.setSecretId(PROVIDER_ID, "next-secret"),
	},
	{
		name: "setProviderApiStyle",
		kind: "selectable",
		run: (p) => p.setProviderApiStyle(PROVIDER_ID, "anthropic"),
	},
	{
		name: "setAuthType",
		kind: "selectable",
		run: (p) => p.setAuthType(PROVIDER_ID, "none"),
	},
	{
		name: "addProvider",
		kind: "layout",
		run: (p) => p.addProvider(),
	},
	{
		name: "removeProvider",
		kind: "layout",
		run: (p) => p.removeProvider(PROVIDER_ID),
	},
	{
		name: "refreshModelCatalog",
		kind: "layout",
		run: (p) => p.refreshModelCatalog(PROVIDER_ID, ["m", "m2"]),
	},
	{
		name: "applyPickedModels",
		kind: "layout",
		run: (p) => p.applyPickedModels(PROVIDER_ID, ["m2"]),
	},
	{
		name: "addModel",
		kind: "selectable",
		run: (p) => p.addModel(PROVIDER_ID),
	},
	{
		name: "renameModel",
		kind: "selectable",
		run: (p) => p.renameModel(PROVIDER_ID, ROW_ID, "m2"),
	},
	{
		name: "setModelParams",
		kind: "quiet",
		run: (p) => p.setModelParams(PROVIDER_ID, ROW_ID, { contextLength: 204800 }),
	},
	{
		name: "removeModel",
		kind: "selectable",
		run: (p) => p.removeModel(PROVIDER_ID, ROW_ID),
	},
	{
		name: "setModelThinking",
		kind: "layout",
		run: (p) => p.setModelThinking(PROVIDER_ID, "m", "on"),
	},
	{
		name: "recordThinkingTest",
		kind: "layout",
		run: (p) => p.recordThinkingTest(PROVIDER_ID, "m", LEARNED),
	},
	{
		name: "clearLearnedThinking",
		kind: "layout",
		run: (p) => p.clearLearnedThinking(PROVIDER_ID, "m"),
	},
	{
		name: "selectActiveModel",
		kind: "layout",
		run: (p) => p.selectActiveModel(PROVIDER_ID, "m"),
	},
];

for (const c of CASES) {
	test(`${c.name}：恰好发布一次 ${c.kind}`, () => {
		const providers = makeFacade();
		const kinds: ProviderChangeKind[] = [];
		providers.subscribe((kind) => kinds.push(kind));

		c.run(providers);

		assert.deepEqual(kinds, [c.kind], `${c.name} 应发布一次 ${c.kind}，实际：${JSON.stringify(kinds)}`);
	});
}

test("落盘失败：发布照常且上报被调（失败不回滚刷新，ADR-0029 / ADR-0034）", async () => {
	const saveError = new Error("disk full");
	const errors: unknown[] = [];
	const providers = makeFacade({ saveError, onSaveError: (error) => errors.push(error) });
	const kinds: ProviderChangeKind[] = [];
	providers.subscribe((kind) => kinds.push(kind));

	assert.doesNotThrow(() => providers.setProviderBaseUrl(PROVIDER_ID, "https://new.example/v1"));

	assert.deepEqual(kinds, ["selectable"], "发布先于落盘完成，失败不回滚刷新");

	await flush();

	assert.equal(errors.length, 1, "onSaveError 恰好被调一次");
	assert.equal(errors[0], saveError, "上报携带原错误");
});

test("退订后不再收到通知（生命周期）", () => {
	const providers = makeFacade();
	const kinds: ProviderChangeKind[] = [];
	const dispose = providers.subscribe((kind) => kinds.push(kind));

	providers.setProviderBaseUrl(PROVIDER_ID, "https://a.example/v1");
	assert.deepEqual(kinds, ["selectable"]);

	dispose();
	providers.setProviderBaseUrl(PROVIDER_ID, "https://b.example/v1");
	assert.deepEqual(kinds, ["selectable"], "退订后不应再收到回调");
});

test("多个订阅者各自收到通知，退订只影响自己", () => {
	const providers = makeFacade();
	const first: ProviderChangeKind[] = [];
	const second: ProviderChangeKind[] = [];
	const disposeFirst = providers.subscribe((kind) => first.push(kind));
	providers.subscribe((kind) => second.push(kind));

	providers.addModel(PROVIDER_ID);
	assert.deepEqual([...first], ["selectable"]);
	assert.deepEqual([...second], ["selectable"], "两个订阅者都应收到");

	disposeFirst();
	providers.addModel(PROVIDER_ID);
	assert.deepEqual(first, ["selectable"], "已退订的订阅者不再收到");
	assert.deepEqual(second, ["selectable", "selectable"], "未退订的订阅者继续收到");
});
