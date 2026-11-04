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
	LearnedCapability,
	ModelConfig,
	ModelProvider,
	ThinkingResolution,
	ThinkingSetting,
} from "../types";
import {
	resolveThinking,
	thinkingDisplay,
	unknownThinking,
	type ThinkingDisplay,
} from "../core/thinking";
import { resolveSecretValue } from "./secrets";
import { coerceModelIds, makeId } from "./values";
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
 * 判定区分「从未拉取」（清单缺失＝没有上游信息，不标）与「拉取到空」（#92 定性：
 * 空表是正常状态，照实记账——全部启用模型标「已失效」，可移除，拉回即消）。
 */
export function isModelStale(provider: ModelProvider, model: string): boolean {
	const catalog = provider.modelCatalog;
	return (
		catalog !== undefined && modelsOf(provider).includes(model) && !catalog.includes(model)
	);
}

/**
 * 读取某个模型的「思考」解析结果：该模型的「思考开关」取值（缺省＝关）经能力层映射，
 * 请求参数与置灰标注一并带出（ADR-0024）。设置页与当前模型 解析共用这一个读面。
 * 能力层优先级（#89）：习得能力 ＞ 内置能力表 ＞ 未知——自定义供应商与预设同路（ADR-0026）。
 */
export function thinkingFor(provider: ModelProvider, model: string): ThinkingResolution {
	return resolveThinking({
		providerId: provider.id,
		model,
		setting: provider.thinkingByModel?.[model] ?? "off",
		learned: provider.learnedByModel?.[model] ?? null,
	});
}

/** 卡片状态：供应商是否「已配置」。预设看是否选了密钥；自定义看地址且有模型。 */
export function isConfigured(provider: ModelProvider): boolean {
	return provider.type === "preset"
		? provider.apiKeySecretId.trim() !== ""
		: provider.baseUrl.trim() !== "" && modelsOf(provider).length > 0;
}

/**
 * 认证是否要求密钥（#90 教训：放行条件只此一家，防两套条件分叉）：
 * 「无认证」（authType none）不要求，其余都要。拉取守卫 / 可选判定 / 当前模型
 * 解析 / 清空联动共用它。
 */
export function requiresSecret(provider: ModelProvider): boolean {
	return provider.authType !== "none";
}

/** 能否作为「当前模型」来源：有地址、有模型，且认证满足（无认证不要求密钥）。 */
export function isSelectable(provider: ModelProvider): boolean {
	const credentialed = !requiresSecret(provider) || provider.apiKeySecretId.trim() !== "";
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
		id: makeId("custom"),
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
 * 设置密钥名（去空白）。「启用模型」与「模型清单」是用户的策展结果，设 / 换密钥名不改动它们；
 * 清空密钥名则回到「未配置 ⇒ 无启用模型」（#90，回归 #29 不变量）：
 * 预设供应商清空启用集，悬空「当前模型」一并清空。自定义供应商的模型行是手工配置，不受影响。
 */
export function setSecretId(state: ProviderState, providerId: string, secretId: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.apiKeySecretId = secretId.trim();
	if (needsSecretForModels(provider) && provider.apiKeySecretId === "") {
		provider.models = [];
		clearActiveIfModelGone(state);
	}
	return state;
}

/**
 * 「未配置 ⇒ 无启用模型」的载入迁移（#90）：清空密钥名为空的预设供应商的存量启用集
 * （历史拉取 / 测试残留）。只清启用集——「当前模型」悬空留给解析层报 no-model（ADR-0010：
 * 载入不校验 activeModel）；「模型清单」是拉取历史，不动。返回是否发生清理（供边界决定落盘）。
 */
export function clearUnconfiguredPresetModels(state: ProviderState): boolean {
	let changed = false;
	for (const provider of state.providers) {
		if (!needsSecretForModels(provider) || provider.apiKeySecretId.trim() !== "") continue;
		if (modelsOf(provider).length === 0) continue;
		provider.models = [];
		changed = true;
	}
	return changed;
}

/** 「未配置 ⇒ 无启用模型」的适用对象：要求密钥的预设供应商（无认证供应商不要求密钥名）。 */
function needsSecretForModels(provider: ModelProvider): boolean {
	return provider.type === "preset" && requiresSecret(provider);
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
 * 「当前模型」受保护：挑选集不含它也强制保留（真正移除需先切换模型）。
 * 移出只动启用集本身——该模型的「思考开关」与习得能力一并保留（重新添加后原样生效）。
 * 自定义供应商的模型行同步是另一摊事，见 `syncCustomModelRows`。
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
		syncCustomModelRows(provider, wanted);
	} else {
		provider.models = wanted;
	}
	return state;
}

/**
 * 自定义供应商的模型行同步（挑选确认的行级副作用）：保留行（id 与上下文长度 /
 * 最大输出参数）不换行，新挑选的补出空参数行，空白行（编辑中的草稿）不动。
 */
function syncCustomModelRows(provider: ModelProvider, wanted: string[]): void {
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
}

/**
 * 刷新「模型清单」（#87，手动拉取后调用）：只替换清单本身，
 * 不动启用集、不动当前模型。空列表照实刷为空清单（#92 定性：空表是正常状态），
 * 「已失效」判定据此区分「从未拉取」与「拉取到空」。
 */
export function refreshModelCatalog(
	state: ProviderState,
	providerId: string,
	models: string[]
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	provider.modelCatalog = coerceModelIds(models);
	return state;
}

/** 为自定义供应商追加一个空模型配置。 */
export function addModel(state: ProviderState, providerId: string): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	if (!provider.customModels) provider.customModels = [];
	provider.customModels.push({
		id: makeId("mc"),
		modelId: "",
	});
	return state;
}

/**
 * 改写某个模型配置的模型 ID；若改的是当前模型，则清空当前模型。
 * 重命名改变模型身份，走 ADR-0010 的变更命令清理；与 removeModel 的
 * 「受保护、先切换后移除」（ADR-0026）不对称是刻意的——删除可逆，改名不可逆。
 * 「思考开关」随模型改名迁移。
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
	if (provider) {
		// 「思考开关」与习得能力都「跟模型走」（#89）：改名迁移条目，残键不留。
		migrateModelKey(provider.thinkingByModel, oldModelId, model.modelId);
		migrateModelKey(provider.learnedByModel, oldModelId, model.modelId);
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

/** 删除某个模型配置；「当前模型」受保护（需先切换模型）；移除不清「思考开关」（#87）。 */
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

/**
 * 落「习得能力」条目（#89）：思考测试的实测结论，按（供应商, 模型）键持久化并盖过内置能力表。
 * 条目自带测试时间戳；「中断」不留条目（由状态机把关，见 core/thinking）。
 */
export function recordThinkingTest(
	state: ProviderState,
	providerId: string,
	model: string,
	entry: LearnedCapability
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider) return state;
	if (!provider.learnedByModel) provider.learnedByModel = {};
	provider.learnedByModel[model] = entry;
	return state;
}

/**
 * 清「习得能力」条目（#89）：假关告警「重新测试」动作先清后重跑（清习得并重跑）。
 * 清后能力回落内置能力表 / 未知；重跑若中断，旧结论不会借尸还魂。
 */
export function clearLearnedThinking(
	state: ProviderState,
	providerId: string,
	model: string
): ProviderState {
	const provider = findProvider(state, providerId);
	if (!provider?.learnedByModel) return state;
	delete provider.learnedByModel[model];
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

	const apiKey = resolveSecretValue(provider.apiKeySecretId, getSecret);
	// 地址缺失属配置不完整，与缺凭据归为同一类失败。
	if (provider.baseUrl.trim() === "" || (requiresSecret(provider) && apiKey === "")) {
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
	return { ok: true, providerId: state.activeProviderId, config };
}

/**
 * 「当前模型」的呈现信息：供应商 + 模型 + 思考解析 + 显示矩阵。
 * 设置页「选择模型」卡的唯一读面（无当前供应商 / 未选模型时按能力未知呈现）。
 */
export interface ActiveModelInfo {
	/** 解析到的供应商 id；没有当前供应商时为空串（悬空 id 不冒充）。 */
	providerId: string;
	/** 当前模型 id；没有可用供应商或未选模型时为空串。 */
	model: string;
	thinking: ThinkingResolution;
	display: ThinkingDisplay;
}

/**
 * 读「当前模型」的呈现信息（#94）：无当前供应商 / 未选模型时按能力未知呈现（开关置灰）。
 * 与生成期 `resolveActive`（要求凭据齐备）回答的是两个问题：设置页在未配置时也要画这张卡，
 * 故本读面**不**校验密钥值。
 */
export function activeModelInfo(state: ProviderStateRead): ActiveModelInfo {
	const provider = findProvider(state, state.activeProviderId);
	const model = state.activeModel;
	if (!provider || model === "") {
		const thinking = unknownThinking("off");
		return {
			providerId: provider?.id ?? "",
			model: "",
			thinking,
			display: thinkingDisplay(thinking),
		};
	}
	const thinking = thinkingFor(provider, model);
	return { providerId: provider.id, model, thinking, display: thinkingDisplay(thinking) };
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

/** 模型改名时迁移按模型键的条目（「思考开关」与习得能力同门，#89）。 */
function migrateModelKey<T>(map: Record<string, T> | undefined, oldKey: string, newKey: string): void {
	if (map && oldKey in map) {
		map[newKey] = map[oldKey];
		delete map[oldKey];
	}
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
	/** 刷新「模型清单」（不动启用集；空表照实记账，#87 / #92）。 */
	refreshModelCatalog(providerId: string, models: string[]): void;
	/** 挑选确认：挑选集成为启用集（当前模型受保护，移除不清「思考开关」；#87）。 */
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
	/** 落「习得能力」条目（#89）：思考测试结论按（供应商, 模型）持久化，盖过内置能力表。 */
	recordThinkingTest(providerId: string, model: string, entry: LearnedCapability): void;
	/** 清「习得能力」条目（#89）：假关告警「重新测试」先清后重跑。 */
	clearLearnedThinking(providerId: string, model: string): void;
	selectActiveModel(providerId: string, model: string): void;
	resolveActive(): ActiveModelResolution;
	/** 「当前模型」呈现信息（无当前模型时按能力未知呈现；设置页唯一读面）。 */
	activeModelInfo(): ActiveModelInfo;
	secretValue(secretId: string): string;
	isSecretMissing(secretId: string): boolean;
}

/** 构造绑定门面。命令落在设置 owner 上，由 owner 自持状态与落盘（接线层不再逐字段搬运）。 */
export function createProviderSettings(deps: ProviderSettingsDeps): ProviderSettings {
	const { owner } = deps;
	const run = (command: (state: ProviderState) => void): void => {
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
		refreshModelCatalog: (providerId, models) => run((s) => refreshModelCatalog(s, providerId, models)),
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
		recordThinkingTest: (providerId, model, entry) =>
			run((s) => recordThinkingTest(s, providerId, model, entry)),
		clearLearnedThinking: (providerId, model) =>
			run((s) => clearLearnedThinking(s, providerId, model)),
		selectActiveModel: (providerId, model) =>
			run((s) => selectActiveModel(s, providerId, model)),
		resolveActive: () => resolveActive(owner.get(), (id) => owner.readSecret(id)),
		activeModelInfo: () => activeModelInfo(owner.get()),
		secretValue: (secretId) => resolveSecretValue(secretId, (id) => owner.readSecret(id)),
		isSecretMissing: (secretId) => isSecretMissing(secretId, (id) => owner.readSecret(id)),
	};
}
