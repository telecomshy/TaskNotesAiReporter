/**
 * 设置页主入口（#54，Path A：Obsidian 声明式设置 API）。
 *
 * 顶层 = 两个自绘子页入口（模型 / 模板）+「常规」域的声明式定义（平铺，进设置搜索索引）。
 * 自绘子页复用 modelTab / templateTab 的渲染函数，包进 `SettingPage`；
 * 控件读写经 `./definitions` 的路由落到门面，视图不直写设置（#46）。
 */

import {
	PluginSettingTab,
	SettingPage,
	type App,
	type SettingDefinitionItem,
} from "obsidian";
import type TaskNotesAIHelperPlugin from "../../main";
import { renderModelTab } from "./modelTab";
import { renderTemplateTab } from "./templateTab";
import {
	generalSettingDefinitions,
	readControlValue,
	routeControlKey,
	writeControlValue,
} from "./definitions";

/** 各渲染入口共享的上下文 */
export interface SettingsTabContext {
	plugin: TaskNotesAIHelperPlugin;
	app: App;
	/** 重新渲染当前视图（子页内变更后刷新）。 */
	refresh: () => void;
}

/** 自绘子页的渲染函数签名（modelTab / templateTab 的入口）。 */
type PageRenderer = (container: HTMLElement, ctx: SettingsTabContext) => void;

/**
 * 自绘子页：把既有渲染函数包进 `SettingPage`。
 * `display()` 即重绘点；`hide()` 时向设置页注销重绘句柄（密钥变化刷新用）。
 */
class CustomSettingsPage extends SettingPage {
	constructor(
		private readonly plugin: TaskNotesAIHelperPlugin,
		private readonly app: App,
		title: string,
		private readonly renderPage: PageRenderer,
		private readonly registerRefresh: (refresh: (() => void) | null) => void
	) {
		super();
		this.title = title;
	}

	display(): void {
		const refresh = () => {
			this.containerEl.empty();
			this.renderPage(this.containerEl, { plugin: this.plugin, app: this.app, refresh });
		};
		this.registerRefresh(refresh);
		refresh();
	}

	hide(): void {
		this.registerRefresh(null);
		super.hide();
	}
}

export class TaskNotesAIHelperSettingTab extends PluginSettingTab {
	/** 自绘子页的重绘句柄：子页 display 时登记、hide 时注销。 */
	private pageRefresh: (() => void) | null = null;

	constructor(
		app: App,
		private readonly plugin: TaskNotesAIHelperPlugin
	) {
		super(app, plugin);
		// 密钥存储变化（增删改）时重绘自绘子页，刷新密钥控件的「不可用」提示（ADR-0008 的门面）。
		// 随插件卸载自动清理；原 display()/hide() 里的手动订阅随之移除。
		this.plugin.registerEvent(this.app.secretStorage.on("changed", () => this.pageRefresh?.()));
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const t = this.plugin.t;
		return [
			{
				type: "page",
				name: t("settings.tabModel"),
				desc: t("settings.modelPageDesc"),
				displayValue: () => this.activeModelLabel(),
				page: () =>
					new CustomSettingsPage(
						this.plugin,
						this.app,
						t("settings.tabModel"),
						renderModelTab,
						(refresh) => (this.pageRefresh = refresh)
					),
			},
			{
				type: "page",
				name: t("settings.tabTemplate"),
				desc: t("settings.templatePageDesc"),
				displayValue: () =>
					t("settings.templateCount", { count: this.plugin.settings.templates.length }),
				page: () =>
					new CustomSettingsPage(
						this.plugin,
						this.app,
						t("settings.tabTemplate"),
						renderTemplateTab,
						(refresh) => (this.pageRefresh = refresh)
					),
			},
			...generalSettingDefinitions(t),
		];
	}

	getControlValue(key: string): unknown {
		return readControlValue(this.plugin.settings, key);
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		const route = routeControlKey(key);
		if (!route) return;
		return writeControlValue(this.plugin.appSettings, route, value).then(() => {
			// 界面语言是自反设置：换语言后整页文案与定义都要重建（含搜索索引）。
			if (route.kind === "uiLanguage") {
				this.plugin.applyLanguage();
				this.update();
			}
		});
	}

	/** 子页入口的当前值摘要：当前模型（供应商）。 */
	private activeModelLabel(): string {
		const settings = this.plugin.settings;
		if (!settings.activeModel) return "—";
		const provider = settings.providers.find((p) => p.id === settings.activeProviderId);
		return provider ? `${settings.activeModel} · ${provider.name}` : settings.activeModel;
	}
}
