/**
 * 供应商配置模块（吸收原 provider.ts 的判定函数）。
 *
 * 纯核：命令转移、判定谓词与当前模型解析，均无 DOM、无 obsidian，可单元测试。
 * 绑定门面：由边界（main.ts）注入状态读写与密钥取值，供设置页与主弹窗调用；
 * 视图不再直接改 `settings.providers`、不再各自落盘，也不再直接访问 SecretStorage。
 *
 * 「当前模型」失效只在变更命令处清理，载入时不校验（见 ADR-0010）。
 */

import type {
	ActiveModelConfig,
	ActiveModelResolution,
	ModelConfig,
	ModelProvider,
} from "../types";
import { resolveSecretValue } from "./secrets";
import type { SettingsOwner } from "./owner";

/** 新自定义供应商的默认名称：作为持久化数据，保持语言无关。 */
export const DEFAULT_CUSTOM_PROVIDER_NAME = "自定义供应商";

/** 供应商配置的可变切片：命令只在这一片上做转移。 */
export interface ProviderState {
	providers: ModelProvider[];
	activeProviderId: string;
	activeModel: string;
}

/**
 * 供应商切片的只读视图：只读消费方（`resolveActive` 等）用它，
 * 从而可直接读设置快照而无需把只读数组改窄。可变的 `ProviderState` 天然赋值兼容。
 */
export interface ProviderStateRead {
	readonly providers: readonly ModelProvider[];
	readonly activeProviderId: string;
	readonly activeModel: string;
}

// ===== 判定谓词 =====

/** 统一读取供应商的模型 ID：预设取已拉取的列表；自定义由 customModels 派生（去空白）。 */
export function modelsOf(provider: ModelProvider): string[] {
	if (provider.type === "custom") {
		return (provider.customModels ?? [])
			.map((m) => m.modelId)
			.filter((id) => id.trim() !== "");
	}
	return provider.models;
}

/** 卡片状态：供应商是否「已配置」。预设看是否选了密钥；自定义看地址且有模型。 */
export function isConfigured(provider: ModelProvider): boolean {
	return provider.type === "preset"
		? provider.apiKeySecretId.trim() !== ""
		: provider.baseUrl.trim() !== "" && modelsOf(provider).length > 0;
}

/** 能否作为「当前模型」来源：有地址、有模型，且认证满足（无认证不要求密钥）。 */
export function isSelectable(provider: ModelProvider): boolean {
	const credentialed = provider.authType === "none" || provider.apiKeySecretId.trim() !== "";
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

// ===== 命令转移 =====

/** 生成新自定义供应商。 */
export function addProvider(state: ProviderState): ProviderState {
	state.providers.push({
		id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		name: DEFAULT_CUSTOM_PROVIDER_NAME,
		type: "custom",
		baseUrl: "",
		apiKeySecretId: "",
		models: [],
		authType: "bearer",
		customModels: [],
	});
	return state;
}

/** 删除供应商；若删的是当前供应商，重置到首个并清空当前模型。 */
export function removeProvider(state: ProviderState, providerId: string): ProviderState {
	state.providers = state.providers.filter((p) => p.id !== providerId);
	if (state.activeProviderId === providerId) {
		state.activeProviderId = state.providers[0]?.id ?? "";
		state.activeModel = "";
	}
	return state;
}

/** 设置供应商显示名；纯空白回退默认名。 */
export function setProviderName(state: ProviderState, providerId: string, name: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.name = name.trim() || DEFAULT_CUSTOM_PROVIDER_NAME;
	return state;
}

/** 设置供应商接口地址（去空白）。 */
export function setProviderBaseUrl(state: ProviderState, providerId: string, baseUrl: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.baseUrl = baseUrl.trim();
	return state;
}

/**
 * 设置密钥名。清空预设供应商的密钥名会连带清空其模型列表；
 * 若因此使当前模型不复存在，则清空当前模型。
 */
export function setSecretId(state: ProviderState, providerId: string, secretId: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.apiKeySecretId = secretId.trim();
	if (provider.type === "preset" && provider.apiKeySecretId === "") {
		provider.models = [];
	}
	clearActiveIfModelGone(state);
	return state;
}

/** 设置认证方式；切到「无」时清空密钥名。 */
export function setAuthType(
	state: ProviderState,
	providerId: string,
	authType: ModelProvider["authType"]
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.authType = authType;
	if (authType === "none") provider.apiKeySecretId = "";
	return state;
}

/** 应用拉取到的模型列表（预设供应商）；不影响当前模型（见 ADR-0010）。 */
export function applyFetchedModels(
	state: ProviderState,
	providerId: string,
	models: string[]
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.models = models;
	return state;
}

/** 为自定义供应商追加一个空模型配置。 */
export function addModel(state: ProviderState, providerId: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	if (!provider.customModels) provider.customModels = [];
	provider.customModels.push({
		id: `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		modelId: "",
	});
	return state;
}

/** 改写某个模型配置的模型 ID；若改的是当前模型，则清空当前模型。 */
export function renameModel(
	state: ProviderState,
	providerId: string,
	modelConfigId: string,
	newModelId: string
): ProviderState {
	const model = findModel(state, providerId, modelConfigId);
	if (!model) return state;
	model.modelId = newModelId.trim();
	clearActiveIfModelGone(state);
	return state;
}

/** 改写某个模型配置的参数（只覆盖传入的键）。 */
export function setModelParams(
	state: ProviderState,
	providerId: string,
	modelConfigId: string,
	params: Pick<ModelConfig, "contextLength" | "maxTokens">
): ProviderState {
	const model = findModel(state, providerId, modelConfigId);
	if (!model) return state;
	if ("contextLength" in params) model.contextLength = params.contextLength;
	if ("maxTokens" in params) model.maxTokens = params.maxTokens;
	return state;
}

/** 删除某个模型配置；若删的是当前模型，则清空当前模型。 */
export function removeModel(
	state: ProviderState,
	providerId: string,
	modelConfigId: string
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider || !provider.customModels) return state;
	provider.customModels = provider.customModels.filter((m) => m.id !== modelConfigId);
	clearActiveIfModelGone(state);
	return state;
}

/** 选择当前模型（供应商 + 模型）；供应商不存在时不改变现状，以维持 activeProviderId 恒存在。 */
export function selectActiveModel(
	state: ProviderState,
	providerId: string,
	model: string
): ProviderState {
	if (!findProvider(state, providerId)) return state;
	state.activeProviderId = providerId;
	state.activeModel = model;
	return state;
}

// ===== 当前模型解析 =====

/**
 * 解析当前生效的模型配置；失败时给出原因。
 * 无认证（authType === "none"）的供应商不要求密钥值。
 */
export function resolveActive(
	state: ProviderStateRead,
	getSecret: (id: string) => string | null
): ActiveModelResolution {
	const provider = findProvider(state, state.activeProviderId);
	if (!provider) return { ok: false, reason: "no-provider" };
	if (!modelExists(provider, state.activeModel)) {
		return { ok: false, reason: "no-model" };
	}

	const requiresSecret = provider.authType !== "none";
	const apiKey = resolveSecretValue(provider.apiKeySecretId, getSecret);
	// 地址缺失属配置不完整，与缺凭据归为同一类失败。
	if (provider.baseUrl.trim() === "" || (requiresSecret && apiKey === "")) {
		return { ok: false, reason: "missing-credentials" };
	}

	const config: ActiveModelConfig = {
		baseUrl: provider.baseUrl,
		apiKey,
		model: state.activeModel,
	};
	if (provider.type === "custom" && Array.isArray(provider.customModels)) {
		const model = provider.customModels.find((m) => m.modelId === state.activeModel);
		if (model) {
			config.maxTokens = model.maxTokens;
			config.contextLength = model.contextLength;
		}
	}
	return { ok: true, config };
}

/** 所选密钥名在存储中缺失（区别于存在但值为空）。 */
export function isSecretMissing(
	secretId: string,
	getSecret: (id: string) => string | null
): boolean {
	const id = secretId.trim();
	if (id === "") return false;
	return getSecret(id) === null;
}

/** 当前模型已不在其供应商的模型列表中时，清空当前模型。 */
function clearActiveIfModelGone(state: ProviderState): void {
	const provider = findProvider(state, state.activeProviderId);
	if (!provider) return;
	if (!modelExists(provider, state.activeModel)) state.activeModel = "";
}

/** 模型 ID 是否非空且在该供应商的模型列表中。 */
function modelExists(provider: ModelProvider, model: string): boolean {
	return model !== "" && modelsOf(provider).includes(model);
}

function findProvider(state: ProviderStateRead, providerId: string): ModelProvider | undefined {
	return state.providers.find((p) => p.id === providerId);
}

function findModel(
	state: ProviderState,
	providerId: string,
	modelConfigId: string
): ModelConfig | undefined {
	return findProvider(state, providerId)?.customModels?.find((m) => m.id === modelConfigId);
}

// ===== 绑定门面 =====

/** 门面依赖：设置 owner（自持状态与落盘）+ 按名取密钥值（见 ./owner）。 */
export interface ProviderSettingsDeps {
	owner: SettingsOwner;
}

/** 供应商配置门面：视图只与它对话。 */
export interface ProviderSettings {
	addProvider(): void;
	removeProvider(providerId: string): void;
	setProviderName(providerId: string, name: string): void;
	setProviderBaseUrl(providerId: string, baseUrl: string): void;
	setSecretId(providerId: string, secretId: string): void;
	setAuthType(providerId: string, authType: ModelProvider["authType"]): void;
	applyFetchedModels(providerId: string, models: string[]): void;
	addModel(providerId: string): void;
	renameModel(providerId: string, modelConfigId: string, newModelId: string): void;
	setModelParams(
		providerId: string,
		modelConfigId: string,
		params: Pick<ModelConfig, "contextLength" | "maxTokens">
	): void;
	removeModel(providerId: string, modelConfigId: string): void;
	selectActiveModel(providerId: string, model: string): void;
	resolveActive(): ActiveModelResolution;
	secretValue(secretId: string): string;
	isSecretMissing(secretId: string): boolean;
}

/** 构造绑定门面。命令落在设置 owner 上，由 owner 自持状态与落盘（接线层不再逐字段搬运）。 */
export function createProviderSettings(deps: ProviderSettingsDeps): ProviderSettings {
	const { owner } = deps;
	const run = (command: (state: ProviderState) => ProviderState): void => {
		owner.apply((state) => {
			command(state);
		});
	};
	return {
		addProvider: () => run(addProvider),
		removeProvider: (providerId) => run((s) => removeProvider(s, providerId)),
		setProviderName: (providerId, name) => run((s) => setProviderName(s, providerId, name)),
		setProviderBaseUrl: (providerId, baseUrl) =>
			run((s) => setProviderBaseUrl(s, providerId, baseUrl)),
		setSecretId: (providerId, secretId) => run((s) => setSecretId(s, providerId, secretId)),
		setAuthType: (providerId, authType) => run((s) => setAuthType(s, providerId, authType)),
		applyFetchedModels: (providerId, models) =>
			run((s) => applyFetchedModels(s, providerId, models)),
		addModel: (providerId) => run((s) => addModel(s, providerId)),
		renameModel: (providerId, modelConfigId, newModelId) =>
			run((s) => renameModel(s, providerId, modelConfigId, newModelId)),
		setModelParams: (providerId, modelConfigId, params) =>
			run((s) => setModelParams(s, providerId, modelConfigId, params)),
		removeModel: (providerId, modelConfigId) =>
			run((s) => removeModel(s, providerId, modelConfigId)),
		selectActiveModel: (providerId, model) =>
			run((s) => selectActiveModel(s, providerId, model)),
		resolveActive: () => resolveActive(owner.get(), (id) => owner.readSecret(id)),
		secretValue: (secretId) => resolveSecretValue(secretId, (id) => owner.readSecret(id)),
		isSecretMissing: (secretId) => isSecretMissing(secretId, (id) => owner.readSecret(id)),
	};
}
