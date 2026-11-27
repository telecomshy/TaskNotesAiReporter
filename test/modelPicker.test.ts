/**
 * 挑选对话框的界面级回归（#116，ADR-0026）：「当前模型保护」规则此前只有门面层测试，
 * 用户实际看到的勾选框交互没有回归网。本文件用真实 renderModelTab 的 ctx + 真实
 * openModelPicker + FakeEl 假 DOM 驱动按钮与勾选框，只断言用户可见状态
 * （勾选框 / Notice / 确认后的「启用模型」），不触碰私有 `checked` / `rowInputs`。
 *
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/modelPicker.test.ts
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeEl } from "./fakes/dom";
import { renderModelTabHarness, type ModelTabHarness } from "./fakes/modelTabHarness";
import { Modal, notices } from "./fakes/obsidian-stub";
import { openModelPicker } from "../src/settings/modelPicker";
import type { ModelProvider } from "../src/types";

const PROVIDER_ID = "kimi";
const SECRET_NAME = "tnar-kimi-picker";
const MODELS = ["m1", "m2", "m3"];

interface SetupOptions {
	/** 当前模型；缺省空串（没有当前模型）。 */
	activeModel?: string;
	/** 覆盖当前模型的供应商归属（用于「当前模型属于别的供应商」）。 */
	activeProviderId?: string;
}

interface PickerView {
	harness: ModelTabHarness;
	/** 挑选对话框的内容根。 */
	root: FakeEl;
}

/** 渲染真实「模型配置」Tab → 打开真实挑选框 → 交出对话框内容根。 */
function openPicker(options: SetupOptions = {}): PickerView {
	const provider: ModelProvider = {
		id: PROVIDER_ID,
		name: "Kimi（月之暗面）",
		type: "preset",
		baseUrl: "https://api.moonshot.cn/v1",
		models: [...MODELS],
		authType: "bearer",
		apiKeySecretId: SECRET_NAME,
		modelCatalog: [...MODELS],
	};
	const harness = renderModelTabHarness({ provider, activeModel: options.activeModel ?? "" });
	if (options.activeProviderId !== undefined) harness.state.activeProviderId = options.activeProviderId;

	openModelPicker(harness.ctx, harness.provider);
	const modal = Modal.opened[Modal.opened.length - 1];
	assert.ok(modal, "openModelPicker 应打开对话框");
	return { harness, root: modal.contentEl };
}

/** 每行勾选框：模型 id → 勾选框元素。 */
function rowCheckboxes(root: FakeEl): Map<string, FakeEl> {
	const boxes = new Map<string, FakeEl>();
	for (const row of root.querySelectorAll(".tah-model-picker-row")) {
		const input = row.byTag("input")[0];
		const label = row.byTag("span").find((span) => !span.hasClass("tah-stale-badge"));
		assert.ok(input && label, "每一行应有勾选框与模型名");
		boxes.set(label.text, input);
	}
	return boxes;
}

function button(root: FakeEl, cls: string): FakeEl {
	const btn = root.querySelector(cls);
	assert.ok(btn, `未找到 ${cls} 按钮`);
	return btn;
}

function checkedIds(root: FakeEl): string[] {
	return [...rowCheckboxes(root)].filter(([, input]) => input.checked).map(([id]) => id);
}

beforeEach(() => {
	notices.length = 0;
	Modal.opened.length = 0;
});

// ===== 保护规则 1：取消勾选当前模型 → 立即复原 + 提示 =====

test("取消勾选「当前模型」：勾选框立即复原为选中，提示先切换模型，启用集不变", () => {
	const { harness, root } = openPicker({ activeModel: "m2" });
	const checkbox = rowCheckboxes(root).get("m2");
	assert.ok(checkbox);
	assert.equal(checkbox.checked, true, "当前模型初始为选中");

	checkbox.checked = false;
	checkbox.fire("change");

	assert.equal(checkbox.checked, true, "勾选框立即复原为选中");
	assert.ok(
		notices.some((n) => n.includes("请先切换模型")),
		`应提示先切换模型，实际：${JSON.stringify(notices)}`
	);

	// 草稿未被改动：确认后启用集与打开前一致。
	button(root, ".tah-model-picker-confirm").fire("click");
	assert.deepEqual(harness.provider.models, ["m1", "m2", "m3"]);
});

// ===== 保护规则 2：「全不选」也保留当前模型 =====

test("「全不选」：当前模型仍选中，确认后启用集恰为当前模型", () => {
	const { harness, root } = openPicker({ activeModel: "m2" });

	button(root, ".tah-model-picker-select-none").fire("click");

	assert.deepEqual(checkedIds(root), ["m2"], "全不选后只剩当前模型选中");

	button(root, ".tah-model-picker-confirm").fire("click");
	assert.deepEqual(harness.provider.models, ["m2"]);
});

// ===== 全选 =====

test("「全选」：全部选中，确认后启用集为清单全集", () => {
	const { harness, root } = openPicker({ activeModel: "m2" });

	button(root, ".tah-model-picker-select-none").fire("click");
	assert.deepEqual(checkedIds(root), ["m2"]);
	button(root, ".tah-model-picker-select-all").fire("click");

	assert.deepEqual(checkedIds(root), ["m1", "m2", "m3"], "全选后全部选中");

	button(root, ".tah-model-picker-confirm").fire("click");
	// 启用集是清单全集（顺序不属本规格承诺：草稿集合的插入序会因先「全不选」而变）。
	assert.deepEqual(
		[...harness.provider.models].sort(),
		[...MODELS].sort()
	);
});

// ===== 非当前模型可正常取消 =====

test("取消一条非当前模型后确认：启用集不含该模型", () => {
	const { harness, root } = openPicker({ activeModel: "m2" });
	const checkbox = rowCheckboxes(root).get("m3");
	assert.ok(checkbox);

	checkbox.checked = false;
	checkbox.fire("change");
	assert.deepEqual(notices, [], "非当前模型不受保护、不提示");

	button(root, ".tah-model-picker-confirm").fire("click");
	assert.deepEqual(harness.provider.models, ["m1", "m2"]);
});

// ===== 取消不改动启用集 =====

test("改动勾选后点「取消」：启用集一个都不变", () => {
	const { harness, root } = openPicker({ activeModel: "m2" });
	const checkbox = rowCheckboxes(root).get("m1");
	assert.ok(checkbox);

	checkbox.checked = false;
	checkbox.fire("change");
	button(root, ".tah-model-picker-cancel").fire("click");

	assert.deepEqual(harness.provider.models, ["m1", "m2", "m3"]);
});

// ===== 当前模型属于别的供应商 ⇒ 本供应商不误保护 =====

test("当前模型属于别的供应商：本供应商不误保护，「全不选」确认后启用集为空", () => {
	const { harness, root } = openPicker({ activeModel: "m1", activeProviderId: "other" });
	assert.equal(harness.state.activeProviderId, "other");

	button(root, ".tah-model-picker-select-none").fire("click");
	assert.deepEqual(checkedIds(root), [], "不属于本供应商的当前模型不保留");
	assert.deepEqual(notices, [], "不误弹保护提示");

	button(root, ".tah-model-picker-confirm").fire("click");
	assert.deepEqual(harness.provider.models, []);
});
