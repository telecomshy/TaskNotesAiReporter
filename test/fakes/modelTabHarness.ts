/**
 * 「模型配置」Tab 的测试脚手架（#108）：真实 renderModelTab + FakeEl 假 DOM。
 * 只搭环境、不替测试写断言；`fetchGate` 与 `activeModelRefresh` 共用同一份接线。
 *
 * 用真实 renderModelTab 意味着订阅 / 退订也按生产路径走；`dispose` 用于生命周期用例。
 */

import type { App } from "obsidian";
import { renderModelTab, type ModelTabContext } from "../../src/settings/modelTab";
import { createSettingsOwner } from "../../src/settings/owner";
import { createProviderSettings } from "../../src/settings/providerSettings";
import { BUNDLES, createTranslator } from "../../src/i18n";
import { DEFAULT_SETTINGS, type ModelProvider, type TaskNotesAIHelperSettings } from "../../src/types";
import { FakeEl } from "./dom";

export interface ModelTabHarnessOptions {
	/** 唯一的供应商（预设或自定义）。 */
	provider: ModelProvider;
	/** 当前模型 id；缺省空串（未选模型）。 */
	activeModel?: string;
	/** 密钥名 → 密钥值；缺省为空（下拉可选性只校验密钥名，多数用例不需要值）。 */
	secrets?: Record<string, string>;
}

export interface ModelTabHarness {
	root: FakeEl;
	state: TaskNotesAIHelperSettings;
	provider: ModelProvider;
	ctx: ModelTabContext;
	/** 退订顶卡重绘（#108 生命周期用例）。 */
	dispose: () => void;
}

/** 用指定供应商渲染一次「模型配置」Tab，返回根元素、状态与退订函数。 */
export function renderModelTabHarness(options: ModelTabHarnessOptions): ModelTabHarness {
	const provider = options.provider;
	const state = structuredClone(DEFAULT_SETTINGS);
	state.providers = [provider];
	state.activeProviderId = provider.id;
	state.activeModel = options.activeModel ?? "";

	const secrets = options.secrets ?? {};
	const owner = createSettingsOwner(state, {
		save: async () => {},
		getSecret: (id) => secrets[id] ?? null,
	});
	const providers = createProviderSettings({ owner, onSaveError: () => {} });
	const ctx: ModelTabContext = {
		app: {} as App,
		settings: owner.get(),
		providers,
		t: createTranslator(BUNDLES.zh),
		refresh: () => {},
		viewState: { expandedProviders: new Set(), expandedTags: new Set() },
	};

	const root = new FakeEl("div");
	const dispose = renderModelTab(root as unknown as HTMLElement, ctx);
	return { root, state, provider, ctx, dispose };
}
