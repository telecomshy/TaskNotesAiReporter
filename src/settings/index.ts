/**
 * 设置页主入口：Tab 栏 + 内容分派。
 * 各 Tab 的具体渲染逻辑拆分为：
 *  - modelTab.ts      「模型配置」Tab
 *  - templateTab.ts   「模板配置」Tab
 *  - generalTab.ts    「常规配置」Tab
 */

import { PluginSettingTab, type App } from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import { renderModelTab } from "./modelTab";
import { renderGeneralTab } from "./generalTab";
import { renderTemplateTab } from "./templateTab";

/** 各 Tab 渲染共享的上下文 */
export interface SettingsTabContext {
	plugin: TaskNotesAIHelperPlugin;
	app: App;
	/** 重新渲染整个设置页（切换 Tab 或保存后刷新）。 */
	refresh: () => void;
}

type TabName = "model" | "general" | "template";

export class TaskNotesAIHelperSettingTab extends PluginSettingTab {
	private currentTab: TabName = "model";

	constructor(
		app: App,
		private plugin: TaskNotesAIHelperPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("tah-settings");

		// Tab 栏
		const tabBar = containerEl.createDiv({ cls: "tah-tab-bar" });
		const modelTabBtn = tabBar.createEl("button", { text: "模型配置" });
		const templateTabBtn = tabBar.createEl("button", { text: "模板配置" });
		const generalTabBtn = tabBar.createEl("button", { text: "常规配置" });
		modelTabBtn.addClass("tah-tab-btn");
		templateTabBtn.addClass("tah-tab-btn");
		generalTabBtn.addClass("tah-tab-btn");

		const content = containerEl.createDiv({ cls: "tah-tab-content" });

		const refresh = () => {
			modelTabBtn.toggleClass("tah-tab-active", this.currentTab === "model");
			generalTabBtn.toggleClass("tah-tab-active", this.currentTab === "general");
			templateTabBtn.toggleClass("tah-tab-active", this.currentTab === "template");

			content.empty();
			const ctx: SettingsTabContext = {
				plugin: this.plugin,
				app: this.app,
				refresh,
			};
			if (this.currentTab === "model") {
				renderModelTab(content, ctx);
			} else if (this.currentTab === "template") {
				renderTemplateTab(content, ctx);
			} else {
				renderGeneralTab(content, ctx);
			}
		};

		modelTabBtn.addEventListener("click", () => {
			this.currentTab = "model";
			refresh();
		});
		generalTabBtn.addEventListener("click", () => {
			this.currentTab = "general";
			refresh();
		});
		templateTabBtn.addEventListener("click", () => {
			this.currentTab = "template";
			refresh();
		});

		refresh();
	}
}
