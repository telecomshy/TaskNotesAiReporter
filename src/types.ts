/**
 * 类型定义：TaskNotes 公开 API 的最小类型桩 + 本插件设置类型。
 * 这里只声明本插件实际用到的字段，避免依赖 TaskNotes 源码类型。
 * 模型层数据常量（日期口径清单 `DATE_FIELDS`、`PRESET_PROVIDERS`、`DEFAULT_SETTINGS`）
 * 与类型同居（`PRESET_PROVIDERS` 先例，见 #81）。
 * 设置相关的业务逻辑已迁移：归一化在 src/settings/logic.ts，
 * 供应商配置与当前模型解析在 src/settings/providerSettings.ts。
 */

import type { UiLanguageSetting } from "./i18n";

/**
 * TaskNotes 任务（精简字段，与本插件相关）。
 * `id` 是任务标识：缝外一律不透明，不解释也不拆解其内部结构（TaskNotes 下即笔记路径）。
 */
export interface TaskInfo {
	id: string;
	title: string;
	status: string;
	priority: string;
	due?: string;
	scheduled?: string;
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

/**
 * 「状态归类」四档（见 CONTEXT.md「状态归类」）：待办 / 进行中 / 已结束 / 未知。
 */
export type StatusClass = "todo" | "in-progress" | "completed" | "unknown";

/**
 * 任务状态定义：状态值名 + 状态归类四档。
 * 来源词汇（TaskNotes 的 isCompleted、Tasks 的 StatusType）不出缝，见 ADR-0015 / #47。
 */
export interface StatusDefinition {
	value: string;
	statusClass: StatusClass;
}

/** TaskNotes 插件实例对外暴露的公开 API（通过 app.plugins.plugins["tasknotes"].api 访问） */
export interface TaskNotesPublicApi {
	tasks: {
		list(query?: unknown): Promise<TaskInfo[]>;
	};
	catalog?: {
		statuses(): Array<{ value: string; label: string; isCompleted?: boolean; color?: string }>;
		priorities(): Array<{ value: string; label: string; color?: string }>;
	};
}

/**
 * 「日期口径」清单：**单一真源**（见 #81），顺序即设置页展示顺序。
 *
 * 加一个日期口径 = 此处加一个字段名 + 双语各补一个文案键（键名按
 * `i18n.dateFieldLabelKey` 的命名约定派生）；若默认勾选，另改 `DEFAULT_SETTINGS.dateFields`
 * （默认集是产品决策、不从清单派生，原则见 ADR-0022）。
 * 字段名写错或引用不存在的键 = 编译失败（`satisfies` 约束到 `TaskInfo` 的键）。
 */
export const DATE_FIELDS = [
	"completedDate",
	"due",
	"scheduled",
	"dateCreated",
	"dateModified",
] as const satisfies readonly (keyof TaskInfo)[];

/** 日期字段口径（用于任务自动筛选）：从清单派生，类型与数据永不失同步。 */
export type DateField = (typeof DATE_FIELDS)[number];

/** 日期范围（闭区间，YYYY-MM-DD） */
export interface DateRange {
	start: string;
	end: string;
}

/** 报告模板 */
export interface ReportTemplate {
	id: string; // 唯一标识
	name: string; // 模板标题
	content: string; // 模板内容，支持占位符（见模板编辑提示）
}

/** 单个模型供应商配置 */
export interface ModelProvider {
	id: string; // 唯一标识
	name: string; // 显示名称
	type: "preset" | "custom"; // 内置 or 自定义
	baseUrl: string; // OpenAI 兼容 base URL（内置的固定；自定义的手动填）
	apiKeySecretId: string; // SecretStorage 中的密钥名（不存密钥值本身）
	models: string[]; // 「启用模型」（预设）：用户从模型清单挑选的子集，「选择模型」的唯一来源；自定义请用 provider.modelsOf 读取，勿直接依赖
	authType: "none" | "bearer"; // 认证方式（自定义供应商使用）
	/**
	 * 「模型清单」（#87）：「获取模型列表」从供应商接口取回的模型全集，供挑选对话框呈现；
	 * 「启用模型」从中挑选，挑选与否不影响清单本身。缺失（未迁移的旧数据）由迁移补齐，
	 * 读取侧经 `catalogOf` 兜底为空清单。
	 */
	modelCatalog?: string[];
	customModels?: ModelConfig[]; // 仅自定义供应商：手动维护的模型配置（每模型含 contextLength/maxTokens）
	/**
	 * 每模型「思考」两态（键＝模型 ID；缺省＝「关」），随模型持久化，见 ADR-0024 / ADR-0026。
	 * 存量三态「自动」在载入归一化处迁移为「开」（幂等）。
	 * 改名 / 删除模型时由命令迁移或清理条目；模型从列表中消失留下的残键无害——
	 * 偏好在该模型回来时复得（「偏好跟模型走」）。
	 */
	thinkingByModel?: Record<string, ThinkingSetting>;
	/**
	 * 「习得能力」（#89）：「思考测试」实测结论，键＝模型 ID（供应商即本条目所属供应商，
	 * 合起来即（供应商, 模型）键），条目自带测试时间戳；解析优先级 习得 ＞ 内置能力表 ＞ 未知。
	 * 移出启用集不清习得（重新添加后原样生效）；「中断」不留条目。
	 */
	learnedByModel?: Record<string, LearnedCapability>;
}

/** 单个模型配置（自定义供应商手动维护，每模型可独立设置参数） */
export interface ModelConfig {
	id: string; // 行内唯一标识
	modelId: string; // 模型 ID
	contextLength?: number; // 上下文长度
	maxTokens?: number; // 输出上限
}

/**
 * 「思考」两档（#88，ADR-0026）：开＝发开参数（该模型无开参数则不发）；关＝发关参数。
 * 出厂默认与读取侧缺省均为「关」；存量三态「自动」在载入归一化处迁移为「开」（见 core/thinking）。
 */
export type ThinkingSetting = "on" | "off";

/**
 * 思考开关参数：一个键值对，一次请求只发一个
 * （DashScope 的 `thinking_budget` 与 `reasoning_effort` 互斥，同发报错）。
 */
export interface ThinkingParam {
	name: string;
	value: unknown;
}

/** 思考能力的 UI 标注（置灰 + 说明）：强制思考 / 无思考 / 能力未知（不发参数）。 */
export type ThinkingNote = "forced" | "none" | "unknown";

/**
 * 思考测试的四值判定（#89）：措辞诚实——「未检出思考」不写「无思考」，「未能关闭」不写「强制思考」。
 * 未检出思考＝基线微型请求未检出推理段（按无思考处理）；可关＝某字段使推理段消失；
 * 未能关闭＝全部字段无效或被静默忽略；中断＝超时/网络错误，不留结论。
 */
export type ThinkingTestVerdict = "not-detected" | "switchable" | "not-switchable" | "interrupted";

/**
 * 习得能力（#89）：「思考测试」实测结论，按（供应商, 模型）键随设置持久化，
 * 解析优先级 习得 ＞ 内置能力表 ＞ 未知（见 CONTEXT.md「习得能力」）。
 * 「中断」不留条目；条目自带测试时间戳。
 */
export interface LearnedCapability {
	/** 落档判定（「中断」不落）。 */
	verdict: Exclude<ThinkingTestVerdict, "interrupted">;
	/** 「可关」的关参数：生成期「关」发它（「开」无开参数则不发）。 */
	off?: ThinkingParam;
	/** 「未能关闭」实测过的字段数（备注证据）。 */
	triedFields?: number;
	/** 测试时间戳（ISO 8601）。 */
	testedAt: string;
}

/** 思考解析结果（core/thinking 产出）：请求参数 + UI 标注 + 习得能力来源。 */
export interface ThinkingResolution {
	/** 生效的两档（缺省＝关）。 */
	setting: ThinkingSetting;
	/** 请求体追加参数；null＝不发思考参数。 */
	param: ThinkingParam | null;
	/** UI 置灰标注；null＝正常可交互。习得条目命中时呈现走习得档，note 不参与。 */
	note: ThinkingNote | null;
	/** 习得能力条目（#89）：命中即盖过内置能力表，含测试时间戳；null＝内置或未知。 */
	learned: LearnedCapability | null;
}

/** 当前生效的模型配置（由设置解析而来）：供应商接口 + 选中模型 + 该模型参数。 */
export interface ActiveModelConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
	maxTokens?: number;
	contextLength?: number;
	/** 「思考」两档与能力表解析结果（ADR-0024 / ADR-0026）。 */
	thinking: ThinkingResolution;
}

/** 当前模型无法解析的原因：没有当前供应商 / 没有当前模型 / 缺必填配置或凭据。 */
export type ActiveModelFailureReason = "no-provider" | "no-model" | "missing-credentials";

/** 当前模型解析结果：成功给出配置，失败给出原因（由供应商模块产出，见 ADR-0010）。 */
export type ActiveModelResolution =
	| { ok: true; config: ActiveModelConfig }
	| { ok: false; reason: ActiveModelFailureReason };

/** 预设供应商（内置，仅需 api key，baseUrl 固定，模型动态拉取） */
export const PRESET_PROVIDERS: Omit<ModelProvider, "apiKeySecretId" | "authType">[] = [
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
	// 任务自动筛选的日期口径（可多选；空数组合法 = 自动筛选关闭）

	dateFields: DateField[];
	// 周起始日
	weekStartsOnMonday: boolean;
	// 报告语言（用于 prompt 指令）
	language: string;
	// 界面语言（auto 时跟随 Obsidian 显示语言）
	uiLanguage: UiLanguageSetting;
	// 报告模板列表
	templates: ReportTemplate[];
	// 上次选择的模板 ID（空字符串表示不选模板，极简模式）
	selectedTemplateId: string;
}

export const DEFAULT_SETTINGS: TaskNotesAIHelperSettings = {
	providers: PRESET_PROVIDERS.map((p) => ({ ...p, apiKeySecretId: "", authType: "bearer" as const })),
	activeProviderId: "deepseek",
	activeModel: "",
	temperature: 0.7,
	maxTokens: 8192,
	timeoutSeconds: 60,
	reportFolder: "TaskNotes/Reports",
	dateFields: ["completedDate", "dateModified", "dateCreated", "scheduled"],
	weekStartsOnMonday: true,
	language: "English",
	uiLanguage: "auto",
	templates: [
		{
			id: "tpl_weekly_example",
			name: "Weekly report (example)",
			content:
				"Generate a work weekly report from the following task data.\n\nReport period: {{range}}\n\nRequirements:\n- Base the report strictly on the given task data; do not invent tasks or facts.\n- Keep it concise and well-structured, suitable for reporting upward.\n- Use Markdown.\n\nTask data:\n{{tasks}}",
		},
	],
	selectedTemplateId: "",
};
