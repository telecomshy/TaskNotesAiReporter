/**
 * Obsidian HTTP 传输层：包装 obsidian 的 requestUrl 为 RequestFn。
 * 这是本模块中唯一静态依赖 obsidian 的地方，便于测试时 mock 隔离。
 */

import { requestUrl } from "obsidian";
import type { RequestFn } from "./client";

/** 基于 obsidian requestUrl 的默认 HTTP 传输实现 */
export const requestUrlTransport: RequestFn = async (params) => {
	const res = await requestUrl({
		url: params.url,
		method: params.method,
		headers: params.headers,
		body: params.body,
		throw: params.throw,
	});
	return { status: res.status, json: res.json, text: res.text };
};
