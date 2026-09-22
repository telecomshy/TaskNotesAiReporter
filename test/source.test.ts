import { test } from "node:test";
import assert from "node:assert/strict";
import {
	capabilitiesOf,
	openSource,
	sourceMissingMessageKey,
	type SourceBackends,
} from "../src/source";
import { fakeTaskRepository } from "./fakes/taskRepository";
import { stripContextTokens } from "../src/core/filter";
import { TASK_SOURCE_VALUES } from "../src/settings/values";

// ===== #45：打开来源是唯一入口，返回判别式 =====

test("打开来源：可用后端 → 已打开，带能力与仓库", () => {
	const repo = fakeTaskRepository();
	const backends: SourceBackends = {
		tasknotes: () => repo,
		"obsidian-tasks": () => null,
	};
	const result = openSource("tasknotes", backends);
	assert.equal(result.ok, true);
	if (!result.ok) throw new Error("unreachable");
	assert.equal(result.repo, repo, "成功分支交出的仓库应是后端给出的那一个");
});

test("打开来源：后端为 null → 来源缺失（不返回裸 null）", () => {
	const backends: SourceBackends = {
		tasknotes: () => null,
		"obsidian-tasks": () => null,
	};
	for (const source of TASK_SOURCE_VALUES) {
		const result = openSource(source, backends);
		assert.deepEqual(result, { ok: false, reason: "source-missing" });
	}
});

test("打开来源：obsidian-tasks 在 #53 落地前的中间态走来源缺失降级", () => {
	// 这就是 main.ts 当前的中间态挂接：不崩、可单独合并（#45 修订第五节）
	const backends: SourceBackends = {
		tasknotes: () => fakeTaskRepository(),
		"obsidian-tasks": () => null,
	};
	assert.equal(openSource("obsidian-tasks", backends).ok, false);
	assert.equal(openSource("tasknotes", backends).ok, true);
});

test("打开来源：未知来源值也判为来源缺失，不抛异常", () => {
	const result = openSource("nonsense" as never, {} as SourceBackends);
	assert.deepEqual(result, { ok: false, reason: "source-missing" });
});

// ===== 来源能力：一处陈述 =====

test("来源能力：TaskNotes 提供上下文，Obsidian Tasks 不提供", () => {
	assert.deepEqual(capabilitiesOf("tasknotes"), { supportsContexts: true });
	assert.deepEqual(capabilitiesOf("obsidian-tasks"), { supportsContexts: false });
});

test("来源能力随打开结果一并交出（界面据能力行事，不判断来源字符串）", () => {
	const backends: SourceBackends = {
		tasknotes: () => fakeTaskRepository(),
		"obsidian-tasks": () => fakeTaskRepository(),
	};
	const opened = (source: "tasknotes" | "obsidian-tasks") => {
		const result = openSource(source, backends);
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
