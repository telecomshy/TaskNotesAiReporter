/**
 * 供应商与当前模型的纯逻辑（无 DOM、无 obsidian，可单元测试）。
 *
 * 统一此前分散且会漂移的就绪判断：读取模型、是否已配置、能否作为当前模型来源；
 * 并提供「某模型是否为当前模型」的匹配判断。
 */

import type { ModelProvider } from "../types";

/** 统一读取供应商的模型 ID：预设取已拉取的列表；自定义由 customModels 派生（去空白）。 */
export function modelsOf(provider: ModelProvider): string[] {
	if (provider.type === "custom") {
		return (provider.customModels ?? [])
			.map((m) => m.modelId)
			.filter((id) => id.trim() !== "");
	}
	return provider.models;
}

/** 卡片状态：供应商是否「已配置」。预设看 Key；自定义看地址且有模型。 */
export function isConfigured(provider: ModelProvider): boolean {
	return provider.type === "preset"
		? provider.apiKey.trim() !== ""
		: provider.baseUrl.trim() !== "" && modelsOf(provider).length > 0;
}

/** 能否作为「当前模型」来源：有地址、有模型，且认证满足（无认证不要求 Key）。 */
export function isSelectable(provider: ModelProvider): boolean {
	const credentialed = provider.authType === "none" || provider.apiKey.trim() !== "";
	return provider.baseUrl.trim() !== "" && modelsOf(provider).length > 0 && credentialed;
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
