import { test } from "node:test";
import assert from "node:assert/strict";
import {
	setReportFolder,
	toggleDateField,
	setWeekStartsOnMonday,
	setReportLanguage,
	setUiLanguage,
	addTemplate,
	updateTemplate,
	removeTemplate,
	setSelectedTemplateId,
	setGenerationParams,
	createAppSettings,
	type AppState,
} from "../src/settings/appSettings";
import { createSettingsOwner } from "../src/settings/owner";
import { DEFAULT_SETTINGS, type TaskNotesAIHelperSettings } from "../src/types";

/** 构造测试用设置（整份，含供应商切片），可被命令直接作用。 */
function state(over: Partial<TaskNotesAIHelperSettings> = {}): TaskNotesAIHelperSettings {
	return {
		...DEFAULT_SETTINGS,

		templates: [],
		selectedTemplateId: "",
		...over,
	};
}

/** 构造测试用 owner：落盘计数 + 可读密钥。 */
function ownerOver(
	live: TaskNotesAIHelperSettings,
	opts: { onSave?: () => void; getSecret?: (id: string) => string | null } = {}
) {
	return createSettingsOwner(live, {
		save: () => {
			opts.onSave?.();
			return Promise.resolve();
		},
		getSecret: (id) => opts.getSecret?.(id) ?? null,
	});
}

// ===== 命令转移 =====

test("toggleDateField 非法字段名无操作（变更侧值域规则）", () => {
	const s = state({ dateFields: ["due"] });
	toggleDateField(s, "bogus" as never, true);
	assert.deepEqual(s.dateFields, ["due"]);
});

test("setReportFolder 去空白写入（变更侧规则；载入侧不 trim，见 test/settings.test.ts）", () => {
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
	const facade = createAppSettings(ownerOver(live, { onSave: () => saves++ }));
	facade.setReportFolder("  X  ");
	assert.equal(live.reportFolder, "X");
	assert.equal(saves, 1);
});

test("门面：删除当前模板清空选择并落盘一次", () => {
	const live = state({
		templates: [{ id: "tpl_a", name: "A", content: "a" }],
		selectedTemplateId: "tpl_a",
	});
	let saves = 0;
	const facade = createAppSettings(ownerOver(live, { onSave: () => saves++ }));
	facade.removeTemplate("tpl_a");
	assert.deepEqual(live.templates, []);
	assert.equal(live.selectedTemplateId, "");
	assert.equal(saves, 1);
});

// ===== #46：值域不变式在变更处成立 =====

test("toggleDateField 全部取消是合法状态，不回填默认", () => {
	const s = state({ dateFields: ["due"] });
	toggleDateField(s, "due", false);
	assert.deepEqual(s.dateFields, []);
});

test("setGenerationParams 只收有限数值，其余项保持原值", () => {
	const s = state();
	setGenerationParams(s, { temperature: 0.2, maxTokens: Number.NaN, timeoutSeconds: 30 });
	assert.equal(s.temperature, 0.2);
	assert.equal(s.maxTokens, DEFAULT_SETTINGS.maxTokens);
	assert.equal(s.timeoutSeconds, 30);
});

test("setSelectedTemplateId 模板不存在：回退为空（极简模式）", () => {
	const s = state({ templates: [{ id: "tpl_a", name: "A", content: "a" }] });
	setSelectedTemplateId(s, "tpl_gone");
	assert.equal(s.selectedTemplateId, "");
});
