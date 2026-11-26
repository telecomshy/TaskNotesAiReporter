/**
 * OpenAI 官方预设的「模型清单」过滤（#106）：`/v1/models` 不带任何能力 / 端点字段，
 * 只能靠内置名单把非对话模型剔掉（事实锚点见 docs/research/openai-official-preset.md）。
 * 排除优先于 `gpt-*` 粗白名单；未来新出的 `gpt-7*` 一类对话族无需改表即可出现。
 *
 * 仅 Responses 可用的对话模型（`*-pro` / `gpt-oss-*` / `gpt-5.6-cyber`）自 #110 起放回——
 * 它们的端点由「接口协议」表路由（core/wireProtocol）。`gpt-rosalind-research` 没有可核实的端点页、
 * `chat-latest` 官方不建议 API 使用，两者继续排除。
 *
 * 规则按供应商 id 选择：只有 `openai` 预设过滤，其余供应商零变更。
 * 纯函数，无 obsidian、无 DOM。
 */

/** 非对话族前缀（嵌入 / 图像 / 实时 / 语音 / 转写 / 审核）。排除优先。 */
const NON_CHAT_PREFIXES: readonly string[] = [
	"text-embedding-",
	"gpt-image-",
	"gpt-realtime-",
	"gpt-live-",
	"gpt-audio-",
	"gpt-transcribe",
	"gpt-4o-transcribe",
	"gpt-4o-mini-tts",
	"tts-",
	"whisper-",
	"omni-moderation-",
	"sora",
];

/** 精确排除：端点无官方依据的目录条目，与官方明说不建议 API 使用的别名。 */
const NON_CHAT_EXACT: readonly string[] = [
	// 目录有 ID、无独立模型页可核对端点（研究笔记 §2.2）。
	"gpt-rosalind-research",
	// 官方注明「用于 ChatGPT、不建议 API 使用」。
	"chat-latest",
];

function isExcluded(id: string): boolean {
	if (NON_CHAT_PREFIXES.some((prefix) => id.startsWith(prefix))) return true;
	return NON_CHAT_EXACT.includes(id);
}

/** 单个模型 ID 是否为 OpenAI 官方预设可用的对话模型（排除优先，再走 `gpt-*` 粗白名单）。 */
export function isOpenAIChatModel(id: string): boolean {
	if (isExcluded(id)) return false;
	return id.startsWith("gpt-");
}

/**
 * 清单过滤（#106 裁决 13 / 14）：拉取成功后、写「模型清单」前调用。
 * 只改写 `openai` 预设的结果；模型 ID 顺序原样保留，去重与清洗仍归现有写面。
 * 过滤后可能为空——调用方照实记为「空清单」，不发明错误码。
 */
export function filterModelCatalog(providerId: string, models: readonly string[]): string[] {
	if (providerId !== "openai") return [...models];
	return models.filter(isOpenAIChatModel);
}
