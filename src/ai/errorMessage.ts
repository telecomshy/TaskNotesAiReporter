/**
 * 把 AI 客户端错误描述为当前界面语言的用户提示。
 * 纯函数：依赖 i18n 翻译器，不依赖 Obsidian。
 * 服务端返回的原始详情（外部数据）原样带入，不翻译。
 */

import { AIClientError } from "./errors";
import type { Translator } from "../i18n";

export function describeAIError(error: unknown, t: Translator): string {
	if (!(error instanceof AIClientError)) {
		return error instanceof Error ? error.message : String(error);
	}
	const { detail, status, ms } = error.details;
	switch (error.code) {
		case "models.network":
			return t("aiError.modelsNetwork", { detail: detail ?? "" });
		case "models.http":
			return t("aiError.modelsHttp", { status: status ?? 0, detail: detail ?? "" });
		case "models.parse":
			return t("aiError.modelsParse");
		case "chat.network":
			return t("aiError.chatNetwork", { detail: detail ?? "" });
		case "chat.http":
			return t("aiError.chatHttp", { status: status ?? 0, detail: detail ?? "" });
		case "chat.empty":
			return t("aiError.chatEmpty");
		case "chat.parse":
			return t("aiError.chatParse");
		case "timeout":
			return t("aiError.timeout", { ms: ms ?? 0 });
	}
}
