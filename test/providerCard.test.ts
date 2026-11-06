/**
 * 供应商卡壳 + 模型标签列的 fake DOM 冒烟（#100 step 1）：
 * 卡壳句柄（setName / setCount / setStatus / setExpanded）、折叠初值与切换（viewState
 * 记账回写）、删除按钮声明式出现；标签列「前 2 + 还有 N 个 / 收起」、stale 徽标、
 * active 高亮类。
 *
 * 运行：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test test/providerCard.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	createProviderCard,
	renderModelTagList,
	type ModelTagRow,
	type ModelTabViewState,
} from "../src/settings/providerCard";
import { BUNDLES, createTranslator } from "../src/i18n";
import { FakeEl } from "./fakes/dom";

const t = createTranslator(BUNDLES.zh);

function makeViewState(): ModelTabViewState {
	return { expandedProviders: new Set(), expandedTags: new Set() };
}

function asFake(el: HTMLElement): FakeEl {
	return el as unknown as FakeEl;
}

/** 行速造：[modelId, stale, active]。 */
function makeRows(...specs: Array<[id: string, stale: boolean, active: boolean]>): ModelTagRow[] {
	return specs.map(([modelId, stale, active]) => ({ modelId, stale, active }));
}

// ===== 卡壳句柄：头部同步走句柄，不回查 DOM =====

test("卡壳 setName / setCount / setStatus 同步头部；setCount(null) 隐藏计数", () => {
	const list = new FakeEl("div");
	const card = createProviderCard(list as unknown as HTMLElement, {
		name: "Kimi",
		t,
		viewState: makeViewState(),
		key: "p1",
	});

	card.setName("DeepSeek");
	card.setCount(3);
	card.setStatus(true);

	const el = asFake(card.el);
	assert.equal(el.querySelector(".tah-provider-name")?.textContent, "DeepSeek");
	assert.equal(
		el.querySelector(".tah-provider-count")?.textContent,
		t("model.modelCount", { count: 3 }),
		"计数按文案键呈现"
	);
	assert.ok(el.hasClass("tah-provider-configured"), "已配置时卡带 configured 类");
	assert.equal(el.querySelector(".tah-provider-status")?.textContent, t("model.configured"));

	card.setCount(null);
	assert.equal(el.querySelector(".tah-provider-count")?.textContent, "", "null＝隐藏计数");

	card.setStatus(false);
	assert.equal(el.querySelector(".tah-provider-status")?.textContent, t("model.notConfigured"));
	assert.ok(!el.hasClass("tah-provider-configured"));
});

test("折叠：初值取自 viewState，头部点击切换并回写账本", () => {
	const list = new FakeEl("div");
	const viewState = makeViewState();

	const card = createProviderCard(list as unknown as HTMLElement, {
		name: "A",
		t,
		viewState,
		key: "p1",
	});
	const el = asFake(card.el);
	assert.ok(card.body.hasClass("tah-hidden"), "账本无记录时初始折叠");
	assert.equal(el.querySelector(".tah-provider-arrow")?.text, "▸");

	el.querySelector(".tah-provider-header")!.fire("click");
	assert.ok(!card.body.hasClass("tah-hidden"), "点击展开");
	assert.equal(el.querySelector(".tah-provider-arrow")?.text, "▾");
	assert.ok(viewState.expandedProviders.has("p1"), "toggle 回写账本");

	el.querySelector(".tah-provider-header")!.fire("click");
	assert.ok(card.body.hasClass("tah-hidden"), "再点折叠");
	assert.ok(!viewState.expandedProviders.has("p1"), "账本同步移除");
});

test("账本已有记录的卡初始展开；setExpanded 程序化开合不记账", () => {
	const list = new FakeEl("div");
	const viewState = makeViewState();
	viewState.expandedProviders.add("p2");

	const expanded = createProviderCard(list as unknown as HTMLElement, {
		name: "B",
		t,
		viewState,
		key: "p2",
	});
	assert.ok(!expanded.body.hasClass("tah-hidden"), "账本有记录时初始展开");
	assert.equal(asFake(expanded.el).querySelector(".tah-provider-arrow")?.text, "▾");

	expanded.setExpanded(false);
	assert.ok(expanded.body.hasClass("tah-hidden"));
	assert.ok(viewState.expandedProviders.has("p2"), "程序化开合不记账");
});

test("删除按钮：deletable 才出现，点击只触发 onDelete", () => {
	const list = new FakeEl("div");
	const viewState = makeViewState();

	const plain = createProviderCard(list as unknown as HTMLElement, {
		name: "A",
		t,
		viewState,
		key: "p1",
	});
	assert.equal(
		asFake(plain.el).querySelector(".tah-provider-delete-btn"),
		null,
		"未声明 deletable 无删除按钮"
	);

	let deleted = 0;
	const deletable = createProviderCard(list as unknown as HTMLElement, {
		name: "B",
		deletable: true,
		onDelete: () => deleted++,
		t,
		viewState,
		key: "p2",
	});
	const btn = asFake(deletable.el).querySelector(".tah-provider-delete-btn");
	assert.ok(btn, "声明 deletable 后出现删除按钮");
	btn!.fire("click", { stopPropagation: () => {} });
	assert.equal(deleted, 1, "点击触发 onDelete");
});

// ===== 标签列：「前 2 + 还有 N 个 / 收起」折叠策略唯一实现 =====

test("标签列：默认只显示前 2 个，「还有 N 个」展开全部，「收起」折回", () => {
	const container = new FakeEl("div");
	const toggled: boolean[] = [];
	const rows = makeRows(
		["m1", false, false],
		["m2", false, false],
		["m3", false, false],
		["m4", false, false],
		["m5", false, false]
	);

	renderModelTagList(container as unknown as HTMLElement, rows, {
		expanded: false,
		onToggle: (next) => toggled.push(next),
		t,
	});

	assert.equal(container.querySelectorAll(".tah-model-tag").length, 2, "只显示前 2 个");
	assert.deepEqual(
		container.querySelectorAll(".tah-model-tag").map((tag) => tag.children[0]?.text),
		["m1", "m2"]
	);
	const more = container.querySelector(".tah-model-more");
	assert.ok(more, "有折叠切换");
	assert.equal(more!.text, t("model.moreModels", { count: 3 }));

	more!.fire("click");
	assert.deepEqual(toggled, [true], "onToggle 收到新状态");
	assert.equal(container.querySelectorAll(".tah-model-tag").length, 5, "展开后全部显示");
	assert.equal(
		container.querySelector(".tah-model-more")!.text,
		t("model.collapse"),
		"切换文案变为收起"
	);

	container.querySelector(".tah-model-more")!.fire("click");
	assert.deepEqual(toggled, [true, false]);
	assert.equal(container.querySelectorAll(".tah-model-tag").length, 2, "收起折回前 2 个");
});

test("标签列：恰好 2 个无切换，第 3 个起计数折叠；空行数据渲染为空", () => {
	const two = new FakeEl("div");
	renderModelTagList(
		two as unknown as HTMLElement,
		makeRows(["m1", false, false], ["m2", false, false]),
		{ expanded: false, onToggle: () => {}, t }
	);
	assert.equal(two.querySelectorAll(".tah-model-tag").length, 2);
	assert.equal(two.querySelector(".tah-model-more"), null, "恰好 2 个无切换");

	const three = new FakeEl("div");
	renderModelTagList(
		three as unknown as HTMLElement,
		makeRows(["m1", false, false], ["m2", false, false], ["m3", false, false]),
		{ expanded: false, onToggle: () => {}, t }
	);
	assert.equal(
		three.querySelector(".tah-model-more")!.text,
		t("model.moreModels", { count: 1 }),
		"第 3 个起折叠并计数 1"
	);

	const empty = new FakeEl("div");
	renderModelTagList(empty as unknown as HTMLElement, [], { expanded: false, onToggle: () => {}, t });
	assert.equal(empty.children.length, 0, "空行数据无输出");
});

test("标签列：stale 徽标与 active 高亮类由行数据携带", () => {
	const container = new FakeEl("div");
	renderModelTagList(
		container as unknown as HTMLElement,
		makeRows(["gone", true, false], ["current", false, true]),
		{ expanded: true, onToggle: () => {}, t }
	);

	const [staleTag, activeTag] = container.querySelectorAll(".tah-model-tag");
	assert.ok(staleTag.querySelector(".tah-stale-badge"), "已失效行带徽标");
	assert.equal(staleTag.querySelector(".tah-stale-badge")!.text, t("model.staleBadge"));
	assert.ok(!staleTag.hasClass("tah-model-tag-active"));
	assert.equal(activeTag.querySelector(".tah-stale-badge"), null, "正常行无徽标");
	assert.ok(activeTag.hasClass("tah-model-tag-active"), "当前模型行带高亮类");
	assert.equal(activeTag.children[0]?.text, "current", "标签文本是模型 ID");
});
