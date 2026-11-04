/**
 * 测试专用 resolve 钩子：把裸标识 "obsidian"（纯类型包，运行时不可解析）
 * 重定向到本地替身 test/fakes/obsidian-stub.ts。
 *
 * 用法：node --import tsx --import ./test/fakes/obsidian-shim.mjs --test ...
 */

import { registerHooks } from "node:module";

const stubUrl = new URL("./obsidian-stub.ts", import.meta.url).href;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "obsidian") {
			return { url: stubUrl, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
});
