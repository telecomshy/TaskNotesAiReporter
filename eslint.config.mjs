import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: [
			"main.js",
			"node_modules/**",
			// 这两条镜像 .gitignore：ESLint 9 flat config 不读 .gitignore，
			// 漏掉会让 `eslint .` 爬 1787 个外部文件（单文件约 60s，跑不完）。
			"tasknotes-main/**",
			".temp/**",
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
