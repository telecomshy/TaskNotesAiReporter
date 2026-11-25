/**
 * 「接口方言」取值与归一（#105，见 CONTEXT.md「接口方言」）。
 *
 * 方言是供应商级属性，读取侧经**单一取值函数**归一（缺省 OpenAI 兼容）——
 * 支持两套方言的供应商不在类型上分叉。载入不发明缺省值（存量数据零变更）。
 * 执行侧的「请求配置」与供应商属性共用同一个归一处（`resolveApiStyle`），
 * 缺省字面量只在这里写一次。
 *
 * 纯函数，无 obsidian、无 DOM。
 */

import type { ApiStyle, ModelProvider } from "../types";

/**
 * 归一的唯一出处：未指明 / 非法一律读作 OpenAI 兼容。
 * 供应商属性（`apiStyleOf`）与执行配置（`isAnthropic` / 思考候选）都走它。
 */
export function resolveApiStyle(raw: unknown): ApiStyle {
	return raw === "anthropic" ? "anthropic" : "openai";
}

/** 供应商属性的方言：存量自定义供应商缺 `apiStyle` 时升级零变更（#105 裁决 2）。 */
export function apiStyleOf(provider: Pick<ModelProvider, "apiStyle">): ApiStyle {
	return resolveApiStyle(provider.apiStyle);
}

/** 归一单个方言值：非法返回 `undefined`（＝数据里没有这一项，载入不补缺省）。 */
export function coerceApiStyle(value: unknown): ApiStyle | undefined {
	return value === "openai" || value === "anthropic" ? value : undefined;
}

/** 该方言（可缺省）是否为 Anthropic 兼容：地址 / 认证头 / 请求体 / 响应读取分派的唯一判据。 */
export function isAnthropic(apiStyle?: ApiStyle): boolean {
	return resolveApiStyle(apiStyle) === "anthropic";
}
