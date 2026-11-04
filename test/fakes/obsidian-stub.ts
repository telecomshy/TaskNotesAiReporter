/**
 * 测试专用的 obsidian 运行时替身：经 test/fakes/obsidian-shim.mjs 的 resolve 钩子
 * 接管 `import "obsidian"`（真实包是纯类型包，运行时不可解析）。
 *
 * 只实现本插件拉取链路用到的四个出口：Notice / SecretComponent / Modal / requestUrl。
 * 各 fake 把发生的事记进模块级数组，测试从本模块导入这些记录器。
 */

import { FakeEl, type CreateOpts } from "./dom";

// ===== Notice =====

export const notices: string[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

// ===== SecretComponent =====

export class SecretComponent {
	static readonly instances: SecretComponent[] = [];

	value = "";
	private changeCb: ((value: string) => void) | null = null;

	constructor(_app: unknown, _host?: unknown) {
		SecretComponent.instances.push(this);
	}

	setValue(value: string): this {
		this.value = value;
		return this;
	}

	onChange(cb: (value: string) => void): this {
		this.changeCb = cb;
		return this;
	}

	/** 测试用：模拟用户改选 / 清空密钥名。 */
	trigger(value: string): void {
		this.value = value;
		this.changeCb?.(value);
	}
}

// ===== Modal =====

export class Modal {
	static readonly opened: Modal[] = [];

	readonly modalEl = new FakeEl("div");
	readonly contentEl = new FakeEl("div");

	constructor(_app: unknown) {}

	setTitle(_title: string): this {
		return this;
	}

	open(): void {
		Modal.opened.push(this);
		(this as { onOpen?: () => void }).onOpen?.();
	}

	close(): void {
		(this as { onClose?: () => void }).onClose?.();
	}
}

// ===== requestUrl =====

export interface CapturedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

export interface CannedResponse {
	status: number;
	json?: unknown;
	text?: string;
}

export const requests: CapturedRequest[] = [];
export let respond: (req: CapturedRequest) => CannedResponse = () => ({ status: 200, json: {} });

/** 重置捕获与默认响应（每个用例开头调用）。 */
export function resetRequests(canned: CannedResponse = { status: 200, json: { data: [] } }): void {
	requests.length = 0;
	respond = () => canned;
}

export async function requestUrl(params: CapturedRequest): Promise<CannedResponse> {
	requests.push({ url: params.url, method: params.method, headers: params.headers, body: params.body });
	return respond(params);
}

// ===== 其它占位出口（宽松兜底，供意外触达的代码路径使用） =====

export class PluginSettingTab {
	constructor(_app: unknown, _plugin: unknown) {}
}

export class Setting {
	constructor(_containerEl?: unknown) {}
}

export class TFile {}

export class TFolder {}

export const normalizePath = (p: string): string => p;

export type App = unknown;
export type EventRef = unknown;
export type { CreateOpts };
