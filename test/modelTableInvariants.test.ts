/**
 * 三张同构表的交叉排序不变式执法面（#114，ADR-0035）。
 *
 * 三张表（协议 / 请求策略 / 思考能力）各自分家，但「Responses 路由的模型不得命中 Chat
 * 形态参数」是跨表不变式：新增一个 Responses-only 族要同步改协议行、能力表显式未知挡位行、
 * 清单放回三处，漏一处或顺序错就会把顶层 `reasoning_effort` 发到 `/responses`。
 *
 * 本测试不登记具体模型族：遍历协议表每一行，机械造「见证模型」（精确 ID 原样、
 * `*` 结尾→前缀+`any`、`*` 开头→`any`+后缀、单独 `*`→`model-x`），先自检它确实由该行首个命中、
 * 再驱动生产组合缝 `resolveModelFacts` / `probeOffCandidates` / `filterModelCatalog`；
 * 同一套允许形状集再扫全表 `switchable` 行的 `off` / `on`。失败信息带（供应商, pattern, 协议），
 * 一处红能直接定位漏改的表。
 *
 * 允许形状集（ADR-0035）：OpenAI-Chat＝顶层 `thinking` / `enable_thinking` / `reasoning_effort`；
 * OpenAI-Responses＝只有嵌套 `reasoning.effort`；Anthropic＝只有顶层 `thinking`。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiStyle, ModelProvider, ThinkingParam, WireProtocol } from "../src/types";
import { THINKING_CAPABILITIES } from "../src/core/thinking";
import { matchModelPattern } from "../src/core/modelPattern";
import { WIRE_PROTOCOLS, resolveWireProtocol, type WireProtocolRow } from "../src/core/wireProtocol";
import { filterModelCatalog } from "../src/core/modelCatalogFilter";
import { probeOffCandidates, resolveModelFacts } from "../src/ai/modelRequest";

/** 参数形状：按字段名与携带形态判别（顶层 vs 嵌套），与协议同构。 */
type ParamShape = "thinking" | "enable_thinking" | "reasoning_effort" | "reasoning";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** 参数形态归类：不在四种已知形状内返回 null（视为表写错）。 */
function shapeOf(param: ThinkingParam): ParamShape | null {
	const value = param.value;
	if (param.name === "thinking" && isRecord(value) && typeof value.type === "string") return "thinking";
	if (param.name === "enable_thinking" && typeof value === "boolean") return "enable_thinking";
	if (param.name === "reasoning_effort" && typeof value === "string") return "reasoning_effort";
	if (param.name === "reasoning" && isRecord(value) && typeof value.effort === "string") return "reasoning";
	return null;
}

/** 某（方言, 协议）允许的形状集（ADR-0035）：Responses 只有嵌套 `reasoning.effort`。 */
function allowedShapes(apiStyle: ApiStyle, protocol?: WireProtocol): ReadonlySet<ParamShape> {
	if (apiStyle === "anthropic") return new Set<ParamShape>(["thinking"]);
	if (protocol === "responses") return new Set<ParamShape>(["reasoning"]);
	return new Set<ParamShape>(["thinking", "enable_thinking", "reasoning_effort"]);
}

/** 见证模型造名规则（#114）：`*` 结尾→前缀 + any；`*` 开头→any + 后缀；单独 `*`→model-x；精确原样。 */
function witnessModel(pattern: string): string {
	if (pattern === "*") return "model-x";
	if (pattern.startsWith("*")) return `any${pattern.slice(1)}`;
	if (pattern.endsWith("*")) return `${pattern.slice(0, -1)}any`;
	return pattern;
}

/**
 * OpenAI 清单只认 `gpt-*`（modelCatalogFilter）；见证模型必须能选进清单，
 * 否则「路由到 Responses 却选不进清单」这条断言就永远为真。后缀族补 `gpt-` 前缀。
 */
function catalogWitness(providerId: string, witness: string): string {
	if (providerId === "openai" && !witness.startsWith("gpt-")) return `gpt-${witness}`;
	return witness;
}

/**
 * 协议行的全部见证模型：基础造名 ＋ 与同供应商前缀能力行的交叉造名。
 * 交叉造名让「显式未知挡位行被挪到通用前缀行之后」也变红（如 `gpt-5.4-pro` 同时命中
 * `*-pro` 与 `gpt-5.4*`，顺序错就会解析出 Chat 专有的顶层 `reasoning_effort`）。
 */
function protocolWitnesses(row: WireProtocolRow): string[] {
	const witnesses = [catalogWitness(row.providerId, witnessModel(row.modelPattern))];
	if (row.modelPattern.startsWith("*")) {
		const suffix = row.modelPattern.slice(1);
		for (const cap of THINKING_CAPABILITIES) {
			if (cap.providerId !== row.providerId) continue;
			if (cap.modelPattern === "*" || !cap.modelPattern.endsWith("*")) continue;
			witnesses.push(`${cap.modelPattern.slice(0, -1)}${suffix}`);
		}
	}
	return [...new Set(witnesses)];
}

/** 能力表行的（方言）归属：内置表里只有 `anthropic` 是 Anthropic 方言，其余均 OpenAI 兼容。 */
function providerFor(providerId: string): ModelProvider {
	return {
		id: providerId,
		name: providerId,
		type: "preset",
		baseUrl: "https://api.example.com",
		apiKeySecretId: "sk",
		authType: "bearer",
		apiStyle: providerId === "anthropic" ? "anthropic" : "openai",
		models: [],
	};
}

/** 断言参数缺席，或落在允许形状集内；失败信息带定位。 */
function assertShape(
	param: ThinkingParam | null | undefined,
	allowed: ReadonlySet<ParamShape>,
	where: string
): void {
	if (!param) return;
	const shape = shapeOf(param);
	assert.ok(shape, `${where}：参数形状不可识别（${param.name}）`);
	assert.ok(allowed.has(shape), `${where}：${param.name} 不属于该协议的允许形状集（${[...allowed].join(" / ")}）`);
}

test("协议表 × 见证模型：思考参数 / 候选 / 清单都遵守该协议的形状与路由", () => {
	for (const [index, row] of WIRE_PROTOCOLS.entries()) {
		for (const witness of protocolWitnesses(row)) {
			const where = `${row.providerId}/${row.modelPattern}（${row.protocol}）见证模型 ${witness}`;

			// 自检：见证模型确实由本行首个命中，避免造名规则把测试带偏。
			const matchedIndex = WIRE_PROTOCOLS.findIndex(
				(candidate) =>
					candidate.providerId === row.providerId && matchModelPattern(candidate.modelPattern, witness)
			);
			assert.equal(matchedIndex, index, `${where}：见证模型没有由本行首个命中`);
			assert.equal(
				resolveWireProtocol(row.providerId, witness),
				row.protocol,
				`${where}：见证模型没有解析回本行协议`
			);

			const facts = resolveModelFacts(providerFor(row.providerId), witness);
			assert.equal(facts.apiStyle, "openai", `${where}：协议行必须只落在 OpenAI 方言`);
			assert.equal(facts.protocol, row.protocol, `${where}：事实解析出的协议与本行不一致`);
			const allowed = allowedShapes(facts.apiStyle, facts.protocol);

			assertShape(facts.thinking.param, allowed, `${where}：解析出的思考参数`);
			for (const candidate of probeOffCandidates(facts, row.providerId)) {
				assertShape(candidate, allowed, `${where}：候选关参数`);
			}

			assert.deepEqual(
				filterModelCatalog(row.providerId, [witness]),
				[witness],
				`${where}：按 ${row.protocol} 路由的见证模型却进不了模型清单`
			);
		}
	}
});

test("能力表：switchable 行的 off / on 参数都符合该行（方言, 协议）的允许形状集", () => {
	for (const row of THINKING_CAPABILITIES) {
		if (row.capability.kind !== "switchable") continue;

		const witness = witnessModel(row.modelPattern);
		const facts = resolveModelFacts(providerFor(row.providerId), witness);
		const allowed = allowedShapes(facts.apiStyle, facts.protocol);
		const dialect = facts.protocol ? `${facts.apiStyle}/${facts.protocol}` : facts.apiStyle;
		const where = `${row.providerId}/${row.modelPattern}（${dialect}）见证模型 ${witness}`;

		assertShape(row.capability.off, allowed, `${where}：off`);
		assertShape(row.capability.on, allowed, `${where}：on`);
	}
});
