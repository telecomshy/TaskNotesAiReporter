/**
 * 非供应商设置的命令转移与变更时不变式。
 *
 * 纯核：命令转移与不变式，均无 DOM、无 obsidian，可单元测试。
 * 绑定门面：接住「设置 owner」（见 ./owner），供设置页与主弹窗调用；视图不再直接改设置。
 *
 * 值域规则与载入共用 `./values`（见 #46）：同一条不变式只在一处判定，
 * 不会出现「载入接受、变更拒绝」或反之的漂移。
 */

import type { DateField, ReportTemplate, TaskNotesAIHelperSettings } from "../types";

import type { UiLanguageSetting } from "../i18n";
import type { SettingsOwner } from "./owner";
import {
	coerceDateFields,
	coerceFiniteNumber,
	coerceReportFolder,
	coerceReportLanguage,
	coerceSelectedTemplateId,
	coerceTaskSource,
	coerceUiLanguage,
	isDateField,
	makeId,
} from "./values";
import type { TaskSource } from "../types";

/** 生成参数（temperature / maxTokens / timeoutSeconds）：三者恒结伴读写（见 #46）。 */
export interface GenerationParams {
	temperature?: number;
	maxTokens?: number;
	timeoutSeconds?: number;
}

/**
 * 非供应商设置的可变切片：命令只在这一片上做转移。
 * 它是 `TaskNotesAIHelperSettings` 的结构化子集，命令可直接作用于 owner 的整份设置。
 */
export interface AppState {
	taskSource: TaskSource;
	reportFolder: string;
	dateFields: DateField[];
	weekStartsOnMonday: boolean;
	language: string;
	uiLanguage: UiLanguageSetting;
	templates: ReportTemplate[];
	selectedTemplateId: string;
	temperature: number;
	maxTokens: number;
	timeoutSeconds: number;
}

// ===== 命令转移（就地维护值域不变式） =====

/** 设置任务来源；非法值归一为 `tasknotes`。 */
export function setTaskSource(state: AppState, source: unknown): AppState {
	state.taskSource = coerceTaskSource(source);
	return state;
}

/** 设置报告输出目录（去空白）。 */
export function setReportFolder(state: AppState, folder: string): AppState {
	state.reportFolder = coerceReportFolder(folder);
	return state;
}

/**
 * 开/关某个日期口径；开启时去重，关闭时移除。
 * **一个都不勾是合法状态**（= 自动筛选关闭），命令不回填默认。
 */

export function toggleDateField(state: AppState, field: DateField, on: boolean): AppState {
	if (!isDateField(field)) return state;
	const next = on
		? state.dateFields.includes(field)
			? state.dateFields
			: [...state.dateFields, field]
		: state.dateFields.filter((f) => f !== field);
	// 复用载入侧的同一套值域规则（合法项、去重）
	state.dateFields = coerceDateFields(next) ?? [];
	return state;
}

/** 设置周起始日是否为周一。 */
export function setWeekStartsOnMonday(state: AppState, value: boolean): AppState {
	state.weekStartsOnMonday = value;
	return state;
}

/** 设置报告语言（去空白）；纯空白回退默认语言。 */
export function setReportLanguage(state: AppState, language: string): AppState {
	state.language = coerceReportLanguage(language);
	return state;
}

/** 设置界面语言；非法值归一为 `auto`。 */
export function setUiLanguage(state: AppState, value: unknown): AppState {
	state.uiLanguage = coerceUiLanguage(value);
	return state;
}

/**
 * 设置生成参数（temperature / maxTokens / timeoutSeconds）。
 * 只收有限数值，其余项保持原值；不提供 UI（见 #46）。
 */
export function setGenerationParams(state: AppState, params: GenerationParams): AppState {
	const entries = Object.entries(params) as Array<[keyof GenerationParams, unknown]>;
	for (const [key, value] of entries) {
		const next = coerceFiniteNumber(value);
		if (next !== null) state[key] = next;
	}
	return state;
}

/** 追加一个报告模板（生成唯一 id）。 */
export function addTemplate(state: AppState, name: string, content: string): AppState {
	state.templates.push({ id: makeId(), name, content });
	return state;
}

/** 改写某个模板的名称与内容；模板不存在时无操作。 */
export function updateTemplate(state: AppState, id: string, name: string, content: string): AppState {
	const template = state.templates.find((t) => t.id === id);
	if (!template) return state;
	template.name = name;
	template.content = content;
	return state;
}

/** 删除某个模板；同步清理悬空的所选模板（不变式，见 #33 / ADR-0012）。 */
export function removeTemplate(state: AppState, id: string): AppState {
	state.templates = state.templates.filter((t) => t.id !== id);
	state.selectedTemplateId = coerceSelectedTemplateId(state.templates, state.selectedTemplateId);
	return state;
}

/** 选择模板；仅当模板存在时保留，否则回退为不选模板（极简模式）。 */
export function setSelectedTemplateId(state: AppState, id: string): AppState {
	state.selectedTemplateId = coerceSelectedTemplateId(state.templates, id);
	return state;
}

// ===== 绑定门面 =====

/** 非供应商设置门面：视图只与它对话。命令返回落盘的 Promise，失败可等待 / 传播。 */
export interface AppSettings {
	setTaskSource(source: unknown): Promise<void>;
	setReportFolder(folder: string): Promise<void>;
	toggleDateField(field: DateField, on: boolean): Promise<void>;
	setWeekStartsOnMonday(value: boolean): Promise<void>;
	setReportLanguage(language: string): Promise<void>;
	setUiLanguage(value: unknown): Promise<void>;
	setGenerationParams(params: GenerationParams): Promise<void>;
	addTemplate(name: string, content: string): Promise<void>;
	updateTemplate(id: string, name: string, content: string): Promise<void>;
	removeTemplate(id: string): Promise<void>;
	setSelectedTemplateId(id: string): Promise<void>;

}

/**
 * 构造绑定门面：命令落在设置 owner 上，由 owner 自持状态与落盘。
 * 接线层不再逐字段搬运设置切片（见 #46）。
 */
export function createAppSettings(owner: SettingsOwner): AppSettings {
	const run = (command: (state: TaskNotesAIHelperSettings) => void): Promise<void> =>
		owner.apply(command);
	return {
		setTaskSource: (source) => run((s) => void setTaskSource(s, source)),
		setReportFolder: (folder) => run((s) => void setReportFolder(s, folder)),
		toggleDateField: (field, on) => run((s) => void toggleDateField(s, field, on)),
		setWeekStartsOnMonday: (value) => run((s) => void setWeekStartsOnMonday(s, value)),
		setReportLanguage: (language) => run((s) => void setReportLanguage(s, language)),
		setUiLanguage: (value) => run((s) => void setUiLanguage(s, value)),
		setGenerationParams: (params) => run((s) => void setGenerationParams(s, params)),
		addTemplate: (name, content) => run((s) => void addTemplate(s, name, content)),
		updateTemplate: (id, name, content) => run((s) => void updateTemplate(s, id, name, content)),
		removeTemplate: (id) => run((s) => void removeTemplate(s, id)),
		setSelectedTemplateId: (id) => run((s) => void setSelectedTemplateId(s, id)),

	};
}
