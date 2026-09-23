import { test } from "node:test";
import assert from "node:assert/strict";
import {
	capabilitiesOf,
	openSource,
	sourceMissingMessageKey,
	type SourceAdapters,
} from "../src/source";
import { fakeTaskRepository } from "./fakes/taskRepository";
import { createTasksSource } from "../src/tasks/tasksRepository";
import { stripContextTokens } from "../src/core/filter";
import { TASK_SOURCE_VALUES } from "../src/settings/values";
import { BUNDLES, createTranslator } from "../src/i18n";

// ===== #45：打开来源是唯一入口，返回判别式 =====

test("打开来源：可用适配器 → 已打开，带能力与仓库", () => {
	const repo = fakeTaskRepository();
	const adapters: SourceAdapters = {
		tasknotes: () => repo,
		"obsidian-tasks": () => null,
	};
	const result = openSource("tasknotes", adapters);
	assert.equal(result.ok, true);
	if (!result.ok) throw new Error("unreachable");
	assert.equal(result.repo, repo, "成功分支交出的仓库应是适配器给出的那一个");
});

test("打开来源：适配器为 null → 来源缺失（不返回裸 null）", () => {
	const adapters: SourceAdapters = {
		tasknotes: () => null,
		"obsidian-tasks": () => null,
	};
	for (const source of TASK_SOURCE_VALUES) {
		const result = openSource(source, adapters);
		assert.deepEqual(result, { ok: false, reason: "source-missing" });
	}
});

test("Tasks 来源适配器（假 deps）：插件未启用 → 来源缺失（#53）", () => {
	const adapters: SourceAdapters = {
		tasknotes: () => fakeTaskRepository(),
		"obsidian-tasks": createTasksSource({
			enabled: () => false,
			listLines: async () => null,
			readNote: async () => null,
		}),
	};
	assert.deepEqual(openSource("obsidian-tasks", adapters), {
		ok: false,
		reason: "source-missing",
	});
});

test("Tasks 来源适配器（假 deps）：启用但 listLines 为 null → 列表为 null（界面按来源缺失提示，#53）", async () => {
	const adapters: SourceAdapters = {
		tasknotes: () => fakeTaskRepository(),
		"obsidian-tasks": createTasksSource({
			enabled: () => true,
			listLines: async () => null,
			readNote: async () => null,
		}),
	};
	const opened = openSource("obsidian-tasks", adapters);
	assert.equal(opened.ok, true, "探针为正时打开成功（中途读不到数据不重判来源缺失）");
	if (!opened.ok) throw new Error("unreachable");
	assert.equal(await opened.repo.list(), null);
});

test("打开来源：未知来源值也判为来源缺失，不抛异常", () => {
	const result = openSource("nonsense" as never, {} as SourceAdapters);
	assert.deepEqual(result, { ok: false, reason: "source-missing" });
});

// ===== 来源能力：一处陈述 =====

test("来源能力：TaskNotes 提供上下文，Obsidian Tasks 不提供", () => {
	assert.deepEqual(capabilitiesOf("tasknotes"), { supportsContexts: true });
	assert.deepEqual(capabilitiesOf("obsidian-tasks"), { supportsContexts: false });
});

test("来源能力随打开结果一并交出（界面据能力行事，不判断来源字符串）", () => {
	const adapters: SourceAdapters = {
		tasknotes: () => fakeTaskRepository(),
		"obsidian-tasks": () => fakeTaskRepository(),
	};
	const opened = (source: "tasknotes" | "obsidian-tasks") => {
		const result = openSource(source, adapters);
		assert.equal(result.ok, true, `${source} 应能打开`);
		if (!result.ok) throw new Error("unreachable");
		return result.capabilities;
	};
	assert.deepEqual(opened("tasknotes"), { supportsContexts: true });
	assert.deepEqual(opened("obsidian-tasks"), { supportsContexts: false });
});

test("来源缺失文案键：按来源一处陈述，两个键都已登记", () => {
	assert.equal(sourceMissingMessageKey("tasknotes"), "report.tasknotesMissing");
	assert.equal(sourceMissingMessageKey("obsidian-tasks"), "report.obsidianTasksMissing");
});

test("来源相关文案键在两种界面语言下都已登记（防止加来源漏文案）", () => {
	const keys = [
		...TASK_SOURCE_VALUES.map(sourceMissingMessageKey),
		"settings.taskSourceName",
		"settings.taskSourceDesc",
		"settings.taskSourceTaskNotes",
		"settings.taskSourceObsidianTasks",
		"taskPicker.contextsUnsupported",
	];
	for (const bundle of [BUNDLES.en, BUNDLES.zh]) {
		const t = createTranslator(bundle);
		for (const key of keys) {
			assert.notEqual(t(key), key, `文案键 ${key} 未登记`);
		}
	}
});

// ===== UI 层禁用 @上下文（不改 parseTitleQuery） =====

test("stripContextTokens 只去掉 @令牌，关键字与 #标签 原样保留", () => {
	assert.equal(stripContextTokens("alpha #work @office beta"), "alpha #work  beta");
	assert.equal(stripContextTokens("@office"), "");
	assert.equal(stripContextTokens("plain keyword"), "plain keyword");
	assert.equal(stripContextTokens("a@b"), "a@b", "非独立令牌的 @ 不算上下文");
	// 空白形态不敏感：语义是「去掉 @令牌，其余内容不丢」
	const mixed = stripContextTokens("  @x   #y  ");
	assert.ok(!mixed.includes("@x"), "@令牌应被去掉");
	assert.ok(mixed.includes("#y"), "#标签 应保留");
	assert.ok(!mixed.trim().includes(" "), "留下的令牌不应被拆散");
});

test("stripContextTokens 幂等", () => {
	const once = stripContextTokens("k #t @c");
	assert.equal(stripContextTokens(once), once);

});
