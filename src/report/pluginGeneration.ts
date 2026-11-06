/**
 * 「生成」装配工厂（#101）：把 ReportModal 内联的装配收进一处、进入测试面。
 *
 * 装配 = 用户意图之外的一切接线：设置查询的 7 字段投影（GenerateSettings 由 Pick 派生，
 * 漏投影即编译错）、当前模型 解析、chat / save 的缺省包装、时间源。`generate.ts` 保持
 * 零 obsidian 依赖；本模块是插件侧装配层，允许依赖 obsidian 与真实传输。
 *
 * 注入风格照 #93 / #97 先例：窄切片（providers 只要 resolveActive）+ 可选传输缝
 * （chat / save 可注入、缺省真实）。重入守卫随 `createGeneration` 入口走：工厂每次调用
 * 建一个入口，弹窗打开时建一次、期间重复调用同一个入口（双击只产出一份 报告）。
 */

import { chatCompletion } from "../ai/client";
import { saveReport } from "./writer";
import type { App } from "obsidian";
import type { ActiveModelResolution } from "../types";
import type { TaskRepository } from "../tasks/repository";
import type { SettingsSnapshot } from "../settings/owner";
import { createGeneration, type GenerateDeps, type GenerateEntry } from "./generate";

/** 装配工厂的依赖：app 绑定 save、设置查询、当前模型 解析的窄切片、打开时固定的仓库。 */
export interface PluginGenerationDeps {
	/** saveReport 绑定用（缺省 save 写 vault 需要它）。 */
	app: App;
	/**
	 * 设置查询：生成时读取（保 #49 修订三语义）。
	 * 收只读快照（SettingsSnapshot）——投影 7 字段时模板数组复制为可变读面，装配层不持有可变设置。
	 */
	settings(): SettingsSnapshot;
	/** 供应商模块对 当前模型 的解析（窄切片，ProviderSettings 结构满足；ADR-0010）。 */
	providers: { resolveActive(): ActiveModelResolution };
	/** 界面打开时已打开的仓库；生成期间沿用它，不重判 来源缺失（#45 / #49 修订一）。 */
	repository: TaskRepository;
	/** 可注入传输缝（测试用）；缺省：chatCompletion 包装（单条 user 消息）。 */
	chat?: GenerateDeps["chat"];
	/** 可注入保存缝（测试用）；缺省：saveReport(app, …)。 */
	save?: GenerateDeps["save"];
	/** 可注入时间缝（测试用）；缺省：当前时刻。 */
	now?: GenerateDeps["now"];
}

/**
 * 构造 生成 的插件侧装配入口：内部调 `createGeneration`，返回同一类型入口。
 * 弹窗打开（repository 就绪）时调用一次；每次生成即调用入口本身。
 */
export function createPluginGeneration(deps: PluginGenerationDeps): GenerateEntry {
	return createGeneration({
		repository: deps.repository,
		settings: () => {
			// 7 字段投影：GenerateSettings 是 Pick 派生——Pick 本身增删字段时，漏改这里
			// （或缺字段）即编译失败，不再静默不生效（#101）。
			const s = deps.settings();
			return {
				language: s.language,
				weekStartsOnMonday: s.weekStartsOnMonday,
				reportFolder: s.reportFolder,
				temperature: s.temperature,
				maxTokens: s.maxTokens,
				timeoutSeconds: s.timeoutSeconds,
				// 只读快照的模板数组复制成可变读面（Pick 侧保留 TaskNotesAIHelperSettings 的形状）。
				templates: [...s.templates],
			};
		},
		resolveModel: () => deps.providers.resolveActive(),
		chat:
			deps.chat ??
			((prompt, config) => chatCompletion(config, [{ role: "user", content: prompt }])),
		save:
			deps.save ??
			((folder, range, content, templateName) =>
				saveReport(deps.app, folder, range, content, templateName)),
		now: deps.now ?? (() => new Date()),
	});
}
