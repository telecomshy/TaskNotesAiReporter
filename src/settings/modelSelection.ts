/**
 * 「当前模型」选择的纯逻辑（可单元测试）。
 */

import type { ModelProvider } from "../types";

/** 可选模型来源：已填写 API Key 且至少有模型 ID 的供应商。 */
export function getSelectableProviders(providers: ModelProvider[]): ModelProvider[] {
	return providers.filter((p) => p.models.length > 0 && p.apiKey.trim() !== "");
}

/** 判断某个供应商下的模型是否为当前生效的模型。 */
export function isActiveModel(
	activeProviderId: string,
	activeModel: string,
	providerId: string,
	model: string
): boolean {
	return activeProviderId === providerId && activeModel === model;
}
