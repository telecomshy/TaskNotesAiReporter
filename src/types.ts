/**
 * 类型定义：TaskNotes 公开 API 的最小类型桩 + 本插件设置类型。
 * 这里只声明本插件实际用到的字段，避免依赖 TaskNotes 源码类型。
 * 设置相关的业务逻辑（normalizeSettings / resolveActiveModelConfig 等）
 * 已迁移到 src/settings/logic.ts。
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
	// 上次选择的模板 ID（空字符串表示不选模板，极简模式）
	selectedTemplateId: string;
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
	selectedTemplateId: "",
};
