/**
 * 回归（#90）：「获取模型列表」的手动按钮是获取模型的唯一入口——
 * 打开设置页 / 密钥变更不再有任何自动拉取；未配置（密钥名为空）的预设供应商无启用模型。
 *
 * 用真实 renderModelTab + 真实点击 / 密钥变更处理函数驱动，网络层用 obsidian-stub 记录。
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/fetchGate.test.ts
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderModelTab } from "../src/settings/modelTab";
import { createSettingsOwner } from "../src/settings/owner";
import { createProviderSettings } from "../src/settings/providerSettings";
import { BUNDLES, createTranslator } from "../src/i18n";
import { DEFAULT_SETTINGS, type ModelProvider, type TaskNotesAIHelperSettings } from "../src/types";
import { FakeEl } from "./fakes/dom";
import { Modal, SecretComponent, notices, requests, resetRequests } from "./fakes/obsidian-stub";

const PROVIDER_ID = "kimi";
const SECRET_NAME = "tnar-kimi-abc";
const BASE_URL = "https://api.moonshot.cn/v1";
const MODELS = ["kimi-latest", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"];

interface Scenario {
	/** 状态名（断言失败时的可读标签）。 */
	name: string;
	/** 设置里的密钥名（空串＝未配置）。 */
	secretId: string;
	/** SecretStorage 内容：密钥名 → 密钥值。 */
	secrets: Record<string, string>;
	/** 初始启用模型（未配置时应为空；有值用于验证清空联动）。 */
	models?: string[];
}

interface Harness {
	root: FakeEl;
	provider: ModelProvider;
	state: TaskNotesAIHelperSettings;
}

function makeHarness(scenario: Scenario): Harness {
	const models = scenario.models ?? MODELS;
	const provider: ModelProvider = {
		id: PROVIDER_ID,
		name: "Kimi（月之暗面）",
		type: "preset",
		baseUrl: BASE_URL,
		models: [...models],
		authType: "bearer",
		apiKeySecretId: scenario.secretId,
		modelCatalog: [...MODELS],
	};
	const state = structuredClone(DEFAULT_SETTINGS);
	state.providers = [provider];
	state.activeProviderId = PROVIDER_ID;
	state.activeModel = "";

	const secrets = scenario.secrets;
	const owner = createSettingsOwner(state, {
		save: async () => {},
		getSecret: (id) => secrets[id] ?? null,
	});
	const ctx = {
		app: {},
		plugin: {
			t: createTranslator(BUNDLES.zh),
			settings: owner.get(),
			providers: createProviderSettings({ owner }),
		},
		refresh: () => {},
	};

	const root = new FakeEl("div");
	renderModelTab(root as unknown as HTMLElement, ctx as never);
	return { root, provider, state };
}

/** 等可能的异步链走完。 */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 5));
}

function fetchButton(root: FakeEl): FakeEl {
	const btn = root.querySelector(".tah-fetch-models-btn");
	assert.ok(btn, "未找到「获取模型列表」按钮");
	return btn;
}

function modelTagTexts(root: FakeEl): string[] {
	return root.querySelectorAll(".tah-model-tag").map((el) => el.children[0]?.text ?? "");
}

function resetFakes(): void {
	notices.length = 0;
	SecretComponent.instances.length = 0;
	Modal.opened.length = 0;
	resetRequests();
}

beforeEach(resetFakes);

// ===== 唯一入口：打开设置页 / 密钥变更不自动拉取 =====

test("打开设置页（渲染）不自动拉取：任何密钥状态下网络层零请求", async () => {
	const scenarios: Scenario[] = [
		{ name: "未配置（密钥名为空）", secretId: "", secrets: {} },
		{ name: "密钥名与密钥值齐备", secretId: SECRET_NAME, secrets: { [SECRET_NAME]: "sk-live" } },
		{ name: "密钥名已选、密钥值缺失", secretId: SECRET_NAME, secrets: {} },
	];
	for (const scenario of scenarios) {
		resetFakes();
		makeHarness(scenario);
		await flush();
		assert.equal(requests.length, 0, `${scenario.name}：渲染不应发起拉取请求`);
	}
});

test("密钥变更不自动拉取：改选 / 清空密钥名均不发起请求", async () => {
	makeHarness({ name: "未配置", secretId: "", secrets: { [SECRET_NAME]: "sk-live" } });
	await flush();
	const secret = SecretComponent.instances[SecretComponent.instances.length - 1];
	assert.ok(secret, "未找到密钥控件");

	secret.trigger(SECRET_NAME);
	await flush();
	assert.equal(requests.length, 0, "改选密钥名不应发起拉取请求");

	secret.trigger("");
	await flush();
	assert.equal(requests.length, 0, "清空密钥名不应发起拉取请求");
});

// ===== 手动「获取模型列表」：守卫与成功路径不变 =====

test("手动按钮守卫与成功路径不变", async () => {
	// 未配置：提示「请先选择 API 密钥」
	resetFakes();
	let h = makeHarness({ name: "未配置", secretId: "", secrets: {} });
	await flush();
	fetchButton(h.root).fire("click");
	await flush();
	assert.ok(notices.includes("请先选择 API 密钥"), `实际提示：${JSON.stringify(notices)}`);
	assert.equal(requests.length, 0);

	// 密钥值缺失：提示「在密钥存储中找不到所选密钥」
	resetFakes();
	h = makeHarness({ name: "密钥值缺失", secretId: SECRET_NAME, secrets: {} });
	await flush();
	fetchButton(h.root).fire("click");
	await flush();
	assert.ok(notices.includes("在密钥存储中找不到所选密钥"), `实际提示：${JSON.stringify(notices)}`);
	assert.equal(requests.length, 0);

	// 齐备：拉取成功后弹出挑选对话框
	resetFakes();
	resetRequests({ status: 200, json: { data: MODELS.map((id) => ({ id })) } });
	h = makeHarness({ name: "齐备", secretId: SECRET_NAME, secrets: { [SECRET_NAME]: "sk-live" } });
	await flush();
	fetchButton(h.root).fire("click");
	await flush();
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, `${BASE_URL}/models`);
	assert.equal(requests[0].headers.Authorization, "Bearer sk-live");
	assert.equal(Modal.opened.length, 1, "手动拉取成功后弹出挑选对话框");
});

// ===== 供应商卡片模型标签仅展示（#91）：选择唯一入口是「选择模型」下拉 =====

test("点击供应商卡片的模型标签不改「当前模型」（仅做列表展示）", async () => {
	const h = makeHarness({ name: "已配置", secretId: SECRET_NAME, secrets: { [SECRET_NAME]: "sk-live" } });
	await flush();
	const tag = h.root.querySelector(".tah-model-tag");
	assert.ok(tag, "应有模型标签");
	tag.fire("click");
	await flush();
	assert.equal(h.state.activeModel, "", "点击标签不应选中模型");
	assert.equal(h.state.activeProviderId, PROVIDER_ID, "「当前模型」的供应商不应被标签点击改动");
});

test("「选择模型」下拉是选择的唯一入口：change 即选中", async () => {
	const h = makeHarness({ name: "已配置", secretId: SECRET_NAME, secrets: { [SECRET_NAME]: "sk-live" } });
	await flush();
	const select = h.root.querySelector(".tah-model-select");
	assert.ok(select, "应有「选择模型」下拉");
	select.value = `${PROVIDER_ID}::${MODELS[1]}`;
	select.fire("change");
	await flush();
	assert.equal(h.state.activeProviderId, PROVIDER_ID);
	assert.equal(h.state.activeModel, MODELS[1], "下拉 change 应选中该模型");
});

test("模型列表为空（如 Kimi For Coding 密钥）：提示「密钥下无可用模型」，不弹挑选框", async () => {
	resetRequests({ status: 200, json: { object: "list", data: [] } });
	const h = makeHarness({ name: "齐备", secretId: SECRET_NAME, secrets: { [SECRET_NAME]: "sk-coding" } });
	await flush();
	fetchButton(h.root).fire("click");
	await flush();

	assert.equal(requests.length, 1);
	assert.equal(Modal.opened.length, 0, "空列表不弹挑选框");
	assert.deepEqual(h.provider.modelCatalog, [], "空表照实记账：清单刷为空（#92 定性，空表是正常状态）");
	assert.ok(
		notices.some((n) => n.includes("没有可用模型") && n.includes("Kimi")),
		`应提示「该密钥下没有可用模型」并带供应商名，实际：${JSON.stringify(notices)}`
	);
});

// ===== 未配置 ⇒ 无启用模型（清空联动在 UI 层可见） =====

test("清空密钥名：卡片立即不再显示启用模型", async () => {
	const h = makeHarness({ name: "已配置", secretId: SECRET_NAME, secrets: { [SECRET_NAME]: "sk-live" } });
	await flush();
	assert.equal(modelTagTexts(h.root).length, 2, "已配置时显示启用模型（前 2 个 + 折叠）");

	const secret = SecretComponent.instances[SecretComponent.instances.length - 1];
	assert.ok(secret, "未找到密钥控件");
	secret.trigger("");
	await flush();

	assert.deepEqual(modelTagTexts(h.root), [], "清空密钥名后应无启用模型");
	assert.deepEqual(h.provider.models, [], "启用集被清空");
});
