/**
 * 「模型配置」Tab 的卡级 view-model（#100，架构候选 2 step 2）：
 * 领域规则——count 显隐、stale / active 标记、当前模型下拉的分组与孤儿判定——
 * 收进纯函数；modelTab.ts 只剩渲染接线（provider 对象留在视图侧，供密钥控件 /
 * 命令 / testConnection 使用，本模块不重复携带 providerId）。
 *
 * 纯函数，无 DOM、无 obsidian。每帧 `activeModelInfo()` 只调一次（renderModelTab 顶部），
 * 结果传两个投影：`providerCardModel`（供应商卡）与 `activeModelCardModel`（当前模型卡）。
 */

import type { ModelProvider } from "../types";
import type { Translator } from "../i18n";
import { enabledModels, isModelStale, modelRows, type ModelParams } from "./providerModels";
import {
	isActiveModel,
	isConfigured,
	isSelectable,
	type ActiveModelInfo,
	type ProviderStateRead,
} from "./providerSettings";
import type { ModelTagRow } from "./providerCard";

// ===== 供应商卡投影 =====

/** 卡级投影共有的头部字段。 */
interface ProviderCardHead {
	/** 头部名称。 */
	name: string;
	/** 「已配置」状态。 */
	configured: boolean;
	/** 删除按钮仅自定义卡有（消费方：createProviderCard 的 deletable）。 */
	deletable: boolean;
	/**
	 * 头部模型计数，显隐规则内化（唯一出处，规则见 countOf；modelTab 不再有 type 分支）。
	 */
	count: { show: boolean; value: number };
}

/** 预设卡投影：标签列行数据（renderModelTagList 直接消费）。 */
export interface PresetCardModel extends ProviderCardHead {
	kind: "preset";
	entries: ModelTagRow[];
}

/** 自定义卡的模型行：#99 `modelRows` 读面 ＋ 逐行 flag；`draft`＝空白草稿行。 */
export interface CustomModelRowModel {
	rowId: string;
	modelId: string;
	params: ModelParams;
	stale: boolean;
	/** 空白草稿行不算「当前模型」（modelId 非空才判，与旧行为一致）。 */
	active: boolean;
	draft: boolean;
}

/** 自定义卡投影：模型行数据（行编辑器直接消费）。 */
export interface CustomCardModel extends ProviderCardHead {
	kind: "custom";
	rows: CustomModelRowModel[];
}

/** 单张供应商卡的投影；视图按 `kind` 对齐控件选择（预设 → 标签列，自定义 → 行编辑器）。 */
export type ProviderCardModel = PresetCardModel | CustomCardModel;

/** 单张供应商卡的投影：头部三件套 ＋ 按卡型的内容行。 */
export function providerCardModel(
	provider: ModelProvider,
	active: ActiveModelInfo
): ProviderCardModel {
	const head = {
		name: provider.name,
		configured: isConfigured(provider),
		count: countOf(provider),
	};
	if (provider.type === "preset") {
		return {
			kind: "preset",
			...head,
			deletable: false,
			entries: enabledModels(provider).map((modelId) => ({
				modelId,
				stale: isModelStale(provider, modelId),
				active: isActiveModel(active.providerId, active.model, provider.id, modelId),
			})),
		};
	}
	return {
		kind: "custom",
		...head,
		deletable: true,
		rows: modelRows(provider).map((row) => ({
			rowId: row.rowId,
			modelId: row.modelId,
			params: row.params,
			stale: isModelStale(provider, row.modelId),
			active:
				row.modelId !== "" &&
				isActiveModel(active.providerId, active.model, provider.id, row.modelId),
			draft: row.modelId === "",
		})),
	};
}

/** count 显隐规则（唯一出处）：有启用模型，且自定义恒可显示、预设须已配置。 */
function countOf(provider: ModelProvider): { show: boolean; value: number } {
	const value = enabledModels(provider).length;
	return { show: value > 0 && (provider.type === "custom" || isConfigured(provider)), value };
}

// ===== 当前模型卡投影 =====

/** 「选择模型」下拉的一个选项；`label` 已含「已失效」后缀（文案在 view-model 组装，视图只画 DOM）。 */
export interface ActiveModelOption {
	/** `providerId::model`。 */
	value: string;
	label: string;
	stale: boolean;
}

/** 下拉按 selectable 供应商分组的一组选项。 */
export interface ActiveModelOptionGroup {
	providerId: string;
	providerName: string;
	models: ActiveModelOption[];
}

/** 「选择模型」卡的投影。 */
export interface ActiveModelCardModel {
	/** 按 selectable 供应商分组；空＝无可选来源（视图显示 noModels）。 */
	options: ActiveModelOptionGroup[];
	/** 当前 `providerId::model`；无当前模型为空串（下拉留空）。 */
	selected: string;
	/** 当前模型不在 options（供应商已不可选等）：视图据此补占位 option（裁决 7）。 */
	orphan: boolean;
	/** 本帧唯一一次读面的原样携带（思考控件组合留给候选 4 的 thinkingCardModel）。 */
	info: ActiveModelInfo;
}

/** 「选择模型」卡的投影：分组选项 ＋ 当前值 ＋ 孤儿判定。 */
export function activeModelCardModel(
	state: ProviderStateRead,
	info: ActiveModelInfo,
	t: Translator
): ActiveModelCardModel {
	const options = state.providers.filter(isSelectable).map((provider) => ({
		providerId: provider.id,
		providerName: provider.name,
		models: enabledModels(provider).map((model) => ({
			value: `${provider.id}::${model}`,
			label: isModelStale(provider, model) ? `${model} · ${t("model.staleBadge")}` : model,
			stale: isModelStale(provider, model),
		})),
	}));
	const selected = info.model === "" ? "" : `${info.providerId}::${info.model}`;
	const inOptions = options.some((group) => group.models.some((o) => o.value === selected));
	return {
		options,
		selected,
		// 孤儿＝有当前模型但不在选项里；无当前模型不算孤儿（下拉留空即可）
		orphan: info.model !== "" && !inOptions,
		info,
	};
}
