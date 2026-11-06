/**
 * 「启用模型」存储模块（#99，架构候选 1）：「启用模型」「模型清单」「模型参数」
 * 的持久化知识集中于此——预设（`models` 挑选集）与自定义（`customModels` 模型行）
 * 两个 adapter 在这一处对齐，`provider.type` 的存储分支不再外散。
 *
 * Interface 规则：**编辑面按行、读面按模型**——写面的行级原语统一收行 id
 * （`ModelConfig.id`），读面一律按模型 id（`ModelConfig.modelId`，统一 trim 后交付）。
 * 调用方无须记每个命令吃哪个 id。
 *
 * 纯函数，无 obsidian、无 DOM。写面在 state 内就地变更，落盘由命令层经 owner
 * 完成（ADR-0016）；跨域编排（「当前模型」保护、思考键迁移、悬空清理）留在
 * providerSettings 命令层。
 */

import type { ModelConfig, ModelProvider } from "../types";
import { coerceModelIds, makeId } from "./values";

/** 「模型参数」：模型行携带的上下文长度与最大输出（预设供应商恒空）。 */
export type ModelParams = Pick<ModelConfig, "contextLength" | "maxTokens">;

/** 行编辑器读面的一行：`rowId` 供编辑命令寻址，`modelId` 与 `params` 供呈现。 */
export interface ModelRowView {
	rowId: string;
	modelId: string;
	params: ModelParams;
}

// ===== 读面（按模型 id） =====

/** 「启用模型」：预设取挑选集；自定义由模型行派生，统一 trim（#99 读侧保险）。 */
export function enabledModels(provider: ModelProvider): string[] {
	if (provider.type === "custom") {
		return (provider.customModels ?? [])
			.map((m) => m.modelId.trim())
			.filter((id) => id !== "");
	}
	return provider.models;
}

/** 「模型清单」（模型全集）；未迁移的旧数据缺失该字段时读作空清单（#87）。 */
export function modelCatalog(provider: ModelProvider): string[] {
	return provider.modelCatalog ?? [];
}

/**
 * 「已失效」（#87）：已启用但不在「模型清单」中（上游已消失），保留可移除。
 * 判定区分「从未拉取」（清单缺失＝没有上游信息，不标）与「拉取到空」（#92 定性：
 * 空表是正常状态，照实记账——全部启用模型标「已失效」，可移除，拉回即消）。
 */
export function isModelStale(provider: ModelProvider, model: string): boolean {
	const catalog = provider.modelCatalog;
	return (
		catalog !== undefined && enabledModels(provider).includes(model) && !catalog.includes(model)
	);
}

/** 单个模型行的参数（稀疏：只含已设置的键）。 */
function paramsOfRow(row: ModelConfig): ModelParams {
	const params: ModelParams = {};
	if (row.contextLength !== undefined) params.contextLength = row.contextLength;
	if (row.maxTokens !== undefined) params.maxTokens = row.maxTokens;
	return params;
}

/** 「模型参数」：该模型的上下文长度与最大输出；预设恒空，未设置的键不出现。 */
export function modelParams(provider: ModelProvider, model: string): ModelParams {
	if (provider.type !== "custom") return {};
	// 按模型身份寻址（trim 后比对）：存量未 trim 的行（旧版迁移产物）不因空白丢参数。
	const row = (provider.customModels ?? []).find((m) => m.modelId.trim() === model.trim());
	return row ? paramsOfRow(row) : {};
}

/** 「挑选」呈现序：模型清单序在前，清单外的启用模型（＝已失效）追加在后，去重。 */
export function pickerRows(provider: ModelProvider): string[] {
	const catalog = modelCatalog(provider);
	const rows = [...catalog, ...enabledModels(provider).filter((m) => !catalog.includes(m))];
	return [...new Set(rows)];
}

/** 行编辑器读面：预设无模型行返回 `[]`；自定义给出 `{ rowId, modelId, params }`。 */
export function modelRows(provider: ModelProvider): ModelRowView[] {
	if (provider.type !== "custom") return [];
	return (provider.customModels ?? []).map((row) => ({
		rowId: row.id,
		modelId: row.modelId.trim(),
		params: paramsOfRow(row),
	}));
}

// ===== 写面（存储级原语；行编辑按 rowId） =====

/**
 * 「挑选」写回（#87）：挑选集成为「启用模型」，取消挑选即移出。
 * 预设整体替换挑选集；自定义同步模型行——保留行（id 与上下文长度 / 最大输出参数）
 * 不换行，新挑选的补出空参数行，空白行（编辑中的草稿）不动。
 * 移出只动启用集本身——「思考开关」与习得能力由命令层保证不在此触碰（ADR-0026）。
 */
export function setEnabledModels(provider: ModelProvider, picked: string[]): void {
	const wanted = coerceModelIds(picked);
	if (provider.type === "custom") {
		const kept: ModelConfig[] = [];
		const seen = new Set<string>();
		for (const row of provider.customModels ?? []) {
			const id = row.modelId.trim();
			if (id === "") {
				kept.push(row);
				continue;
			}
			if (wanted.includes(id) && !seen.has(id)) {
				seen.add(id);
				kept.push(row);
			}
		}
		for (const id of wanted) {
			if (!seen.has(id)) kept.push({ id: makeId("mc"), modelId: id });
		}
		provider.customModels = kept;
		return;
	}
	provider.models = wanted;
}

/**
 * 刷新「模型清单」（#87，手动拉取后由 `refreshModelCatalog` 命令委托）：只替换清单
 * 本身，不动启用集、不动当前模型。空列表照实刷为空清单（#92：空表是正常状态），
 * 「已失效」判定据此区分「从未拉取」与「拉取到空」。
 */
export function setModelCatalog(provider: ModelProvider, models: string[]): void {
	provider.modelCatalog = coerceModelIds(models);
}

/** 加一条空白草稿行；模型行是自定义供应商的概念，预设不动。 */
export function addDraftRow(provider: ModelProvider): void {
	if (provider.type !== "custom") return;
	if (!provider.customModels) provider.customModels = [];
	provider.customModels.push({ id: makeId("mc"), modelId: "" });
}

/**
 * 改写一行的模型 ID（trim 后写入），返回 trim 后的新旧 id 供命令层迁移按模型键的
 * 数据（「思考开关」/习得能力，#89）并清理悬空「当前模型」（ADR-0010）；行不存在
 * 返回 `null`。改名改变模型身份——与 removeModel 的「受保护、先切换后移除」
 * （ADR-0026）不对称是刻意的，裁决在命令层。
 */
export function renameRow(
	provider: ModelProvider,
	rowId: string,
	newModelId: string
): { from: string; to: string } | null {
	const row = (provider.customModels ?? []).find((m) => m.id === rowId);
	if (!row) return null;
	const from = row.modelId.trim();
	const to = newModelId.trim();
	row.modelId = to;
	return { from, to };
}

/** 覆盖一行的模型参数（只覆盖传入的键）；行不存在时不动。 */
export function setRowParams(provider: ModelProvider, rowId: string, params: ModelParams): void {
	const row = (provider.customModels ?? []).find((m) => m.id === rowId);
	if (!row) return;
	if ("contextLength" in params) row.contextLength = params.contextLength;
	if ("maxTokens" in params) row.maxTokens = params.maxTokens;
}

/** 删除一行；行不存在返回 `false`。「当前模型」保护校验留在命令层（ADR-0026）。 */
export function removeRow(provider: ModelProvider, rowId: string): boolean {
	if (!provider.customModels) return false;
	const before = provider.customModels.length;
	provider.customModels = provider.customModels.filter((m) => m.id !== rowId);
	return provider.customModels.length !== before;
}

// ===== 迁移面（载入编排调用） =====

/**
 * 旧版自定义供应商的 `models` 字符串数组 → 模型行（每行铸造新行 id），写入即 trim
 * （#99 写侧保险：启用集与清单从源头上不再错位）。「何时对哪个 provider 调用」
 * （含「已是数组则不重复迁移」的守卫）留在载入编排（logic.ts）。
 */
export function adoptLegacyCustomModels(provider: ModelProvider, modelIds: string[]): void {
	provider.customModels = modelIds.map((modelId) => ({
		id: makeId("mc"),
		modelId: modelId.trim(),
	}));
}

/**
 * #87 模型清单迁移（幂等）：`catalogRaw` 非数组（缺失或非法，按缺失对待）时
 * 清单初值＝启用集（内部走 `enabledModels`，统一 trim——存量行与清单不再因空白
 * 错位误标「已失效」）；已有清单只做非法值清洗、不并入启用集——并入会把
 * 「已启用但上游消失」的模型洗进清单，下次载入「已失效」标记就没了。
 */
export function initializeModelCatalog(provider: ModelProvider, catalogRaw: unknown): void {
	if (Array.isArray(catalogRaw)) {
		setModelCatalog(provider, catalogRaw as string[]); // 原始边界：写入侧 coerceModelIds 统一清洗
		return;
	}
	setModelCatalog(provider, enabledModels(provider));
}
