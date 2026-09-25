/**
 * 设置定义的控件键路由（#54，Path A 迁移的 TDD seam）。
 *
 * 只断言外部可见契约：控件键 ↔ 读哪里 / 写哪里，以及定义里出现的键与路由表双向一致。
 * 不断言定义对象的渲染细节（那是 Obsidian 框架的事）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import {
	generalSettingDefinitions,
	readControlValue,
	routeControlKey,
	writeControlValue,
	type ControlWriter,
} from "../src/settings/definitions";
import { DEFAULT_SETTINGS, type TaskNotesAIHelperSettings } from "../src/types";
import type { SettingsSnapshot } from "../src/settings/owner";
import type { Translator } from "../src/i18n";

/** 翻译器替身：键原样返回，测试不依赖任何语言文案。 */
const t: Translator = (key) => key;

function snapshot(over: Partial<TaskNotesAIHelperSettings> = {}): SettingsSnapshot {
	return { ...DEFAULT_SETTINGS, ...over };
}

/** 写入端口替身：记录每次调用的方法与实参。 */
function recordingWriter(): {
	writer: ControlWriter;
	calls: Array<{ method: string; args: unknown[] }>;
} {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const record = (method: string) => (...args: unknown[]) => {
		calls.push({ method, args });
		return Promise.resolve();
	};
	return {
		writer: {
			setReportFolder: record("setReportFolder"),
			toggleDateField: record("toggleDateField"),
			setWeekStartsOnMonday: record("setWeekStartsOnMonday"),
			setReportLanguage: record("setReportLanguage"),
			setUiLanguage: record("setUiLanguage"),
		},
		calls,
	};
}

test("路由：五个域的控件键各落到对应的门面命令（#54）", () => {
	assert.deepEqual(routeControlKey("reportFolder"), { kind: "reportFolder" });
	assert.deepEqual(routeControlKey("weekStartsOnMonday"), { kind: "weekStartsOnMonday" });
	assert.deepEqual(routeControlKey("language"), { kind: "reportLanguage" });
	assert.deepEqual(routeControlKey("uiLanguage"), { kind: "uiLanguage" });
	assert.deepEqual(routeControlKey("dateField.completedDate"), {
		kind: "dateField",
		field: "completedDate",
	});
	assert.deepEqual(routeControlKey("dateField.due"), { kind: "dateField", field: "due" });
	assert.deepEqual(routeControlKey("dateField.scheduled"), {
		kind: "dateField",
		field: "scheduled",
	});
	assert.deepEqual(routeControlKey("dateField.dateCreated"), {
		kind: "dateField",
		field: "dateCreated",
	});
});

test("路由：未知键一律无路由（#54）", () => {
	for (const key of ["", "nope", "dateField.", "dateField.bogus", "ReportFolder", "language2"]) {
		assert.equal(routeControlKey(key), null, key);
	}
});

test("读：控件键取到设置快照上的对应值（#54）", () => {
	const settings = snapshot({
		reportFolder: "MyReports",
		weekStartsOnMonday: false,
		language: "中文",
		uiLanguage: "zh",
		dateFields: ["due", "scheduled"],
	});
	assert.equal(readControlValue(settings, "reportFolder"), "MyReports");
	assert.equal(readControlValue(settings, "weekStartsOnMonday"), false);
	assert.equal(readControlValue(settings, "language"), "中文");
	assert.equal(readControlValue(settings, "uiLanguage"), "zh");
	assert.equal(readControlValue(settings, "dateField.completedDate"), false);
	assert.equal(readControlValue(settings, "dateField.due"), true);
	assert.equal(readControlValue(settings, "dateField.scheduled"), true);
	assert.equal(readControlValue(settings, "dateField.dateCreated"), false);
});

test("读：未知键返回 undefined，由框架 defaultValue 兜底（#54）", () => {
	assert.equal(readControlValue(snapshot(), "nope"), undefined);
});

test("写：控件变更落到对应的门面命令，实参原样透传（#54）", async () => {
	const { writer, calls } = recordingWriter();
	await writeControlValue(writer, { kind: "reportFolder" }, "  MyReports  ");
	await writeControlValue(writer, { kind: "weekStartsOnMonday" }, true);
	await writeControlValue(writer, { kind: "reportLanguage" }, "中文");
	await writeControlValue(writer, { kind: "uiLanguage" }, "auto");
	await writeControlValue(writer, { kind: "dateField", field: "due" }, false);
	// 值域归一是门面/命令的既有职责（#46）：路由层只按控件类型做形状归一。
	assert.deepEqual(calls, [
		{ method: "setReportFolder", args: ["  MyReports  "] },
		{ method: "setWeekStartsOnMonday", args: [true] },
		{ method: "setReportLanguage", args: ["中文"] },
		{ method: "setUiLanguage", args: ["auto"] },
		{ method: "toggleDateField", args: ["due", false] },
	]);
});

test("写：开关类控件的值归一为布尔（#54）", async () => {
	const { writer, calls } = recordingWriter();
	await writeControlValue(writer, { kind: "dateField", field: "due" }, "truthy");
	await writeControlValue(writer, { kind: "weekStartsOnMonday" }, 0);
	assert.deepEqual(calls, [
		{ method: "toggleDateField", args: ["due", true] },
		{ method: "setWeekStartsOnMonday", args: [false] },
	]);
});

// 控件键契约：定义里出现的键 ↔ 路由表可路由的键，双向相等（防「搜得到却写不进」）。

const CONTRACT_KEYS = [
	"reportFolder",
	"weekStartsOnMonday",
	"language",
	"uiLanguage",
	"dateField.completedDate",
	"dateField.due",
	"dateField.scheduled",
	"dateField.dateCreated",
];

function controlKeysOf(items: readonly SettingDefinitionItem[]): string[] {
	const keys: string[] = [];
	for (const item of items as readonly (SettingDefinitionItem | SettingGroupItem)[]) {
		if ("items" in item && item.items) keys.push(...controlKeysOf(item.items));
		if ("control" in item && item.control) keys.push(item.control.key);
	}
	return keys;
}

test("键契约：定义里恰好是可路由的那组控件键（#54）", () => {
	const keys = controlKeysOf(generalSettingDefinitions(t));
	assert.deepEqual([...keys].sort(), [...CONTRACT_KEYS].sort());
	for (const key of keys) assert.notEqual(routeControlKey(key), null, key);
});
