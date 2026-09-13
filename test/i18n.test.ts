import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator, resolveLanguage } from "../src/i18n";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";

/** 收集字符串表的叶子键路径（数组视为叶子），用于校验两种语言键集一致。 */
function leafKeys(value: unknown, prefix = ""): string[] {
	if (Array.isArray(value)) return [prefix];
	if (value && typeof value === "object") {
		return Object.keys(value).flatMap((k) =>
			leafKeys((value as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k)
		);
	}
	return [prefix];
}

test("auto：zh 解析为中文", () => {
	assert.equal(resolveLanguage("zh", "auto"), "zh");
});

test("auto：zh-TW 归入中文", () => {
	assert.equal(resolveLanguage("zh-TW", "auto"), "zh");
});

test("auto：en 解析为英文", () => {
	assert.equal(resolveLanguage("en", "auto"), "en");
});

test("auto：非中英文回退英文", () => {
	assert.equal(resolveLanguage("ja", "auto"), "en");
	assert.equal(resolveLanguage("fr", "auto"), "en");
});

test("auto：大小写不敏感", () => {
	assert.equal(resolveLanguage("ZH", "auto"), "zh");
	assert.equal(resolveLanguage("EN-US", "auto"), "en");
});

test("手动覆盖优先于自动检测", () => {
	assert.equal(resolveLanguage("zh", "en"), "en");
	assert.equal(resolveLanguage("en", "zh"), "zh");
});

test("翻译：命中当前语言并做 {{var}} 插值", () => {
	const t = createTranslator({ notice: { addedTasks: "已加入 {{count}} 个任务" } });
	assert.equal(t("notice.addedTasks", { count: 3 }), "已加入 3 个任务");
});

test("翻译：当前语言缺失时回退英文", () => {
	const t = createTranslator({});
	assert.equal(t("command.generateReport"), "Generate task report");
});

test("翻译：未知 key 原样返回 key", () => {
	const t = createTranslator({});
	assert.equal(t("does.not.exist"), "does.not.exist");
});

test("翻译：count 不为 1 时优先取 _plural 变体", () => {
	const t = createTranslator({
		notice: {
			addedTasks: "Added {{count}} task",
			addedTasks_plural: "Added {{count}} tasks",
		},
	});
	assert.equal(t("notice.addedTasks", { count: 2 }), "Added 2 tasks");
	assert.equal(t("notice.addedTasks", { count: 1 }), "Added 1 task");
});

test("翻译：当前语言无 _plural 变体时用单数形态", () => {
	const t = createTranslator({ notice: { addedTasks: "已加入 {{count}} 个任务" } });
	assert.equal(t("notice.addedTasks", { count: 5 }), "已加入 5 个任务");
});

test("翻译：当前语言完全缺失时，count 非 1 回退英文复数", () => {
	const t = createTranslator({});
	assert.equal(t("notice.addedTasks", { count: 2 }), "Added 2 tasks");
	assert.equal(t("notice.addedTasks", { count: 1 }), "Added 1 task");
});

test("目录完整性：英文与中文键集完全一致", () => {
	assert.deepEqual(leafKeys(zh).sort(), leafKeys(en).sort());
});
