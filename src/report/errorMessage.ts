/**
 * 把报告生成失败描述为当前界面语言的用户提示。
 * 纯函数：依赖 i18n 翻译器与 AI 错误描述器，不依赖 Obsidian / DOM。
 * AI 类失败的原始详情由 AI 错误描述器带入，不在此重复实现。
 */

import { describeAIError } from "../ai/errorMessage";
import type { Translator } from "../i18n";
import type { GenerateReportFailure } from "./generate";

export function describeReportFailure(failure: GenerateReportFailure, t: Translator): string {
	switch (failure.reason) {
		case "no-tasks":
			return t("report.failureNoTasks");
		case "no-model":
			return t("report.failureNoModel");
		case "missing-credentials":
			return t("report.failureMissingCredentials");
		default:
			return t("report.failureGeneric", { message: describeAIError(failure.error, t) });
	}
}
