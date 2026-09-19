import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: [
			"main.js",
			"node_modules/**",
			"docs/**",
			"test/**",
			"scripts/**",
			"package.json",
			"esbuild.config.mjs",
			"*.config.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	{
		// request.ts 用全局定时器以保持 Node 测试环境可运行（ADR-0002），豁免 window 定时器规则。
		files: ["src/ai/request.ts"],
		rules: { "obsidianmd/prefer-window-timers": "off" },
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
	},
]);
