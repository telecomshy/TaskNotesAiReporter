/**
 * 「来源」深 module（见 #45）。
 *
 * interface 只有两样：**打开来源**（判别式：已打开 | 来源缺失）与 **来源能力**。
 * 来源差异只在来源处陈述——调用方不再对来源字符串做能力判断，
 * 将来接入新任务插件只需写一个 adapter（#44 用户故事 22）。
 *
 * 本模块纯逻辑，不依赖 obsidian / DOM，可在 Node 单测；真实适配器的挂接由边界注入。
 */

import type { TaskRepository } from "../tasks/repository";
import type { TaskSource } from "../types";

/**
 * 来源能力：由来源自述，界面据它决定行为（而非自行判断来源字符串）。
 */
export interface SourceCapabilities {
	/** 是否提供「上下文」维度。TaskNotes 有；Obsidian Tasks 无（见 #45）。 */
	supportsContexts: boolean;
}

/** 打开来源的判别式结果：已打开（带能力与仓库）| 来源缺失。 */
export type OpenSourceResult =
	| { ok: true; capabilities: SourceCapabilities; repo: TaskRepository }
	| { ok: false; reason: "source-missing" };

/**
 * 各来源的适配器挂接点：给定来源名返回其适配器，`null` 表示来源缺失（插件未启用）。
 * 由边界注入真实实现，测试注入假实现。
 */
export type SourceAdapters = Record<TaskSource, () => TaskRepository | null>;

/**
 * 来源能力：**一处陈述**。
 * Obsidian Tasks 不提供「上下文」维度——界面据此禁用 `@` 输入（见 #45 修订第四节）。
 */
export function capabilitiesOf(source: TaskSource): SourceCapabilities {
	return { supportsContexts: source === "tasknotes" };
}

/**
 * 打开来源：这是来源切换 / 检测的**唯一入口**。
 *
 * 恒返回判别式、不返回裸 `null`；「来源不可用」只经 `source-missing` 表达，
 * 成功分支里的 `repo` 永不为 `null`。
 */
export function openSource(source: TaskSource, adapters: SourceAdapters): OpenSourceResult {
	const open = adapters[source];
	const repo = typeof open === "function" ? open() : null;
	if (!repo) return { ok: false, reason: "source-missing" };
	return { ok: true, capabilities: capabilitiesOf(source), repo };
}

/** 来源缺失时的提示文案键（一处陈述；界面不自行判断来源字符串）。 */
export type SourceMissingMessageKey = "report.tasknotesMissing" | "report.obsidianTasksMissing";

export function sourceMissingMessageKey(source: TaskSource): SourceMissingMessageKey {
	return source === "tasknotes" ? "report.tasknotesMissing" : "report.obsidianTasksMissing";
}
