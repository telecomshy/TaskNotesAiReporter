/**
 * 设置业务逻辑：从原始数据归一化生成设置、解析当前生效的 AI 配置。
 * 与纯类型（src/types.ts）分离，仅依赖 Obsidian 无关的纯逻辑，可单元测试。
 */

import {
	DEFAULT_SETTINGS,
	PRESET_PROVIDERS,
	type ModelProvider,
	type TaskNotesAIHelperSettings,
} from "../types";

export type { TaskNotesAIHelperSettings } from "../types";

/** 旧版单一模型配置（用于迁移） */
interface LegacySettings {
	baseUrl?: string;
	apiKey?: string;
	model?: string;
}

/** 生成唯一 ID */
export function genId(): string {
	return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从加载的原始数据生成最终设置：处理旧版单一模型配置的迁移。
 */
export function normalizeSettings(raw: unknown): TaskNotesAIHelperSettings {
	const data = (raw ?? {}) as Partial<TaskNotesAIHelperSettings> & LegacySettings;
	const settings: TaskNotesAIHelperSettings = { ...DEFAULT_SETTINGS };

	// 常规字段
	if (typeof data.temperature === "number") settings.temperature = data.temperature;
	if (typeof data.maxTokens === "number") settings.maxTokens = data.maxTokens;
	if (typeof data.timeoutSeconds === "number") settings.timeoutSeconds = data.timeoutSeconds;
	if (typeof data.reportFolder === "string") settings.reportFolder = data.reportFolder;
	if (Array.isArray(data.dateFields) && data.dateFields.length > 0) {
		settings.dateFields = data.dateFields;
	}
	if (typeof data.weekStartsOnMonday === "boolean") {
		settings.weekStartsOnMonday = data.weekStartsOnMonday;
	}
	if (typeof data.language === "string") settings.language = data.language;
	if (Array.isArray(data.templates)) {
		settings.templates = data.templates
			.filter((t) => t && typeof t.name === "string" && typeof t.content === "string")
			.map((t) => ({
				id: typeof t.id === "string" ? t.id : genId(),
				name: t.name,
				content: t.content,
			}));
	}

	// 上次选择的模板 ID：仅在模板存在时保留，否则回退为不选模板
	if (typeof data.selectedTemplateId === "string") {
		settings.selectedTemplateId = data.selectedTemplateId;
	}
	if (
		settings.selectedTemplateId !== "" &&
		!settings.templates.some((t) => t.id === settings.selectedTemplateId)
	) {
		settings.selectedTemplateId = "";
	}

	// 供应商：优先使用新结构；否则用预设（不含固定 custom）
	if (Array.isArray(data.providers) && data.providers.length > 0) {
		// 兼容旧结构：补齐 type/authType 字段
		settings.providers = data.providers
			// 过滤掉空的、纯占位的自定义供应商（旧版默认列表遗留的 "custom" 空壳）。
			// 只有点击「+ 添加模型供应商」并填写了配置的 custom 供应商才应保留。
			.filter((p) => {
				const t = (p?.type as string | undefined) ?? "custom";
				if (t !== "custom") return true; // 预设供应商始终保留
				const baseUrl = (p?.baseUrl as string | undefined) ?? "";
				const apiKey = (p?.apiKey as string | undefined) ?? "";
				const models = Array.isArray(p?.models) ? (p.models as string[]) : [];
				return baseUrl.trim() !== "" || apiKey.trim() !== "" || models.length > 0;
			})
			.map((p) => {
				const type = ((p.type as "preset" | "custom" | undefined) ?? "custom") as
					| "preset"
					| "custom";
				const authType = ((p.authType as "none" | "bearer" | undefined) ?? "bearer") as
					| "none"
					| "bearer";
				const provider = { ...p, type, authType } as ModelProvider;
				// 迁移：旧版自定义供应商用 models 字符串数组（供应商级 contextLength/maxTokens 也已废弃），
				// 转为 customModels 每模型配置，保持常规配置下拉与卡片模型行可用。
				if (type === "custom" && !Array.isArray(provider.customModels)) {
					const legacyModels = Array.isArray(provider.models)
						? (provider.models as string[])
						: [];
					provider.customModels = legacyModels.map((modelId) => ({
						id: genId(),
						modelId,
					}));
				}
				return provider;
			});
	} else {
		settings.providers = PRESET_PROVIDERS.map((p) => ({
			...p,
			apiKey: "",
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
				matched.apiKey = data.apiKey ?? "";
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
					apiKey: data.apiKey ?? "",
					models: data.model ? [data.model] : [],
					authType: "bearer",
				};
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

	return settings;
}

/** 根据设置解析当前生效的 AI 配置（baseUrl/apiKey/model），并携带该模型的自定义参数 */
export function resolveActiveModelConfig(
	settings: TaskNotesAIHelperSettings
): {
	baseUrl: string;
	apiKey: string;
	model: string;
	maxTokens?: number;
	contextLength?: number;
} | null {
	const provider = settings.providers.find((p) => p.id === settings.activeProviderId);
	if (!provider) return null;
	const cfg: {
		baseUrl: string;
		apiKey: string;
		model: string;
		maxTokens?: number;
		contextLength?: number;
	} = {
		baseUrl: provider.baseUrl,
		apiKey: provider.apiKey,
		model: settings.activeModel,
	};
	// 自定义供应商：匹配当前选中模型的行配置，提取其独立参数
	if (provider.type === "custom" && Array.isArray(provider.customModels)) {
		const mc = provider.customModels.find((m) => m.modelId === settings.activeModel);
		if (mc) {
			cfg.maxTokens = mc.maxTokens;
			cfg.contextLength = mc.contextLength;
		}
	}
	return cfg;
}

/** 规范化 base URL（去掉末尾斜杠与 /v1 版本段），用于供应商匹配 */
function normalizeBaseUrl(url: string): string {
	return url
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/v\d+(\.\d+)*$/i, "");
}
