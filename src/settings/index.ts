/**
 * 设置页主入口：Tab 栏 + 内容分派。
 * 各 Tab 的具体渲染逻辑拆分为：
 *  - modelTab.ts      「模型配置」Tab
 *  - templateTab.ts   「模板配置」Tab
 *  - generalTab.ts    「常规配置」Tab
 */

import { PluginSettingTab, type App, type EventRef } from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import { renderModelTab } from "./modelTab";
import { renderGeneralTab } from "./generalTab";
import { renderTemplateTab } from "./templateTab";

type TabName = "model" | "general" | "template";

export class TaskNotesAIHelperSettingTab extends PluginSettingTab {
	private currentTab: TabName = "model";
	/** 密钥存储变化订阅（每次 display 重新绑定，见 ADR-0008）。 */
	private secretRef: EventRef | null = null;

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
		const modelTabBtn = tabBar.createEl("button", { text: this.plugin.t("settings.tabModel") });
		const templateTabBtn = tabBar.createEl("button", {
			text: this.plugin.t("settings.tabTemplate"),
		});
		const generalTabBtn = tabBar.createEl("button", {
			text: this.plugin.t("settings.tabGeneral"),
		});
		modelTabBtn.addClass("tah-tab-btn");
		templateTabBtn.addClass("tah-tab-btn");
		generalTabBtn.addClass("tah-tab-btn");

		const content = containerEl.createDiv({ cls: "tah-tab-content" });

		const refresh = () => {
			// 语言可能已切换：同步 Tab 文案
			modelTabBtn.setText(this.plugin.t("settings.tabModel"));
			templateTabBtn.setText(this.plugin.t("settings.tabTemplate"));
			generalTabBtn.setText(this.plugin.t("settings.tabGeneral"));

			modelTabBtn.toggleClass("tah-tab-active", this.currentTab === "model");
			generalTabBtn.toggleClass("tah-tab-active", this.currentTab === "general");
			templateTabBtn.toggleClass("tah-tab-active", this.currentTab === "template");

			content.empty();
			// 切片按当前 tab 现场构造（#98）：界面语言切换后 t 是最新的，且每个 tab 只拿到自己的依赖。
			if (this.currentTab === "model") {
				renderModelTab(content, {
					app: this.app,
					settings: this.plugin.settings,
					providers: this.plugin.providers,
					t: this.plugin.t,
					refresh,
				});
			} else if (this.currentTab === "template") {
				renderTemplateTab(content, {
					app: this.app,
					settings: this.plugin.settings,
					appSettings: this.plugin.appSettings,
					t: this.plugin.t,
					refresh,
				});
			} else {
				renderGeneralTab(content, {
					settings: this.plugin.settings,
					appSettings: this.plugin.appSettings,
					t: this.plugin.t,
					applyLanguage: () => this.plugin.applyLanguage(),
					refresh,
				});
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

		// 密钥存储变化（增删改）时重渲染，刷新密钥控件的「不可用」提示。
		if (this.secretRef) this.app.secretStorage.offref(this.secretRef);
		this.secretRef = this.app.secretStorage.on("changed", () => refresh());

		refresh();
	}

	hide(): void {
		if (this.secretRef) {
			this.app.secretStorage.offref(this.secretRef);
			this.secretRef = null;
		}
		super.hide();
	}
}
