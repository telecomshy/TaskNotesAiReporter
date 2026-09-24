/**
 * 设置业务逻辑：从原始数据归一化生成设置、解析当前生效的 AI 配置。
 * 与纯类型（src/types.ts）分离，仅依赖 Obsidian 无关的纯逻辑，可单元测试。
 */

import {
	DEFAULT_SETTINGS,
	PRESET_PROVIDERS,
	type ModelProvider,
	type ReportTemplate,
	type TaskNotesAIHelperSettings,
} from "../types";
import type { PendingSecret } from "./secrets";
import {
	coerceReportLanguage,
	coerceSelectedTemplateId,
	coerceTemplates,
	coerceUiLanguage,
	coerceWeekStartsOnMonday,
	makeId,
} from "./values";

export type { TaskNotesAIHelperSettings } from "../types";

/** 归一化结果：设置本身 + 待导入 SecretStorage 的旧版明文密钥。 */
export interface NormalizedSettings {
	settings: TaskNotesAIHelperSettings;
	/** 旧版明文密钥；由边界（main.ts）导入 SecretStorage 后即不再保留。 */
	pendingSecrets: PendingSecret[];
}

/** 旧版中文默认示例模板；仅当用户从未改动过它时，一次性迁移为当前英文默认版。 */
const LEGACY_DEFAULT_TEMPLATE = {
	id: "tpl_weekly_example",
	name: "周报（示例）",
	content:
		"请根据以下任务数据，生成一份工作周报。\n\n报告时间范围：{{range}}\n\n要求：\n- 客观基于给定任务数据，不编造不存在的任务或事实。\n- 语言精炼、条理清晰，适合向上汇报。\n- 使用 Markdown 格式。\n\n任务数据如下：\n{{tasks}}",
};

/** 旧版单一模型配置（用于迁移） */
interface LegacySettings {
	baseUrl?: string;
	apiKey?: string;
	model?: string;
}

/**
 * 从加载的原始数据生成最终设置：处理旧版单一模型配置的迁移。
 */
export function normalizeSettings(raw: unknown): NormalizedSettings {
	const data = (raw ?? {}) as Omit<Partial<TaskNotesAIHelperSettings>, "providers"> &
		LegacySettings & { providers?: unknown[] };
	const settings: TaskNotesAIHelperSettings = { ...DEFAULT_SETTINGS };
	const pendingSecrets: PendingSecret[] = [];

	// 常规字段：载入**不改写用户既有数据**，只在缺失 / 非法时按值域回退。
	// #46 列举的「载入与变更共用」规则只有三项：报告语言空回退、界面语言归一、
	// 所选模板必须存在。目录空白 / 日期口径过滤 / 生成参数校验属**变更侧**规则；
	// 若在载入套用会改写用户 data.json，构成 #44 禁止的第三处用户可见变更。
	if (typeof data.temperature === "number") settings.temperature = data.temperature;
	if (typeof data.maxTokens === "number") settings.maxTokens = data.maxTokens;
	if (typeof data.timeoutSeconds === "number") settings.timeoutSeconds = data.timeoutSeconds;
	if (typeof data.reportFolder === "string") settings.reportFolder = data.reportFolder;
	// 日期口径：**空数组是合法值**（= 自动筛选关闭），不再被静默改回默认（#46 的用户可见修正）。
	// 数组内容原样保留——过滤非法项是变更侧规则，载入不做。
	if (Array.isArray(data.dateFields)) settings.dateFields = data.dateFields.slice();
	const weekStartsOnMonday = coerceWeekStartsOnMonday(data.weekStartsOnMonday);
	if (weekStartsOnMonday !== null) settings.weekStartsOnMonday = weekStartsOnMonday;
	settings.language = coerceReportLanguage(data.language);
	settings.uiLanguage = coerceUiLanguage(data.uiLanguage);
	const templates = coerceTemplates(data.templates);
	if (templates !== null) settings.templates = templates;

	settings.templates = migrateExampleTemplate(settings.templates);

	// 上次选择的模板 ID：仅在模板存在时保留，否则回退为不选模板
	settings.selectedTemplateId = coerceSelectedTemplateId(settings.templates, data.selectedTemplateId);

	// 供应商：优先使用新结构；否则用预设（不含固定 custom）
	if (Array.isArray(data.providers) && data.providers.length > 0) {
		// 兼容旧结构：补齐 type/authType 字段
		settings.providers = data.providers
			// 过滤掉空的、纯占位的自定义供应商（旧版默认列表遗留的 "custom" 空壳）。
			// 只有点击「+ 添加模型供应商」并填写了配置的 custom 供应商才应保留。
			.filter((p) => {
				const providerRaw = p as Record<string, unknown>;
				const t = (providerRaw.type as string | undefined) ?? "custom";
				if (t !== "custom") return true; // 预设供应商始终保留
				const baseUrl = (providerRaw.baseUrl as string | undefined) ?? "";
				const secretId = (providerRaw.apiKeySecretId as string | undefined) ?? "";
				const legacyKey = (providerRaw.apiKey as string | undefined) ?? "";
				const models = Array.isArray(providerRaw.models) ? (providerRaw.models as string[]) : [];
				return (
					baseUrl.trim() !== "" ||
					secretId.trim() !== "" ||
					legacyKey.trim() !== "" ||
					models.length > 0
				);
			})
			.map((p) => {
				const providerRaw = p as Record<string, unknown>;
				const type = (providerRaw.type as "preset" | "custom" | undefined) ?? "custom";
				const authType = (providerRaw.authType as "none" | "bearer" | undefined) ?? "bearer";
				const provider = {
					...providerRaw,
					...readApiKeySecretId(providerRaw),
					type,
					authType,
				} as unknown as ModelProvider & { apiKey?: string };
				const legacy = providerRaw.apiKey;
				delete provider.apiKey; // 不再持久化明文密钥
				if (typeof legacy === "string" && legacy.trim() !== "" && typeof provider.id === "string") {
					pendingSecrets.push({ providerId: provider.id, plaintext: legacy });
				}
				// 迁移：旧版自定义供应商用 models 字符串数组（供应商级 contextLength/maxTokens 也已废弃），
				// 转为 customModels 每模型配置，保持常规配置下拉与卡片模型行可用。
				if (type === "custom" && !Array.isArray(provider.customModels)) {
					const legacyModels = Array.isArray(providerRaw.models) ? (providerRaw.models as string[]) : [];
					provider.customModels = legacyModels.map((modelId) => ({
						id: makeId(),
						modelId,
					}));
				}
				return provider;
			});
	} else {
		settings.providers = PRESET_PROVIDERS.map((p) => ({
			...p,
			apiKeySecretId: "",
			authType: "bearer" as const,
		}));
		// 旧版单一模型配置迁移：匹配预设供应商，否则创建新的自定义供应商
		if (data.baseUrl || data.apiKey || data.model) {
			const legacyBase = normalizeBaseUrl(data.baseUrl ?? "");
			const matched = settings.providers.find((p) => {
				const presetBase = normalizeBaseUrl(p.baseUrl);
				return (
					presetBase !== "" &&
					legacyBase !== "" &&
					presetBase.toLowerCase() === legacyBase.toLowerCase()
				);
			});

			if (matched) {
				if (data.apiKey) pendingSecrets.push({ providerId: matched.id, plaintext: data.apiKey });
				if (data.model) {
					matched.models = [data.model];
				}
				settings.activeProviderId = matched.id;
				settings.activeModel = data.model ?? "";
			} else {
				// 不匹配预设，创建新的自定义供应商
				const customId = `custom_${Date.now().toString(36)}`;
				const legacyProvider: ModelProvider = {
					id: customId,
					name: "自定义",
					type: "custom",
					baseUrl: data.baseUrl ?? "",
					apiKeySecretId: "",
					models: data.model ? [data.model] : [],
					authType: "bearer",
				};
				if (data.apiKey) pendingSecrets.push({ providerId: customId, plaintext: data.apiKey });
				settings.providers.push(legacyProvider);
				settings.activeProviderId = customId;
				settings.activeModel = data.model ?? "";
			}
		}
	}

	// 选用的供应商与模型
	if (typeof data.activeProviderId === "string") {
		settings.activeProviderId = data.activeProviderId;
	}
	if (typeof data.activeModel === "string") {
		settings.activeModel = data.activeModel;
	}

	// 保证 activeProviderId 存在于 providers
	if (!settings.providers.some((p) => p.id === settings.activeProviderId)) {
		settings.activeProviderId = settings.providers[0]?.id ?? "";
	}

	return { settings, pendingSecrets };
}

/** 从原始供应商读取密钥名（新结构）；旧版明文由 normalizeSettings 收集进 pendingSecrets。 */
function readApiKeySecretId(
	providerRaw: Record<string, unknown>
): Pick<ModelProvider, "apiKeySecretId"> {
	return {
		apiKeySecretId:
			typeof providerRaw.apiKeySecretId === "string" ? providerRaw.apiKeySecretId : "",
	};
}

/** 把未被用户改动的旧中文示例模板迁移为当前英文默认版；改过的模板原样保留。 */
function migrateExampleTemplate(templates: ReportTemplate[]): ReportTemplate[] {
	const fresh = DEFAULT_SETTINGS.templates.find((t) => t.id === LEGACY_DEFAULT_TEMPLATE.id);
	if (!fresh) return templates;
	return templates.map((t) =>
		t.id === LEGACY_DEFAULT_TEMPLATE.id &&
		t.name === LEGACY_DEFAULT_TEMPLATE.name &&
		t.content === LEGACY_DEFAULT_TEMPLATE.content
			? { ...t, name: fresh.name, content: fresh.content }
			: t
	);
}

/** 规范化 base URL（去掉末尾斜杠与 /v1 版本段），用于供应商匹配 */
function normalizeBaseUrl(url: string): string {
	return url
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/v\d+(\.\d+)*$/i, "");
}
