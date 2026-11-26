/**
 * 「接口协议」纯数据模块（#110，ADR-0031）：方言之内的、按（供应商, 模型）的端点选择。
 *
 * 方言（ADR-0028）仍是基线：地址根、认证头、错误语义由它决定；
 * 协议只决定该模型的对话端点路径、请求体字段与响应读取方式（`/chat/completions` vs `/responses`）。
 * 行键（供应商 id, 模型 pattern）与思考能力表 / 请求策略表同构，首个命中行生效；
 * 只有内置 `openai` 预设开行，其余供应商回落 `chat-completions`（现状零变更）。
 *
 * 只对**必需**的模型走 Responses（Chat Completions 不可用的那批）：
 * `*-pro`（后缀匹配，覆盖未来 pro 族）、`gpt-oss-*`、`gpt-5.6-cyber`。
 * Chat 可用的模型保持 Chat——官方「推理模型建议用 Responses」是性能偏好，不是可用性要求。
 *
 * 事实源 docs/research/responses-api.md；新模型族上市时与本表、清单排除表同源维护。
 * 纯函数，无 obsidian、无 DOM。
 */

import type { WireProtocol } from "../types";
import { matchModelPattern } from "./thinking";

/** 缺省协议：Chat Completions（存量行为零变更）。 */
export const DEFAULT_WIRE_PROTOCOL: WireProtocol = "chat-completions";

/** 协议表一行：按（供应商, 模型）匹配，首个命中行生效。 */
export interface WireProtocolRow {
	providerId: string;
	/** 模型匹配：精确 ID、以 `*` 结尾的前缀、或以 `*` 开头的后缀。 */
	modelPattern: string;
	protocol: WireProtocol;
}

/** 内置协议表（#110）：只给 Chat Completions 不可用的 OpenAI 模型开行。 */
export const WIRE_PROTOCOLS: readonly WireProtocolRow[] = [
	// `*-pro` 走后缀：gpt-5.5-pro / gpt-5.4-pro / gpt-5.2-pro 与未来的 pro 族一并覆盖。
	{ providerId: "openai", modelPattern: "*-pro", protocol: "responses" },
	// open-weight 族：端点表只有 Responses。
	{ providerId: "openai", modelPattern: "gpt-oss-*", protocol: "responses" },
	// 专用网络安全模型：同样是 Responses-only。
	{ providerId: "openai", modelPattern: "gpt-5.6-cyber", protocol: "responses" },
];

/**
 * 解析（供应商, 模型）的接口协议：首个命中行生效；未命中回落 `chat-completions`。
 * 执行层只消费结果，不判断供应商或模型类型。
 */
export function resolveWireProtocol(
	providerId: string,
	model: string,
	table: readonly WireProtocolRow[] = WIRE_PROTOCOLS
): WireProtocol {
	const row = table.find(
		(r) => r.providerId === providerId && matchModelPattern(r.modelPattern, model)
	);
	return row?.protocol ?? DEFAULT_WIRE_PROTOCOL;
}

/** 读取侧缺省：未带协议＝Chat Completions（存量配置与手填配置零变更）。 */
export function protocolOf(config: { protocol?: WireProtocol }): WireProtocol {
	return config.protocol ?? DEFAULT_WIRE_PROTOCOL;
}
