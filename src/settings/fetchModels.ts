/**
 * 「获取模型列表」流程（#90 / #92，见 #93）：守卫 → 拉取 → 刷新「模型清单」→ 结局分类。
 *
 * 本模块拥有这条动作的领域规则：未配置不发请求、空表照实记账；只由手动入口调用（#90）。
 * 仅把结局交回视图，提示措辞与挑选框归视图（ADR-0005）。
 * 纯编排 + 注入的状态切片：不依赖 obsidian / DOM，可单元测试。
 */

import { listModels, type RequestFn } from "../ai/client";
import type { ModelProvider } from "../types";
import { requiresSecret } from "./providerSettings";

/** 流程所需的状态切片；设置门面（ProviderSettings）结构上满足它。 */
export interface FetchModelsSlice {
	/** 按密钥名取密钥值；缺失返回空串。 */
	secretValue(secretId: string): string;
	/** 刷新「模型清单」（不动启用集；空表照实刷为空，#92）。 */
	refreshModelCatalog(providerId: string, models: string[]): void;
}

/**
 * 一次「获取模型列表」的结局；视图按 kind 穷尽映射为提示 / 挑选框。
 * - need-url / need-key / secret-missing：守卫拦截，未发请求；
 * - failed：请求失败，带原始错误（由视图翻译，服务端详情原样带入）；
 * - empty：拉取成功但上游没有模型（正常状态，清单照实刷为空）；
 * - fetched：拉取成功，清单已刷新，携带模型全集。
 */
export type FetchModelsOutcome =
	| { kind: "need-url" }
	| { kind: "need-key" }
	| { kind: "secret-missing" }
	| { kind: "failed"; error: unknown }
	| { kind: "empty" }
	| { kind: "fetched"; models: string[] };

/**
 * 跑一次「获取模型列表」。
 *
 * `onStart` 在守卫全部通过后、发请求前调用一次——视图据此出示「拉取中…」，
 * 守卫失败时不会出现「既在拉取又缺配置」的双提示。
 * `timeoutSeconds` 由调用方给（用户设置），不设缺省：漏传属编译错误。
 */
export async function runFetchModelsFlow(
	slice: FetchModelsSlice,
	provider: ModelProvider,
	timeoutSeconds: number,
	request?: RequestFn,
	onStart?: () => void
): Promise<FetchModelsOutcome> {
	if (provider.baseUrl.trim() === "") return { kind: "need-url" };

	const secretRequired = requiresSecret(provider);
	if (secretRequired && provider.apiKeySecretId.trim() === "") return { kind: "need-key" };
	const apiKey = secretRequired ? slice.secretValue(provider.apiKeySecretId) : "";
	if (secretRequired && apiKey === "") return { kind: "secret-missing" };

	onStart?.();

	let models: string[];
	try {
		models = await listModels(provider.baseUrl, apiKey, timeoutSeconds, request);
	} catch (error) {
		return { kind: "failed", error };
	}

	// 成功即记账（含空表）：清单是拉取历史，「已失效」判定据此区分「从未拉取」。
	slice.refreshModelCatalog(provider.id, models);
	return models.length === 0 ? { kind: "empty" } : { kind: "fetched", models };
}
