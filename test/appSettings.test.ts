import { test } from "node:test";
import assert from "node:assert/strict";
import {
	setReportFolder,
	toggleDateField,
	setWeekStartsOnMonday,
	setReportLanguage,
	setUiLanguage,
	setTaskSource,
	addTemplate,
	updateTemplate,
	removeTemplate,
	setSelectedTemplateId,
	createAppSettings,
	type AppState,
} from "../src/settings/appSettings";
import { DEFAULT_SETTINGS } from "../src/types";

function state(over: Partial<AppState> = {}): AppState {
	return {
		reportFolder: "TaskNotes/Reports",
		dateFields: ["completedDate", "scheduled", "due"],
		weekStartsOnMonday: true,
		language: "English",
		uiLanguage: "auto",
		taskSource: "tasknotes",
		templates: [],
		selectedTemplateId: "",
		...over,
	};
}

// ===== 命令转移 =====

test("setReportFolder 去空白写入", () => {
	const s = state();
	setReportFolder(s, "  我的/报告  ");
	assert.equal(s.reportFolder, "我的/报告");
});

test("toggleDateField 打开：追加且不重复", () => {
	const s = state({ dateFields: ["due"] });
	toggleDateField(s, "due", true);
	assert.deepEqual(s.dateFields, ["due"], "已存在的字段不应重复追加");
	toggleDateField(s, "scheduled", true);
	assert.deepEqual(s.dateFields, ["due", "scheduled"]);
});

test("toggleDateField 关闭：移除该字段", () => {
	const s = state({ dateFields: ["due", "scheduled"] });
	toggleDateField(s, "due", false);
	assert.deepEqual(s.dateFields, ["scheduled"]);
});

test("setWeekStartsOnMonday 写入布尔值", () => {
	const s = state({ weekStartsOnMonday: true });
	setWeekStartsOnMonday(s, false);
	assert.equal(s.weekStartsOnMonday, false);
});

test("setReportLanguage 去空白；纯空白回退默认", () => {
	const s = state();
	setReportLanguage(s, "  日本語  ");
	assert.equal(s.language, "日本語");
	setReportLanguage(s, "   ");
	assert.equal(s.language, DEFAULT_SETTINGS.language);
});

test("setUiLanguage 只接受合法值，其余归一为 auto", () => {
	const s = state({ uiLanguage: "auto" });
	setUiLanguage(s, "zh");
	assert.equal(s.uiLanguage, "zh");
	setUiLanguage(s, "en");
	assert.equal(s.uiLanguage, "en");
	setUiLanguage(s, "fr");
	assert.equal(s.uiLanguage, "auto");
});

test("setTaskSource 只接受合法值，其余归一为 tasknotes", () => {
	const s = state({ taskSource: "tasknotes" });
	setTaskSource(s, "obsidian-tasks");
	assert.equal(s.taskSource, "obsidian-tasks");
	setTaskSource(s, "tasknotes");
	assert.equal(s.taskSource, "tasknotes");
	setTaskSource(s, "jira");
	assert.equal(s.taskSource, "tasknotes");
});

test("addTemplate 追加一个新模板（生成唯一 id）", () => {
	const s = state();
	addTemplate(s, "周报", "内容 {{tasks}}");
	assert.equal(s.templates.length, 1);
	assert.equal(s.templates[0].name, "周报");
	assert.equal(s.templates[0].content, "内容 {{tasks}}");
	assert.ok(s.templates[0].id.startsWith("tpl_"));
});

test("updateTemplate 改写名称与内容", () => {
	const s = state({ templates: [{ id: "tpl_a", name: "旧", content: "旧内容" }] });
	updateTemplate(s, "tpl_a", "新", "新内容");
	assert.equal(s.templates[0].name, "新");
	assert.equal(s.templates[0].content, "新内容");
});

test("updateTemplate 目标不存在：无操作", () => {
	const s = state({ templates: [{ id: "tpl_a", name: "旧", content: "旧内容" }] });
	updateTemplate(s, "ghost", "新", "新内容");
	assert.deepEqual(s.templates, [{ id: "tpl_a", name: "旧", content: "旧内容" }]);
});

test("removeTemplate 删除指定模板", () => {
	const s = state({
		templates: [
			{ id: "tpl_a", name: "A", content: "a" },
			{ id: "tpl_b", name: "B", content: "b" },
		],
	});
	removeTemplate(s, "tpl_a");
	assert.deepEqual(s.templates.map((t) => t.id), ["tpl_b"]);
});

test("removeTemplate 删除当前所选模板：清空选择（修复悬空引用）", () => {
	const s = state({
		templates: [
			{ id: "tpl_a", name: "A", content: "a" },
			{ id: "tpl_b", name: "B", content: "b" },
		],
		selectedTemplateId: "tpl_a",
	});
	removeTemplate(s, "tpl_a");
	assert.equal(s.selectedTemplateId, "");
});

test("removeTemplate 删除非所选模板：选择不变", () => {
	const s = state({
		templates: [
			{ id: "tpl_a", name: "A", content: "a" },
			{ id: "tpl_b", name: "B", content: "b" },
		],
		selectedTemplateId: "tpl_b",
	});
	removeTemplate(s, "tpl_a");
	assert.equal(s.selectedTemplateId, "tpl_b");
});

test("setSelectedTemplateId 模板存在：保留选择", () => {
	const s = state({ templates: [{ id: "tpl_a", name: "A", content: "a" }] });
	setSelectedTemplateId(s, "tpl_a");
	assert.equal(s.selectedTemplateId, "tpl_a");
});

test("setSelectedTemplateId 模板不存在：回退为空（极简模式）", () => {
	const s = state({ templates: [{ id: "tpl_a", name: "A", content: "a" }] });
	setSelectedTemplateId(s, "tpl_gone");
	assert.equal(s.selectedTemplateId, "");
});

test("setSelectedTemplateId 空串：不选模板", () => {
	const s = state({ templates: [{ id: "tpl_a", name: "A", content: "a" }], selectedTemplateId: "tpl_a" });
	setSelectedTemplateId(s, "");
	assert.equal(s.selectedTemplateId, "");
});

// ===== 绑定门面 =====

test("门面：命令落盘一次，并保留引用", () => {
	const live = state();
	let saves = 0;
	const facade = createAppSettings({
		getState: () => live,
		commit: (next) => {
			Object.assign(live, next);
			saves++;
		},
	});
	facade.setReportFolder("  X  ");
	assert.equal(live.reportFolder, "X");
	assert.equal(saves, 1);
});

test("门面：setTaskSource 落盘一次", () => {
	const live = state();
	let saves = 0;
	const facade = createAppSettings({
		getState: () => live,
		commit: (next) => {
			Object.assign(live, next);
			saves++;
		},
	});
	facade.setTaskSource("obsidian-tasks");
	assert.equal(live.taskSource, "obsidian-tasks");
	assert.equal(saves, 1);
});

test("门面：删除当前模板清空选择并落盘一次", () => {
	const live = state({
		templates: [{ id: "tpl_a", name: "A", content: "a" }],
		selectedTemplateId: "tpl_a",
	});
	let saves = 0;
	const facade = createAppSettings({
		getState: () => live,
		commit: (next) => {
			Object.assign(live, next);
			saves++;
		},
	});
	facade.removeTemplate("tpl_a");
	assert.deepEqual(live.templates, []);
	assert.equal(live.selectedTemplateId, "");
	assert.equal(saves, 1);
});
