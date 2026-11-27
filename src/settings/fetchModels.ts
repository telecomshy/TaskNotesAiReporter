/**
 * 「获取模型列表」流程（#90 / #92，见 #93）：守卫 → 拉取 → 刷新「模型清单」→ 结局分类。
 *
 * 本模块拥有这条动作的领域规则：未配置不发请求、空表照实记账；只由手动入口调用（#90）。
 * 仅把结局交回视图，提示措辞与挑选框归视图（ADR-0005）。
 * 纯编排 + 注入的状态切片：不依赖 obsidian / DOM，可单元测试。
 */

import { AIClientError, listModels, type RequestFn } from "../ai/client";
import { apiStyleOf } from "../core/apiStyle";
import { filterModelCatalog } from "../core/modelCatalogFilter";
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
 * - failed-no-model-list：上游未提供模型清单（HTTP 404），且该供应商可改用手填模型行；
 * - empty：拉取成功但上游没有模型（正常状态，清单照实刷为空）；
 * - fetched：拉取成功，清单已刷新，携带模型全集。
 */
export type FetchModelsOutcome =
	| { kind: "need-url" }
	| { kind: "need-key" }
	| { kind: "secret-missing" }
	| { kind: "failed"; error: unknown }
	| { kind: "failed-no-model-list"; error: unknown }
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

	// 「接口方言」只读一次：清单请求与失败分类看的是同一个方言。
	const apiStyle = apiStyleOf(provider);

	let models: string[];
	try {
		models = await listModels(
			{
				baseUrl: provider.baseUrl,
				apiKey,
				timeoutSeconds,
				// 「接口方言」透传（#105）：清单地址 / 认证头 / 翻页全由它决定。
				apiStyle,
			},
			request
		);
	} catch (error) {
		// 失败分类是这条动作的领域知识（#116）：只有「自定义供应商 + Anthropic 方言 + 404」
		// 才意味着「上游没实现 /models，但有手填模型行这条兜底路径」。分类只此一处。
		if (
			provider.type === "custom" &&
			apiStyle === "anthropic" &&
			error instanceof AIClientError &&
			error.code === "models.http" &&
			error.details.status === 404
		) {
			return { kind: "failed-no-model-list", error };
		}
		return { kind: "failed", error };
	}

	// 清单过滤（#106）：拉取成功后、写「模型清单」前，按供应商 id 选取规则——
	// 只有 OpenAI 预设只收对话模型；过滤后为空照实记账（现有「空清单」结局）。
	models = filterModelCatalog(provider.id, models);

	// 成功即记账（含空表）：清单是拉取历史，「已失效」判定据此区分「从未拉取」。
	slice.refreshModelCatalog(provider.id, models);
	return models.length === 0 ? { kind: "empty" } : { kind: "fetched", models };
}
