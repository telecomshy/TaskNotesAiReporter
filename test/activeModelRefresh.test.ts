/**
 * 回归（#107）：自定义供应商卡里改变「可选模型集合」后，顶部「当前模型」下拉
 * 自动、立即重绘（不切 Tab、不新增「保存」）。断言界面可见行为：下拉里有哪些 option、
 * 值是什么；「是否发生重绘」不可直接看见，只用元素实例恒等作代理，不引用内部函数名
 * 或模块结构。
 *
 * 用真实 renderModelTab + FakeEl 假 DOM 的渲染 / change 缝（先例 test/fetchGate.test.ts）。
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/activeModelRefresh.test.ts
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import { renderModelTab, type ModelTabContext } from "../src/settings/modelTab";
import { createSettingsOwner } from "../src/settings/owner";
import { createProviderSettings } from "../src/settings/providerSettings";
import { BUNDLES, createTranslator } from "../src/i18n";
import {
	DEFAULT_SETTINGS,
	type ModelConfig,
	type ModelProvider,
	type TaskNotesAIHelperSettings,
} from "../src/types";
import { FakeEl } from "./fakes/dom";
import { SecretComponent } from "./fakes/obsidian-stub";

const PROVIDER_ID = "custom-1";
const SECRET_NAME = "tnar-custom-secret";
const BASE_URL = "https://gateway.example/v1";

interface Scenario {
	baseUrl?: string;
	secretId?: string;
	rows?: ModelConfig[];
	activeModel?: string;
}

interface Harness {
	root: FakeEl;
	provider: ModelProvider;
	state: TaskNotesAIHelperSettings;
}

function makeHarness(scenario: Scenario = {}): Harness {
	const provider: ModelProvider = {
		id: PROVIDER_ID,
		name: "自定义供应商",
		type: "custom",
		baseUrl: scenario.baseUrl ?? BASE_URL,
		apiKeySecretId: scenario.secretId ?? SECRET_NAME,
		models: [],
		authType: "bearer",
		customModels: scenario.rows ?? [],
	};
	const state = structuredClone(DEFAULT_SETTINGS);
	state.providers = [provider];
	state.activeProviderId = PROVIDER_ID;
	state.activeModel = scenario.activeModel ?? "";

	const owner = createSettingsOwner(state, {
		save: async () => {},
		// 下拉的「可选」只校验密钥名；密钥值不参与本组用例。
		getSecret: () => null,
	});
	const ctx: ModelTabContext = {
		app: {} as App,
		settings: owner.get(),
		providers: createProviderSettings({ owner }),
		t: createTranslator(BUNDLES.zh),
		refresh: () => {},
		viewState: { expandedProviders: new Set(), expandedTags: new Set() },
	};

	const root = new FakeEl("div");
	renderModelTab(root as unknown as HTMLElement, ctx);
	return { root, provider, state };
}

/** 顶部「选择模型」下拉的全部 option 值（含分组与孤儿占位）。 */
function optionValues(root: FakeEl): string[] {
	const select = root.querySelector(".tah-model-select");
	if (!select) return [];
	return select.byTag("option").map((option) => option.value);
}

/** 「选择模型」下拉的 option 值编码 `providerId::model`：测试侧只在这里写一次。 */
function optionValue(modelId: string): string {
	return `${PROVIDER_ID}::${modelId}`;
}

/** 某个模型行的三个输入框：模型 ID / 上下文长度 / 最大输出。 */
function rowInputs(root: FakeEl): FakeEl[][] {
	return root
		.querySelectorAll(".tah-custom-model-row")
		.map((row) => row.querySelectorAll(".tah-provider-input"));
}

beforeEach(() => {
	SecretComponent.instances.length = 0;
});

// ===== 触发点：模型行新增 / 改名 / 删除 =====

test("添加模型行并填入 ID：不切 Tab，下拉立刻包含该模型（US1 / US14）", () => {
	const h = makeHarness({ rows: [] });
	assert.equal(optionValues(h.root).length, 0, "初始没有可选模型");

	const addBtn = h.root.querySelector(".tah-add-model-btn");
	assert.ok(addBtn, "应有「+ 手动添加模型 ID」按钮");
	addBtn.fire("click");

	const rows = rowInputs(h.root);
	const idInput = rows[rows.length - 1]?.[0];
	assert.ok(idInput, "新增草稿行应有模型 ID 输入框");
	idInput.value = "gw-model";
	idInput.fire("change");

	assert.deepEqual(optionValues(h.root), [optionValue("gw-model")]);
});

test("改名模型：旧值不在下拉、新值在下拉（US2）", () => {
	const h = makeHarness({ rows: [{ id: "mc-1", modelId: "old-model" }] });
	const idInput = rowInputs(h.root)[0][0];
	idInput.value = "new-model";
	idInput.fire("change");

	const values = optionValues(h.root);
	assert.ok(values.includes(optionValue("new-model")), "新值应进入下拉");
	assert.ok(!values.includes(optionValue("old-model")), "旧值应离开下拉");
});

test("删除模型行：下拉立刻不再列出它（US3）", () => {
	const h = makeHarness({
		rows: [
			{ id: "mc-1", modelId: "keep-model" },
			{ id: "mc-2", modelId: "drop-model" },
		],
	});
	const delBtns = h.root.querySelectorAll(".tah-model-del-btn");
	const delBtn = delBtns[delBtns.length - 1];
	assert.ok(delBtn, "应有删除按钮");
	delBtn.fire("click");

	const values = optionValues(h.root);
	assert.ok(values.includes(optionValue("keep-model")));
	assert.ok(!values.includes(optionValue("drop-model")), "删除的行不应仍可被选");
});

// ===== 触发点：凭据 / 地址 / 认证方式 / 方言 =====

test("清空自定义供应商密钥：该供应商整组从下拉消失（US5）", () => {
	const h = makeHarness({
		rows: [{ id: "mc-1", modelId: "gw-model" }],
		activeModel: "gw-model",
	});
	const select = h.root.querySelector(".tah-model-select");
	assert.ok(select, "配置齐备时可由下拉选择");
	assert.equal(
		select!.byTag("optgroup").length,
		1,
		"当前模型所在供应商应作为一个可选项分组出现"
	);

	const secrets = SecretComponent.instances;
	const secret = secrets[secrets.length - 1];
	assert.ok(secret, "未找到密钥控件");
	secret.trigger("");

	assert.equal(
		h.root.querySelector(".tah-model-select"),
		null,
		"唯一供应商不可选后，下拉连同其分组一起消失"
	);
	assert.equal(optionValues(h.root).length, 0, "该供应商的模型不再出现在下拉里");
});

test("改 API 地址：供应商从不可选变为可选后，下拉立刻出现（US4）", () => {
	const h = makeHarness({
		baseUrl: "",
		rows: [{ id: "mc-1", modelId: "gw-model" }],
	});
	assert.equal(optionValues(h.root).length, 0, "地址为空时不可选");

	const urlInput = h.root
		.querySelectorAll(".tah-provider-input")[1];
	assert.ok(urlInput, "应有 API 地址输入框");
	urlInput!.value = BASE_URL;
	urlInput!.fire("change");

	assert.ok(optionValues(h.root).includes(optionValue("gw-model")));
});

test("从「密钥」切到「无认证」：无密钥也可选后下拉立刻出现（US6）", () => {
	const h = makeHarness({
		secretId: "",
		rows: [{ id: "mc-1", modelId: "gw-model" }],
	});
	assert.equal(optionValues(h.root).length, 0, "要求密钥但未选密钥时不可选");

	const authBtns = h.root.querySelectorAll(".tah-auth-btn");
	const noneBtn = authBtns[authBtns.length - 1];
	assert.ok(noneBtn, "应有「无认证」按钮");
	noneBtn.fire("click");

	assert.ok(optionValues(h.root).includes(optionValue("gw-model")));
});

test("切换「接口方言」同样触发顶部重绘（US7）", () => {
	const h = makeHarness({ rows: [{ id: "mc-1", modelId: "gw-model" }] });
	const selectBefore = h.root.querySelector(".tah-model-select");
	assert.ok(selectBefore, "配置齐备时应有下拉");

	const anthropicBtn = h.root.querySelectorAll(".tah-auth-btn")[1];
	assert.ok(anthropicBtn, "应有 Anthropic 方言按钮");
	anthropicBtn.fire("click");

	// 本 harness 下方言不改变可选集合，唯一可观察的触发证据是顶部卡被重建
	//（下拉换了新实例）；它证明刷新被接线，不证明渲染内容更正确。
	const selectAfter = h.root.querySelector(".tah-model-select");
	assert.ok(selectAfter, "方言切换后下拉仍存在");
	assert.notEqual(selectAfter, selectBefore, "切换方言后顶部卡应重绘");
	assert.deepEqual(h.provider.apiStyle, "anthropic", "方言写入状态");
});

// ===== 不触发：不影响可选集合的行参数 =====

test("上下文长度变更不重绘顶部卡（不打断输入；US8）", () => {
	const h = makeHarness({ rows: [{ id: "mc-1", modelId: "gw-model" }] });
	const selectBefore = h.root.querySelector(".tah-model-select");
	assert.ok(selectBefore);

	const contextInput = rowInputs(h.root)[0][1];
	assert.ok(contextInput, "应有上下文长度输入框");
	contextInput.value = "204800";
	contextInput.fire("change");

	// 焦点 / 光标不可自动化（仓库无真实 DOM / 视觉测试）：以「下拉仍是同一元素实例」
	// 作为「顶部未重绘」的代理证据；它不引用任何内部重绘函数名。
	assert.equal(
		h.root.querySelector(".tah-model-select"),
		selectBefore,
		"顶部下拉仍是同一元素实例＝未重绘"
	);
});

// ===== 回归网：重绘后的下拉仍是选择的唯一入口 =====

test("重绘后的「选择模型」下拉仍可正常选中（US13 / 回归网）", () => {
	const h = makeHarness({ rows: [{ id: "mc-1", modelId: "gw-model" }] });
	const select = h.root.querySelector(".tah-model-select");
	assert.ok(select);

	select!.value = optionValue("gw-model");
	select!.fire("change");

	assert.equal(h.state.activeProviderId, PROVIDER_ID);
	assert.equal(h.state.activeModel, "gw-model");
});
