/**
 * 类型定义：TaskNotes 公开 API 的最小类型桩 + 本插件设置类型。
 * 这里只声明本插件实际用到的字段，避免依赖 TaskNotes 源码类型。
 */

/** TaskNotes 任务（精简字段，与本插件相关） */
export interface TaskInfo {
	id?: string;
	title: string;
	status: string;
	priority: string;
	due?: string;
	scheduled?: string;
	path: string;
	archived: boolean;
	tags?: string[];
	contexts?: string[];
	projects?: string[];
	completedDate?: string;
	timeEstimate?: number;
	timeEntries?: TimeEntry[];
	totalTrackedTime?: number;
	dateCreated?: string;
	dateModified?: string;
	details?: string;
	customProperties?: Record<string, unknown>;
}

export interface TimeEntry {
	startTime: string;
	endTime?: string;
	description?: string;
	duration?: number;
}

/** TaskNotes 插件实例对外暴露的公开 API（通过 app.plugins.plugins["tasknotes"].api 访问） */
export interface TaskNotesPublicApi {
	tasks: {
		list(query?: unknown): Promise<TaskInfo[]>;
		get(path: string): Promise<TaskInfo | null>;
	};
	catalog?: {
		statuses(): Array<{ value: string; label: string; isCompleted?: boolean; color?: string }>;
		priorities(): Array<{ value: string; label: string; color?: string }>;
	};
}

/** 日期字段口径（用于任务自动筛选） */
export type DateField = "completedDate" | "due" | "scheduled" | "dateCreated";

/** 日期范围（闭区间，YYYY-MM-DD） */
export interface DateRange {
	start: string;
	end: string;
}

/** 报告类型（对应周/月/年） */
export type ReportType = "week" | "month" | "year" | "custom";

/** 报告模板 */
export interface ReportTemplate {
	id: string; // 唯一标识
	name: string; // 模板标题
	content: string; // 模板内容，支持 {{tasks}} 与 {{range}} 占位符
}

/** 生成唯一 ID */
export function genId(): string {
	return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 单个模型供应商配置 */
export interface ModelProvider {
	id: string; // 唯一标识
	name: string; // 显示名称
	type: "preset" | "custom"; // 内置 or 自定义
	baseUrl: string; // OpenAI 兼容 base URL（内置的固定；自定义的手动填）
	apiKey: string; // API 密钥
	models: string[]; // 可用模型 ID 列表（预设为动态拉取；自定义由 customModels 派生）
	authType: "none" | "bearer"; // 认证方式（自定义供应商使用）
	customModels?: ModelConfig[]; // 仅自定义供应商：手动维护的模型配置（每模型含 contextLength/maxTokens）
}

/** 单个模型配置（自定义供应商手动维护，每模型可独立设置参数） */
export interface ModelConfig {
	id: string; // 行内唯一标识
	modelId: string; // 模型 ID
	contextLength?: number; // 上下文长度
	maxTokens?: number; // 输出上限
}

/** 预设供应商（内置，仅需 api key，baseUrl 固定，模型动态拉取） */
export const PRESET_PROVIDERS: Omit<ModelProvider, "apiKey" | "authType">[] = [
	{
		id: "deepseek",
		name: "深度求索（DeepSeek）",
		type: "preset",
		baseUrl: "https://api.deepseek.com",
		models: [],
	},
	{
		id: "qwen",
		name: "阿里云百炼（通义千问）",
		type: "preset",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		models: [],
	},
	{
		id: "kimi",
		name: "Kimi（月之暗面）",
		type: "preset",
		baseUrl: "https://api.moonshot.cn/v1",
		models: [],
	},
	{
		id: "minimax",
		name: "MiniMax",
		type: "preset",
		baseUrl: "https://api.minimax.chat/v1",
		models: [],
	},
];

/** 本插件设置 */
export interface TaskNotesAIHelperSettings {
	// 模型供应商配置
	providers: ModelProvider[];
	// 当前选用的供应商与模型
	activeProviderId: string;
	activeModel: string;
	// 生成参数（全局）
	temperature: number;
	maxTokens: number;
	timeoutSeconds: number;
	// 报告输出目录
	reportFolder: string;
	// 任务自动筛选的日期口径（可多选）
	dateFields: DateField[];
	// 周起始日
	weekStartsOnMonday: boolean;
	// 报告语言（用于 prompt 指令）
	language: string;
	// 报告模板列表
	templates: ReportTemplate[];
}

/** 旧版单一模型配置（用于迁移） */
interface LegacySettings {
	baseUrl?: string;
	apiKey?: string;
	model?: string;
}

export const DEFAULT_SETTINGS: TaskNotesAIHelperSettings = {
	providers: PRESET_PROVIDERS.map((p) => ({ ...p, apiKey: "", authType: "bearer" as const })),
	activeProviderId: "deepseek",
	activeModel: "",
	temperature: 0.7,
	maxTokens: 8192,
	timeoutSeconds: 60,
	reportFolder: "TaskNotes/Reports",
	dateFields: ["completedDate", "scheduled", "due"],
	weekStartsOnMonday: true,
	language: "中文",
	templates: [
		{
			id: "tpl_weekly_example",
			name: "周报（示例）",
			content:
				"请根据以下任务数据，生成一份工作周报。\n\n报告时间范围：{{range}}\n\n要求：\n- 客观基于给定任务数据，不编造不存在的任务或事实。\n- 语言精炼、条理清晰，适合向上汇报。\n- 使用 Markdown 格式。\n\n任务数据如下：\n{{tasks}}",
		},
	],
};

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
