/**
 * 非供应商设置门面：报告目录、日期口径、周起始、报告语言、界面语言、模板与所选模板。
 *
 * 纯核：命令转移与变更时不变式，均无 DOM、无 obsidian，可单元测试。
 * 绑定门面：由边界（main.ts）注入状态读写与落盘，供设置页与主弹窗调用；
 * 视图不再直接改 `settings.*`、不再各自落盘。
 *
 * 与 `providerSettings` 同构：一个切片一个门面，命令在变更处维护不变式（见 ADR-0012）。
 */

import { DEFAULT_SETTINGS, type DateField, type ReportTemplate, type TaskSource } from "../types";
import type { UiLanguageSetting } from "../i18n";
import { genId } from "./logic";

/** 非供应商设置的可变切片：命令只在这一片上做转移。 */
export interface AppState {
	reportFolder: string;
	taskSource: TaskSource;
	dateFields: DateField[];
	weekStartsOnMonday: boolean;
	language: string;
	uiLanguage: UiLanguageSetting;
	templates: ReportTemplate[];
	selectedTemplateId: string;
}

// ===== 命令转移 =====

/** 设置报告输出目录（去空白）。 */
export function setReportFolder(state: AppState, folder: string): AppState {
	state.reportFolder = folder.trim();
	return state;
}

/** 设置任务来源；非法值归一为 TaskNotes（默认）。 */
export function setTaskSource(state: AppState, value: string): AppState {
	state.taskSource = value === "obsidian-tasks" ? "obsidian-tasks" : "tasknotes";
	return state;
}

/** 开/关某个日期口径；开启时去重，关闭时移除。 */
export function toggleDateField(state: AppState, field: DateField, on: boolean): AppState {
	if (on) {
		if (!state.dateFields.includes(field)) state.dateFields.push(field);
	} else {
		state.dateFields = state.dateFields.filter((f) => f !== field);
	}
	return state;
}

/** 设置周起始日是否为周一。 */
export function setWeekStartsOnMonday(state: AppState, value: boolean): AppState {
	state.weekStartsOnMonday = value;
	return state;
}

/** 设置报告语言（去空白）；纯空白回退默认语言。 */
export function setReportLanguage(state: AppState, language: string): AppState {
	state.language = language.trim() || DEFAULT_SETTINGS.language;
	return state;
}

/** 设置界面语言；非法值归一为 `auto`。 */
export function setUiLanguage(state: AppState, value: string): AppState {
	state.uiLanguage = value === "zh" || value === "en" ? value : "auto";
	return state;
}

/** 追加一个报告模板（生成唯一 id）。 */
export function addTemplate(state: AppState, name: string, content: string): AppState {
	state.templates.push({ id: genId(), name, content });
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

/** 删除某个模板；若删的是当前所选模板，则清空选择（避免悬空引用）。 */
export function removeTemplate(state: AppState, id: string): AppState {
	state.templates = state.templates.filter((t) => t.id !== id);
	if (state.selectedTemplateId === id) state.selectedTemplateId = "";
	return state;
}

/** 选择模板；仅当模板存在时保留，否则回退为不选模板（极简模式）。 */
export function setSelectedTemplateId(state: AppState, id: string): AppState {
	state.selectedTemplateId = state.templates.some((t) => t.id === id) ? id : "";
	return state;
}

// ===== 绑定门面 =====

/** 门面依赖：读取可变切片、落盘。 */
export interface AppSettingsDeps {
	getState(): AppState;
	/** 把转移后的切片写回设置并持久化。 */
	commit(state: AppState): void;
}

/** 非供应商设置门面：视图只与它对话。 */
export interface AppSettings {
	setReportFolder(folder: string): void;
	setTaskSource(value: string): void;
	toggleDateField(field: DateField, on: boolean): void;
	setWeekStartsOnMonday(value: boolean): void;
	setReportLanguage(language: string): void;
	setUiLanguage(value: string): void;
	addTemplate(name: string, content: string): void;
	updateTemplate(id: string, name: string, content: string): void;
	removeTemplate(id: string): void;
	setSelectedTemplateId(id: string): void;
}

/** 构造绑定门面。 */
export function createAppSettings(deps: AppSettingsDeps): AppSettings {
	const run = (command: (state: AppState) => AppState): void => {
		deps.commit(command(deps.getState()));
	};
	return {
		setReportFolder: (folder) => run((s) => setReportFolder(s, folder)),
		setTaskSource: (value) => run((s) => setTaskSource(s, value)),
		toggleDateField: (field, on) => run((s) => toggleDateField(s, field, on)),
		setWeekStartsOnMonday: (value) => run((s) => setWeekStartsOnMonday(s, value)),
		setReportLanguage: (language) => run((s) => setReportLanguage(s, language)),
		setUiLanguage: (value) => run((s) => setUiLanguage(s, value)),
		addTemplate: (name, content) => run((s) => addTemplate(s, name, content)),
		updateTemplate: (id, name, content) => run((s) => updateTemplate(s, id, name, content)),
		removeTemplate: (id) => run((s) => removeTemplate(s, id)),
		setSelectedTemplateId: (id) => run((s) => setSelectedTemplateId(s, id)),
	};
}
