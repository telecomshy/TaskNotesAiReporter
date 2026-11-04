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
	ThinkingResolution,
	ThinkingSetting,
} from "../types";
import { resolveThinking } from "../core/thinking";
import { resolveSecretValue } from "./secrets";
import { coerceModelIds } from "./values";
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

/** 统一读取供应商的「启用模型」ID：预设取挑选集；自定义由 customModels 派生（去空白）。 */
export function modelsOf(provider: ModelProvider): string[] {
	if (provider.type === "custom") {
		return (provider.customModels ?? [])
			.map((m) => m.modelId)
			.filter((id) => id.trim() !== "");
	}
	return provider.models;
}

/** 统一读取「模型清单」（模型全集）；未迁移的旧数据缺失该字段时读作空清单（#87）。 */
export function catalogOf(provider: ModelProvider): string[] {
	return provider.modelCatalog ?? [];
}

/**
 * 「已失效」（#87）：已启用但不在「模型清单」中（上游已消失），保留可移除。
 * 清单为空＝没有上游信息（如从未拉取），不标失效。
 */
export function isModelStale(provider: ModelProvider, model: string): boolean {
	const catalog = catalogOf(provider);
	return (
		catalog.length > 0 && modelsOf(provider).includes(model) && !catalog.includes(model)
	);
}

/**
 * 读取某个模型的「思考」解析结果：该模型偏好（缺省＝关）经能力表映射，
 * 请求参数与置灰标注一并带出（ADR-0024）。设置页与当前模型 解析共用这一个读面。
 * 自定义供应商与预设同路（ADR-0026）：能力按（供应商, 模型）查表，未实测即未知。
 */
export function thinkingFor(provider: ModelProvider, model: string): ThinkingResolution {
	return resolveThinking({
		providerId: provider.id,
		model,
		setting: provider.thinkingByModel?.[model] ?? "off",
	});
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

/**
 * 「当前模型」受保护（#87）：不可被移除，真正移除需先切换模型。
 * 空模型 ID 不受保护（空白行是编辑中的草稿，可随时删除）。
 */
export function isModelProtected(
	state: ProviderStateRead,
	providerId: string,
	model: string
): boolean {
	return model !== "" && state.activeProviderId === providerId && state.activeModel === model;
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
 * 设置密钥名（去空白）。只动密钥名本身：启用集与模型清单是用户的策展结果，
 * 密钥变更不改动它们（与「静默拉取不改动启用集」同门，#87）。
 */
export function setSecretId(state: ProviderState, providerId: string, secretId: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.apiKeySecretId = secretId.trim();
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

/**
 * 挑选确认（#87）：挑选集成为「启用模型」，取消挑选即移出。
 * 自定义供应商连带同步模型行：保留行（id 与上下文长度 / 最大输出参数）不换行，
 * 新挑选的补出空参数行，空白行（编辑中的草稿）不动。
 * 「当前模型」受保护：挑选集不含它也强制保留（真正移除需先切换模型）。
 * 移出只动启用集本身——该模型的「思考」偏好与习得能力一并保留（重新添加后原样生效）。
 */
export function applyPickedModels(
	state: ProviderState,
	providerId: string,
	picked: string[]
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	const wanted = coerceModelIds(picked);
	const active = state.activeModel;
	if (
		isModelProtected(state, providerId, active) &&
		modelExists(provider, active) &&
		!wanted.includes(active)
	) {
		wanted.push(active);
	}
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
			if (!seen.has(id)) kept.push({ id: makeModelConfigId(), modelId: id });
		}
		provider.customModels = kept;
	} else {
		provider.models = wanted;
	}
	return state;
}

/**
 * 刷新「模型清单」（#87，静默拉取与手动拉取共用）：只替换清单本身，
 * 不动启用集、不动当前模型（「静默拉取永不自动启用」）。空列表视为拉取异常，不刷清单。
 */
export function refreshModelCatalog(
	state: ProviderState,
	providerId: string,
	models: string[]
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	const cleaned = coerceModelIds(models);
	if (cleaned.length === 0) return state;
	provider.modelCatalog = cleaned;
	return state;
}

/**
 * 「有 N 个新模型可挑选」的 N（#87）：清单新出现且尚未启用的模型数。
 * 已启用的模型不算「可挑选」，旧清单已有的不算「新」。
 */
export function countNewPickable(
	before: readonly string[],
	after: readonly string[],
	enabled: readonly string[]
): number {
	const beforeSet = new Set(before);
	const enabledSet = new Set(enabled);
	return after.filter((m) => !beforeSet.has(m) && !enabledSet.has(m)).length;
}

/** 为自定义供应商追加一个空模型配置。 */
export function addModel(state: ProviderState, providerId: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	if (!provider.customModels) provider.customModels = [];
	provider.customModels.push({
		id: makeModelConfigId(),
		modelId: "",
	});
	return state;
}

/**
 * 改写某个模型配置的模型 ID；若改的是当前模型，则清空当前模型。
 * 重命名改变模型身份，走 ADR-0010 的变更命令清理；与 removeModel 的
 * 「受保护、先切换后移除」（ADR-0026）不对称是刻意的——删除可逆，改名不可逆。
 * 思考偏好随模型改名迁移。
 */
export function renameModel(
	state: ProviderState,
	providerId: string,
	modelConfigId: string,
	newModelId: string
): ProviderState {
	const model = findModel(state, providerId, modelConfigId);
	if (!model) return state;
	const oldModelId = model.modelId;
	model.modelId = newModelId.trim();
	const provider = findProvider(state, providerId);
	if (provider && provider.thinkingByModel && oldModelId in provider.thinkingByModel) {
		provider.thinkingByModel[model.modelId] = provider.thinkingByModel[oldModelId];
		deleteThinking(provider, oldModelId);
	}
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

/** 删除某个模型配置；「当前模型」受保护（需先切换模型）；移除不清「思考」偏好（#87）。 */
export function removeModel(
	state: ProviderState,
	providerId: string,
	modelConfigId: string
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider || !provider.customModels) return state;
	const target = provider.customModels.find((m) => m.id === modelConfigId);
	if (!target || isModelProtected(state, providerId, target.modelId.trim())) return state;
	provider.customModels = provider.customModels.filter((m) => m.id !== modelConfigId);
	return state;
}

/** 写入某个模型的「思考」两档（按模型持久化，键＝模型 ID；见 ADR-0024 / ADR-0026）。 */
export function setModelThinking(
	state: ProviderState,
	providerId: string,
	model: string,
	setting: ThinkingSetting
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	if (!provider.thinkingByModel) provider.thinkingByModel = {};
	provider.thinkingByModel[model] = setting;
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
		// 「思考」解析（能力表映射 / 置灰标注）由纯模块产出（ADR-0024）；
		// 自定义供应商与预设同路：能力表未命中即未知（ADR-0026）。
		thinking: thinkingFor(provider, state.activeModel),
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

/** 删除某个模型的「思考」偏好条目。 */
function deleteThinking(provider: ModelProvider, model: string): void {
	if (provider.thinkingByModel) delete provider.thinkingByModel[model];
}

/** 模型 ID 是否非空且在该供应商的模型列表中。 */
function modelExists(provider: ModelProvider, model: string): boolean {
	return model !== "" && modelsOf(provider).includes(model);
}

/** 模型行的行内唯一标识（行是界面行级概念，标识不解释、不复用）。 */
function makeModelConfigId(): string {
	return `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
	/** 刷新「模型清单」（不动启用集），返回「有 N 个新模型可挑选」的 N（#87）。 */
	refreshModelCatalog(providerId: string, models: string[]): number;
	/** 挑选确认：挑选集成为启用集（当前模型受保护，移除不清思考偏好；#87）。 */
	applyPickedModels(providerId: string, picked: string[]): void;
	/** 「当前模型」是否受保护（不可被移除，需先切换模型；#87）。 */
	isModelProtected(providerId: string, model: string): boolean;
	addModel(providerId: string): void;
	renameModel(providerId: string, modelConfigId: string, newModelId: string): void;
	setModelParams(
		providerId: string,
		modelConfigId: string,
		params: Pick<ModelConfig, "contextLength" | "maxTokens">
	): void;
	removeModel(providerId: string, modelConfigId: string): void;
	setModelThinking(providerId: string, model: string, setting: ThinkingSetting): void;
	selectActiveModel(providerId: string, model: string): void;
	resolveActive(): ActiveModelResolution;
	secretValue(secretId: string): string;
	isSecretMissing(secretId: string): boolean;
}

/** 构造绑定门面。命令落在设置 owner 上，由 owner 自持状态与落盘（接线层不再逐字段搬运）。 */
export function createProviderSettings(deps: ProviderSettingsDeps): ProviderSettings {
	const { owner } = deps;
	const run = (command: (state: ProviderState) => ProviderState): void => {
		void owner.apply((state) => {
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
		refreshModelCatalog: (providerId, models) => {
			let count = 0;
			void owner.apply((state) => {
				const provider = state.providers.find((p) => p.id === providerId);
				if (!provider) return;
				const before = catalogOf(provider);
				refreshModelCatalog(state, providerId, models);
				count = countNewPickable(before, catalogOf(provider), modelsOf(provider));
			});
			return count;
		},
		applyPickedModels: (providerId, picked) => run((s) => applyPickedModels(s, providerId, picked)),
		isModelProtected: (providerId, model) =>
			isModelProtected(owner.get(), providerId, model),
		addModel: (providerId) => run((s) => addModel(s, providerId)),
		renameModel: (providerId, modelConfigId, newModelId) =>
			run((s) => renameModel(s, providerId, modelConfigId, newModelId)),
		setModelParams: (providerId, modelConfigId, params) =>
			run((s) => setModelParams(s, providerId, modelConfigId, params)),
		removeModel: (providerId, modelConfigId) =>
			run((s) => removeModel(s, providerId, modelConfigId)),
		setModelThinking: (providerId, model, setting) =>
			run((s) => setModelThinking(s, providerId, model, setting)),
		selectActiveModel: (providerId, model) =>
			run((s) => selectActiveModel(s, providerId, model)),
		resolveActive: () => resolveActive(owner.get(), (id) => owner.readSecret(id)),
		secretValue: (secretId) => resolveSecretValue(secretId, (id) => owner.readSecret(id)),
		isSecretMissing: (secretId) => isSecretMissing(secretId, (id) => owner.readSecret(id)),
	};
}
