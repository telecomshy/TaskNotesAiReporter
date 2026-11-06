import { test } from "node:test";
import assert from "node:assert/strict";
import {
	enabledModels,
	modelCatalog,
	isModelStale,
	modelParams,
	pickerRows,
	modelRows,
	setEnabledModels,
	setModelCatalog,
	addDraftRow,
	renameRow,
	setRowParams,
	removeRow,
	adoptLegacyCustomModels,
	initializeModelCatalog,
} from "../src/settings/providerModels";
import type { ModelProvider } from "../src/types";

// ===== preset / custom 两工厂 =====
// 读面与清单迁移对两个 adapter 同答：表驱动让同一断言跑在两种持久化形状上，
// adapter 分叉（含 trim 口径）在这张表上无处躲藏。

function preset(over: Partial<ModelProvider> & { id: string }): ModelProvider {
	return {
		name: over.id,
		type: "preset",
		baseUrl: "https://example.com",
		apiKeySecretId: "",
		models: [],
		authType: "bearer",
		...over,
	};
}

function custom(over: Partial<ModelProvider> & { id: string }): ModelProvider {
	return {
		name: over.id,
		type: "custom",
		baseUrl: "https://example.com",
		apiKeySecretId: "",
		models: [],
		authType: "bearer",
		customModels: [],
		...over,
	};
}

interface Adapter {
	kind: "preset" | "custom";
	make: (over: Partial<ModelProvider> & { id: string }) => ModelProvider;
	/** 给该 adapter 装上一组启用模型（按模型 id；custom 行的 modelId 原样写入，不预 trim）。 */
	withEnabled: (p: ModelProvider, ids: string[]) => ModelProvider;
}

const BOTH: Adapter[] = [
	{
		kind: "preset",
		make: preset,
		withEnabled: (p, ids) => ({ ...p, models: ids }),
	},
	{
		kind: "custom",
		make: custom,
		withEnabled: (p, ids) => ({
			...p,
			customModels: ids.map((modelId, i) => ({ id: `mc${i}`, modelId })),
		}),
	},
];

// ===== 读面（按模型 id） =====

test("enabledModels 预设取挑选集", () => {
	assert.deepEqual(enabledModels(preset({ id: "p", models: ["a", "b"] })), ["a", "b"]);
});

test("enabledModels 自定义由模型行派生：统一 trim、滤全空白", () => {
	const p = custom({
		id: "c",
		customModels: [
			{ id: "1", modelId: " m1 " },
			{ id: "2", modelId: "  " },
			{ id: "3", modelId: "m2" },
		],
	});
	assert.deepEqual(enabledModels(p), ["m1", "m2"], "trim 后交付（#99 读侧保险）");
});

test("modelCatalog 缺失清单读作空清单（#87）", () => {
	for (const { kind, make } of BOTH) {
		assert.deepEqual(modelCatalog(make({ id: "p" })), [], kind);
	}
	assert.deepEqual(modelCatalog(preset({ id: "p", modelCatalog: ["x"] })), ["x"]);
});

// isModelStale：两 adapter × 五种情形表驱动（#87 / #92）
const STALE_CASES = [
	{
		name: "已启用但不在清单 → 已失效（上游消失）",
		enabled: ["a", "gone"],
		catalog: ["a", "b"] as string[] | undefined,
		query: "gone",
		stale: true,
	},
	{ name: "仍在清单内不失效", enabled: ["a", "gone"], catalog: ["a", "b"], query: "a", stale: false },
	{
		name: "从未拉取（清单缺失）不标失效",
		enabled: ["hand"],
		catalog: undefined,
		query: "hand",
		stale: false,
	},
	{
		name: "拉取到空清单（#92）：启用模型照实标「已失效」",
		enabled: ["a", "b"],
		catalog: [] as string[] | undefined,
		query: "a",
		stale: true,
	},
	{ name: "未启用的模型不谈失效", enabled: ["a"], catalog: ["a"], query: "b", stale: false },
];

for (const { kind, make, withEnabled } of BOTH) {
	for (const c of STALE_CASES) {
		test(`isModelStale（${kind}）${c.name}`, () => {
			const base = c.catalog === undefined ? make({ id: "p" }) : make({ id: "p", modelCatalog: c.catalog });
			const p = withEnabled(base, c.enabled);
			assert.equal(isModelStale(p, c.query), c.stale);
		});
	}
}

test("modelParams 预设恒空", () => {
	assert.deepEqual(modelParams(preset({ id: "p", models: ["m"] }), "m"), {});
});

test("modelParams 自定义：带出该行参数；未设置的键不出现", () => {
	const p = custom({
		id: "c",
		customModels: [
			{ id: "1", modelId: "m", contextLength: 4096, maxTokens: 2048 },
			{ id: "2", modelId: "bare" },
		],
	});
	assert.deepEqual(modelParams(p, "m"), { contextLength: 4096, maxTokens: 2048 });
	assert.deepEqual(modelParams(p, "bare"), {}, "行存在但未设参数 → 空");
	assert.deepEqual(modelParams(p, "gone"), {}, "模型不存在 → 空");
});

for (const { kind, make, withEnabled } of BOTH) {
	test(`pickerRows（${kind}）：清单序在前、清单外启用（已失效）追加在后、去重`, () => {
		const p = withEnabled(make({ id: "p", modelCatalog: ["c1", "c2"] }), ["stale", "c1"]);
		assert.deepEqual(pickerRows(p), ["c1", "c2", "stale"], "c1 在清单序出现一次，不重复");
	});
}

test("modelRows 预设无模型行：返回空数组", () => {
	assert.deepEqual(modelRows(preset({ id: "p", models: ["a"] })), []);
});

test("modelRows 自定义：行 id + trim 后模型 id + 参数", () => {
	const p = custom({
		id: "c",
		customModels: [
			{ id: "mc1", modelId: " m1 ", contextLength: 4096 },
			{ id: "mc2", modelId: "" },
		],
	});
	assert.deepEqual(modelRows(p), [
		{ rowId: "mc1", modelId: "m1", params: { contextLength: 4096 } },
		{ rowId: "mc2", modelId: "", params: {} },
	]);
});

// ===== 写面（存储级原语；行编辑按 rowId） =====

test("setEnabledModels 预设：挑选集整体替换启用集（coerce 去空白去重）", () => {
	const p = preset({ id: "p", models: ["a"] });
	setEnabledModels(p, [" b ", "b", ""]);
	assert.deepEqual(p.models, ["b"]);
});

test("setEnabledModels 自定义：取消挑选移出模型行，保留行的 id 与参数", () => {
	const p = custom({
		id: "c",
		customModels: [
			{ id: "mc1", modelId: "a", contextLength: 4096 },
			{ id: "mc2", modelId: "b" },
		],
	});
	setEnabledModels(p, ["a", "n"]);
	const rows = p.customModels!;
	assert.equal(rows.length, 2);
	assert.equal(rows[0].id, "mc1", "保留行不换 id");
	assert.equal(rows[0].modelId, "a");
	assert.equal(rows[0].contextLength, 4096, "保留行参数不丢");
	assert.equal(rows[1].modelId, "n", "新挑选的模型行排在后面");
});

test("setEnabledModels 自定义：新挑选的补出空参数行；空白草稿行不动", () => {
	const p = custom({ id: "c", customModels: [{ id: "mc0", modelId: "  " }] });
	setEnabledModels(p, ["n"]);
	assert.equal(p.customModels!.length, 2);
	assert.equal(p.customModels![0].id, "mc0", "空白草稿行原样保留");
	assert.equal(p.customModels![1].modelId, "n");
	assert.equal(p.customModels![1].contextLength, undefined);
});

for (const { kind, make, withEnabled } of BOTH) {
	test(`setModelCatalog（${kind}）：只刷清单，启用集不动`, () => {
		const p = withEnabled(make({ id: "p", modelCatalog: ["old"] }), ["kept"]);
		setModelCatalog(p, ["kept", "fresh"]);
		assert.deepEqual(p.modelCatalog, ["kept", "fresh"]);
		assert.deepEqual(enabledModels(p), ["kept"], "启用集不因刷清单改动");
	});

	test(`setModelCatalog（${kind}）：空列表照实刷为空清单（#92 定性：空表是正常状态）`, () => {
		const p = withEnabled(make({ id: "p", modelCatalog: ["a"] }), ["a"]);
		setModelCatalog(p, []);
		assert.deepEqual(p.modelCatalog, []);
	});

	test(`setModelCatalog（${kind}）：清洗清单——去空白、去重、剔除非字符串`, () => {
		const p = make({ id: "p" });
		setModelCatalog(p, [" a ", "a", "", "  ", 123 as unknown as string, "b"]);
		assert.deepEqual(p.modelCatalog, ["a", "b"]);
	});
}

test("addDraftRow 自定义：追加一条空白草稿行", () => {
	const p = custom({ id: "c", customModels: [] });
	addDraftRow(p);
	assert.equal(p.customModels!.length, 1);
	assert.equal(p.customModels![0].modelId, "");
	assert.notEqual(p.customModels![0].id, "", "行 id 已铸造");
});

test("addDraftRow 预设：无模型行概念，不动", () => {
	const p = preset({ id: "p", models: [] });
	addDraftRow(p);
	assert.equal(p.customModels, undefined);
});

test("renameRow 返回 trim 后的新旧 id，供命令层迁移按模型键的数据", () => {
	const p = custom({ id: "c", customModels: [{ id: "mc1", modelId: " m1 " }] });
	assert.deepEqual(renameRow(p, "mc1", "  m2  "), { from: "m1", to: "m2" });
	assert.equal(p.customModels![0].modelId, "m2");
});

test("renameRow 行不存在：返回 null，存储不动", () => {
	const p = custom({ id: "c", customModels: [{ id: "mc1", modelId: "m1" }] });
	assert.equal(renameRow(p, "ghost", "x"), null);
	assert.deepEqual(p.customModels, [{ id: "mc1", modelId: "m1" }]);
});

test("renameRow 改成纯空白＝草稿行（to 为空串）", () => {
	const p = custom({ id: "c", customModels: [{ id: "mc1", modelId: "m1" }] });
	assert.deepEqual(renameRow(p, "mc1", "   "), { from: "m1", to: "" });
	assert.equal(p.customModels![0].modelId, "");
});

test("setRowParams 覆盖传入的键（部分覆盖）", () => {
	const p = custom({ id: "c", customModels: [{ id: "mc1", modelId: "m" }] });
	setRowParams(p, "mc1", { contextLength: 131072 });
	setRowParams(p, "mc1", { maxTokens: 4096 });
	assert.equal(p.customModels![0].contextLength, 131072);
	assert.equal(p.customModels![0].maxTokens, 4096);
});

test("setRowParams 行不存在：不动", () => {
	const p = custom({ id: "c", customModels: [] });
	setRowParams(p, "ghost", { contextLength: 1 });
	assert.deepEqual(p.customModels, []);
});

test("removeRow 按 rowId 删行；行不存在（含已删）返回 false", () => {
	const p = custom({
		id: "c",
		customModels: [
			{ id: "mc1", modelId: "a" },
			{ id: "mc2", modelId: "b" },
		],
	});
	assert.equal(removeRow(p, "mc1"), true);
	assert.deepEqual(
		p.customModels!.map((m) => m.id),
		["mc2"]
	);
	assert.equal(removeRow(p, "mc1"), false);
});

// ===== 迁移面（载入编排调用） =====

test("adoptLegacyCustomModels：旧 models 数组 → 模型行，写入即 trim（保险二）", () => {
	const p = custom({ id: "c" });
	adoptLegacyCustomModels(p, [" m1 ", "m2", "  "]);
	assert.deepEqual(
		p.customModels!.map((m) => m.modelId),
		["m1", "m2", ""],
		"trim 后写入；纯空白项成为草稿行"
	);
	assert.ok(p.customModels!.every((m) => m.id !== ""), "每行铸造新行 id");
});

for (const { kind, make, withEnabled } of BOTH) {
	test(`initializeModelCatalog（${kind}）：清单缺失 ⇒ 初值＝启用集（trim 后，#87）`, () => {
		const p = withEnabled(make({ id: "p" }), ["a", " b "]);
		initializeModelCatalog(p, undefined);
		assert.deepEqual(p.modelCatalog, ["a", "b"]);
	});

	test(`initializeModelCatalog（${kind}）：已有清单只清洗，不并入启用集（已失效跨载入存活）`, () => {
		const p = withEnabled(make({ id: "p", modelCatalog: ["x"] }), ["a"]);
		initializeModelCatalog(p, [" x ", "x", "y"]);
		assert.deepEqual(p.modelCatalog, ["x", "y"]);
	});
}

// ===== trim 误标回归（#99 验收） =====

test("trim 回归：带空白的 legacy modelId 经迁移后不误标「已失效」", () => {
	const p = custom({ id: "c" });
	adoptLegacyCustomModels(p, [" m1 "]); // 保险二：迁移写入即 trim
	initializeModelCatalog(p, undefined); // 清单初值＝启用集
	assert.deepEqual(enabledModels(p), ["m1"]);
	assert.deepEqual(p.modelCatalog, ["m1"]);
	assert.equal(isModelStale(p, "m1"), false, "启用集与清单同为 trim 后 id，不再错位");
});

test("trim 回归：存量未 trim 行（旧版迁移产物）经读侧归一后不误标「已失效」", () => {
	const p = custom({ id: "c", customModels: [{ id: "mc1", modelId: " m1 " }] });
	initializeModelCatalog(p, undefined); // 保险一：读侧统一 trim 后再算初值
	assert.deepEqual(p.modelCatalog, ["m1"]);
	assert.equal(isModelStale(p, "m1"), false);
});

test("trim 回归：存量未 trim 行按模型 id 寻址参数不丢失（modelParams 身份比对）", () => {
	const p = custom({
		id: "c",
		customModels: [{ id: "mc1", modelId: " m1 ", contextLength: 4096, maxTokens: 2048 }],
	});
	assert.deepEqual(modelParams(p, "m1"), { contextLength: 4096, maxTokens: 2048 });
	assert.deepEqual(modelParams(p, " m1 "), { contextLength: 4096, maxTokens: 2048 });
});
