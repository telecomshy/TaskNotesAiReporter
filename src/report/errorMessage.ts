/**
 * 把报告生成失败描述为当前界面语言的用户提示（#51：单一判别式结果 + 一个描述器）。
 * 纯函数：依赖 i18n 翻译器与 AI 错误描述器，不依赖 Obsidian / DOM。
 *
 * switch 六个 case 穷举、无 default（TS 穷尽性检查兜底，将来新增原因编译不过）。
 * `save-error` 用独立文案，不再调用 describeAIError——保存失败被说成模型错误的误路由已删（#51 修订三）。
 */

import { describeAIError } from "../ai/errorMessage";
import type { Translator } from "../i18n";
import type { GenerateReportFailure } from "./generate";

export function describeReportFailure(failure: GenerateReportFailure, t: Translator): string {
	switch (failure.reason) {
		case "no-tasks":
			return t("report.failureNoTasks");
		case "no-provider":
		case "no-model":
			// 两个解析失败子原因渲染同一句（对外文案与历史一致，#51 修订二）；子原因留在结果类型上。
			return t("report.failureNoModel");
		case "missing-credentials":
			return t("report.failureMissingCredentials");
		case "ai-error":
			return t("report.failureGeneric", { message: describeAIError(failure.error, t) });
		case "save-error":
			return t("report.failureSave");
	}
}
