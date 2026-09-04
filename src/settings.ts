/**
 * 设置页：Tab 化（模型配置 / 常规配置）
 * 模型配置：内置供应商（仅 api key + 动态拉取模型）与自定义供应商（base url + api key + 模型ID）。
 * 常规配置：选择模型下拉 + 报告相关配置。
 */

import { Modal, Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type TaskNotesAIHelperPlugin from "../main";
import { listModels, testConnection } from "./ai/client";
import {
	genId,
	type DateField,
	type ModelConfig,
	type ModelProvider,
	type ReportTemplate,
} from "./types";

const DATE_FIELD_OPTIONS: Array<{ value: DateField; label: string }> = [
	{ value: "completedDate", label: "完成时间（completedDate）" },
	{ value: "due", label: "到期时间（due）" },
	{ value: "scheduled", label: "计划时间（scheduled）" },
	{ value: "dateCreated", label: "创建时间（dateCreated）" },
];

export class TaskNotesAIHelperSettingTab extends PluginSettingTab {
	private currentTab: "model" | "general" | "template" = "model";

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

		const render = () => {
			modelTabBtn.toggleClass("tah-tab-active", this.currentTab === "model");
			generalTabBtn.toggleClass("tah-tab-active", this.currentTab === "general");
			templateTabBtn.toggleClass("tah-tab-active", this.currentTab === "template");
			content.empty();
			if (this.currentTab === "model") {
				this.renderModelTab(content);
			} else if (this.currentTab === "template") {
				this.renderTemplateTab(content);
			} else {
				this.renderGeneralTab(content);
			}
		};

		modelTabBtn.addEventListener("click", () => {
			this.currentTab = "model";
			render();
		});
		generalTabBtn.addEventListener("click", () => {
			this.currentTab = "general";
			render();
		});
		templateTabBtn.addEventListener("click", () => {
			this.currentTab = "template";
			render();
		});

		render();
	}

	// ==================== 模型配置 Tab ====================

	private renderModelTab(container: HTMLElement): void {
		container.createEl("h3", { text: "AI 提供商", cls: "tah-provider-title" });
		container.createEl("p", {
			text: "配置供应商的 API 密钥后，即可在「常规配置」中选择其模型。",
			cls: "setting-item-description",
		});

		const list = container.createDiv({ cls: "tah-provider-list" });
		for (const provider of this.plugin.settings.providers) {
			if (provider.type === "preset") {
				this.renderPresetProviderCard(list, provider);
			} else {
				this.renderCustomProviderCard(list, provider);
			}
		}

		// 底部「添加模型供应商」按钮
		const addRow = container.createDiv({ cls: "tah-add-provider-row" });
		const addBtn = addRow.createEl("button", { text: "+ 添加模型供应商" });
		addBtn.addClass("tah-add-provider-btn");
		addBtn.addEventListener("click", () => this.addCustomProvider());
	}

	/** 内置供应商卡片：仅需 api key，模型动态拉取 */
	private renderPresetProviderCard(container: HTMLElement, provider: ModelProvider): void {
		const configured = provider.apiKey.trim() !== "";

		const card = container.createDiv({ cls: "tah-provider-card" });
		card.toggleClass("tah-provider-configured", configured);

		// 头部
		const header = card.createDiv({ cls: "tah-provider-header" });
		const arrow = header.createSpan({ cls: "tah-provider-arrow", text: "▸" });
		const dot = header.createSpan({ cls: "tah-provider-dot" });
		header.createSpan({ cls: "tah-provider-name", text: provider.name });
		const count = header.createSpan({ cls: "tah-provider-count" });
		header.createSpan({ cls: "tah-provider-status", text: configured ? "已配置" : "未配置" });
		if (configured) this.updateModelCount(card, provider);

		// 展开区
		const body = card.createDiv({ cls: "tah-provider-body" });
		body.style.display = "none";

		// API Key + 获取模型列表按钮（同一行，填完 key 即可点击）
		const keyRow = body.createDiv({ cls: "tah-provider-field" });
		keyRow.createSpan({ cls: "tah-provider-field-label", text: "API Key" });
		const keyInput = keyRow.createEl("input", { type: "password" });
		keyInput.addClass("tah-provider-input");
		keyInput.value = provider.apiKey;
		keyInput.placeholder = "sk-...";
		const fetchBtn = keyRow.createEl("button", { text: "获取模型列表" });
		fetchBtn.addClass("tah-fetch-models-btn");
		fetchBtn.addEventListener("click", () => void this.fetchModels(card, provider));

		// 可用模型容器（默认隐藏，拉取到模型后显示）
		const modelsLabel = body.createDiv({ cls: "tah-provider-models-label", text: "可用模型" });
		modelsLabel.style.display = "none";
		const modelsRow = body.createDiv({ cls: "tah-provider-models" });

		const showModels = (models: string[]) => {
			if (models.length > 0) {
				modelsLabel.style.display = "";
				modelsRow.empty();
				this.renderModelTags(modelsRow, models, provider.id, card);
				this.updateModelCount(card, provider);
			} else {
				modelsLabel.style.display = "none";
				modelsRow.empty();
				this.updateModelCount(card, provider);
			}
		};

		// 打开配置页时，若已配置 key 则自动拉取动态模型列表
		if (configured) {
			void this.fetchModelsSilent(provider, showModels);
		}

		// API Key 变更时：更新状态；新填了 key 则自动拉取，清空则清空模型
		keyInput.addEventListener("change", async () => {
			const oldKey = provider.apiKey;
			provider.apiKey = keyInput.value.trim();
			await this.plugin.saveSettings();
			this.refreshPresetCardState(card, provider);

			if (provider.apiKey && provider.apiKey !== oldKey) {
				await this.fetchModels(card, provider, showModels);
			} else if (!provider.apiKey) {
				provider.models = [];
				await this.plugin.saveSettings();
				showModels([]);
				this.display();
			}
		});

		// 头部点击折叠/展开
		header.addEventListener("click", () => {
			const expanded = body.style.display !== "none";
			body.style.display = expanded ? "none" : "block";
			arrow.setText(expanded ? "▸" : "▾");
		});

		this.updateModelCount(card, provider);
	}

	/** 静默拉取模型列表（打开页面自动调用），失败不打扰用户 */
	private async fetchModelsSilent(
		provider: ModelProvider,
		showModels: (models: string[]) => void
	): Promise<void> {
		try {
			const models = await listModels(provider.baseUrl, provider.apiKey);
			await this.applyModels(provider, models, showModels, false);
		} catch {
			// 静默失败：模型保持为空，不显示模型区域
			showModels([]);
		}
	}

	/** 应用模型列表到 provider 并更新 UI */
	private async applyModels(
		provider: ModelProvider,
		models: string[],
		showModels: (models: string[]) => void,
		notify: boolean
	): Promise<void> {
		provider.models = models;
		await this.plugin.saveSettings();
		if (models.length > 0) {
			if (notify) new Notice(`已获取 ${models.length} 个模型`);
			showModels(models);
		} else {
			if (notify) new Notice("未获取到模型列表");
			showModels([]);
		}
	}

	/** 渲染模型标签：只显示主要几个（前2个），其余折叠为「还有 N 个」 */
	private renderModelTags(
		container: HTMLElement,
		models: string[],
		providerId: string,
		card: HTMLElement
	): void {
		container.empty();
		const MAIN_COUNT = 2;

		const shown = models.slice(0, MAIN_COUNT);
		const rest = models.slice(MAIN_COUNT);

		for (const model of shown) {
			const tag = container.createSpan({ cls: "tah-model-tag", text: model });
			tag.addEventListener("click", () => this.selectModel(providerId, model));
		}

		if (rest.length > 0) {
			const toggle = container.createSpan({
				cls: "tah-model-more",
				text: `还有 ${rest.length} 个 ▾`,
			});
			let expanded = false;
			toggle.addEventListener("click", () => {
				expanded = !expanded;
				toggle.setText(expanded ? "收起 ▾" : `还有 ${rest.length} 个 ▾`);
				this.renderAllModelTags(container, models, providerId, expanded);
			});
		}
	}

	private renderAllModelTags(
		container: HTMLElement,
		models: string[],
		providerId: string,
		expanded: boolean
	): void {
		container.empty();
		const shown = expanded ? models : models.slice(0, 2);
		for (const model of shown) {
			const tag = container.createSpan({ cls: "tah-model-tag", text: model });
			tag.addEventListener("click", () => this.selectModel(providerId, model));
		}
		if (!expanded && models.length > 2) {
			const rest = models.length - 2;
			const toggle = container.createSpan({ cls: "tah-model-more", text: `还有 ${rest} 个 ▾` });
			toggle.addEventListener("click", () => {
				this.renderAllModelTags(container, models, providerId, true);
			});
		}
		if (expanded && models.length > 2) {
			const toggle = container.createSpan({ cls: "tah-model-more", text: "收起 ▾" });
			toggle.addEventListener("click", () => {
				this.renderAllModelTags(container, models, providerId, false);
			});
		}
	}

	/** 动态拉取模型列表并更新（用户手动点击按钮） */
	private async fetchModels(
		card: HTMLElement,
		provider: ModelProvider,
		showModels?: (models: string[]) => void
	): Promise<void> {
		if (!provider.apiKey.trim()) {
			new Notice("请先填写 API Key");
			return;
		}
		new Notice(`正在获取 ${provider.name} 的模型列表…`);
		try {
			const models = await listModels(provider.baseUrl, provider.apiKey);
			if (models.length > 0) {
				provider.models = models;
				await this.plugin.saveSettings();
				new Notice(`已获取 ${models.length} 个模型`);
				this.updateModelCount(card, provider);
				if (showModels) showModels(models);
			} else {
				new Notice("未获取到模型列表");
				if (showModels) showModels([]);
			}
		} catch (error) {
			new Notice(`获取失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** 更新卡片上的模型数量标签（未配置的预设供应商不显示） */
	private updateModelCount(card: HTMLElement, provider: ModelProvider): void {
		const countEl = card.querySelector(".tah-provider-count");
		if (!countEl) return;
		// 内置供应商未配置（无 API Key）时不显示模型个数
		const show =
			provider.type === "preset"
				? provider.apiKey.trim() !== "" && provider.models.length > 0
				: provider.models.length > 0;
		countEl.textContent = show ? `${provider.models.length}模型` : "";
	}

	private refreshPresetCardState(card: HTMLElement, provider: ModelProvider): void {
		const configured = provider.apiKey.trim() !== "";
		card.toggleClass("tah-provider-configured", configured);
		const status = card.querySelector(".tah-provider-status");
		if (status) status.textContent = configured ? "已配置" : "未配置";
	}

	/** 添加自定义供应商：直接新增一张卡片，在卡片内维护配置与模型 */
	private addCustomProvider(): void {
		const newProvider: ModelProvider = {
			id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
			name: "自定义供应商",
			type: "custom",
			baseUrl: "",
			apiKey: "",
			models: [],
			authType: "bearer",
			customModels: [],
		};
		this.plugin.settings.providers.push(newProvider);
		void this.plugin.saveSettings();
		this.display();
	}

	/** 删除自定义供应商 */
	private deleteCustomProvider(provider: ModelProvider): void {
		this.plugin.settings.providers = this.plugin.settings.providers.filter(
			(p) => p.id !== provider.id
		);
		// 如果删除的是当前选用的供应商，重置选择
		if (this.plugin.settings.activeProviderId === provider.id) {
			this.plugin.settings.activeProviderId = this.plugin.settings.providers[0]?.id ?? "";
			this.plugin.settings.activeModel = "";
		}
		void this.plugin.saveSettings();
		this.display();
	}

	/** 自定义供应商卡片：全局配置（名称/API 地址/认证方式）+ 多模型列表（每行独立参数 + 测试） */
	private renderCustomProviderCard(container: HTMLElement, provider: ModelProvider): void {
		const configured = this.isCustomConfigured(provider);

		const card = container.createDiv({ cls: "tah-provider-card tah-provider-custom" });
		card.toggleClass("tah-provider-configured", configured);

		// 头部
		const header = card.createDiv({ cls: "tah-provider-header" });
		const arrow = header.createSpan({ cls: "tah-provider-arrow", text: "▸" });
		const dot = header.createSpan({ cls: "tah-provider-dot" });
		header.createSpan({ cls: "tah-provider-name", text: provider.name });
		const count = header.createSpan({ cls: "tah-provider-count" });
		header.createSpan({ cls: "tah-provider-status", text: configured ? "已配置" : "未配置" });

		// 删除按钮（仅自定义供应商显示）
		const delBtn = header.createEl("button", { text: "✕" });
		delBtn.addClass("tah-provider-delete-btn");
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.deleteCustomProvider(provider);
		});

		// 展开区
		const body = card.createDiv({ cls: "tah-provider-body" });
		body.style.display = "none";

		// ---- 全局配置区 ----

		// 服务商名称
		const nameRow = body.createDiv({ cls: "tah-provider-field" });
		nameRow.createSpan({ cls: "tah-provider-field-label", text: "服务商名称" });
		const nameInput = nameRow.createEl("input", { type: "text" });
		nameInput.addClass("tah-provider-input");
		nameInput.value = provider.name;
		nameInput.placeholder = "例如：DeepSeek、Ollama 本地";
		nameInput.addEventListener("change", () => {
			provider.name = nameInput.value.trim() || "自定义供应商";
			void this.plugin.saveSettings();
			const nameEl = card.querySelector(".tah-provider-name");
			if (nameEl) nameEl.textContent = provider.name;
		});

		// API 地址
		const urlRow = body.createDiv({ cls: "tah-provider-field" });
		urlRow.createSpan({ cls: "tah-provider-field-label", text: "API 地址" });
		const urlInput = urlRow.createEl("input", { type: "text" });
		urlInput.addClass("tah-provider-input");
		urlInput.value = provider.baseUrl;
		urlInput.placeholder = "https://api.example.com/v1";
		urlInput.addEventListener("change", () => {
			provider.baseUrl = urlInput.value.trim();
			void this.plugin.saveSettings();
			this.refreshCustomCardState(card, provider);
		});

		// 认证方式（按钮单选）+ API 密钥（Bearer 时显示）
		const authRow = body.createDiv({ cls: "tah-provider-field" });
		authRow.createSpan({ cls: "tah-provider-field-label", text: "认证方式" });
		const authGroup = authRow.createDiv({ cls: "tah-auth-group" });
		const bearerBtn = authGroup.createEl("button", { text: "Bearer Token" });
		const noneBtn = authGroup.createEl("button", { text: "无认证" });
		bearerBtn.addClass("tah-auth-btn");
		noneBtn.addClass("tah-auth-btn");

		const keyRow = body.createDiv({ cls: "tah-provider-field tah-custom-key-field" });
		keyRow.createSpan({ cls: "tah-provider-field-label", text: "API 密钥" });
		const keyInput = keyRow.createEl("input", { type: "password" });
		keyInput.addClass("tah-provider-input");
		keyInput.value = provider.apiKey;
		keyInput.placeholder = "输入 API 密钥";
		keyInput.addEventListener("change", () => {
			provider.apiKey = keyInput.value.trim();
			void this.plugin.saveSettings();
			this.refreshCustomCardState(card, provider);
		});

		const updateAuth = () => {
			bearerBtn.toggleClass("tah-auth-active", provider.authType === "bearer");
			noneBtn.toggleClass("tah-auth-active", provider.authType === "none");
			keyRow.style.display = provider.authType === "bearer" ? "" : "none";
		};
		bearerBtn.addEventListener("click", () => {
			provider.authType = "bearer";
			void this.plugin.saveSettings();
			updateAuth();
		});
		noneBtn.addEventListener("click", () => {
			provider.authType = "none";
			provider.apiKey = "";
			keyInput.value = "";
			void this.plugin.saveSettings();
			updateAuth();
			this.refreshCustomCardState(card, provider);
		});
		updateAuth();

		// ---- 模型列表区 ----
		const modelsLabel = body.createDiv({ cls: "tah-provider-models-label", text: "可用模型" });
		const modelsList = body.createDiv({ cls: "tah-custom-models-list" });

		const renderModelRows = () => {
			modelsList.empty();
			// 派生 provider.models 为模型 ID 列表（供常规配置下拉使用）
			provider.models = (provider.customModels ?? []).map((m) => m.modelId);
			this.updateModelCount(card, provider);
			for (const mc of provider.customModels ?? []) {
				this.renderCustomModelRow(modelsList, provider, mc, card);
			}
		};

		// 新增模型按钮
		const addModelRow = body.createDiv({ cls: "tah-add-model-row" });
		const addModelBtn = addModelRow.createEl("button", { text: "+ 新增模型" });
		addModelBtn.addClass("tah-add-model-btn");
		addModelBtn.addEventListener("click", () => {
			if (!provider.customModels) provider.customModels = [];
			provider.customModels.push({
				id: `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
				modelId: "",
			});
			void this.plugin.saveSettings();
			renderModelRows();
			this.refreshCustomCardState(card, provider);
		});

		renderModelRows();

		// 头部点击折叠/展开
		header.addEventListener("click", () => {
			const expanded = body.style.display !== "none";
			body.style.display = expanded ? "none" : "block";
			arrow.setText(expanded ? "▸" : "▾");
		});
	}

	/** 渲染单个模型配置行（模型ID + Context Length + Max Tokens + 测试 + 删除） */
	private renderCustomModelRow(
		listEl: HTMLElement,
		provider: ModelProvider,
		mc: ModelConfig,
		card: HTMLElement
	): void {
		const row = listEl.createDiv({ cls: "tah-custom-model-row" });

		// 模型 ID
		const idGroup = row.createDiv({ cls: "tah-custom-model-group" });
		idGroup.createDiv({ cls: "tah-custom-model-label", text: "模型 ID" });
		const idInput = idGroup.createEl("input", { type: "text" });
		idInput.addClass("tah-provider-input");
		idInput.value = mc.modelId;
		idInput.placeholder = "deepseek-v4-pro";
		idInput.addEventListener("change", () => {
			mc.modelId = idInput.value.trim();
			this.syncCustomModels(provider, card);
		});

		// Context Length
		const ctxGroup = row.createDiv({ cls: "tah-custom-model-group" });
		ctxGroup.createDiv({ cls: "tah-custom-model-label", text: "Context Length" });
		const ctxInput = ctxGroup.createEl("input", { type: "text" });
		ctxInput.addClass("tah-provider-input");
		ctxInput.value = mc.contextLength?.toString() ?? "";
		ctxInput.placeholder = "204800";
		ctxInput.addEventListener("change", () => {
			mc.contextLength = this.parseIntSafe(ctxInput.value);
			this.syncCustomModels(provider, card);
		});

		// Max Tokens
		const maxGroup = row.createDiv({ cls: "tah-custom-model-group" });
		maxGroup.createDiv({ cls: "tah-custom-model-label", text: "Max Tokens" });
		const maxInput = maxGroup.createEl("input", { type: "text" });
		maxInput.addClass("tah-provider-input");
		maxInput.value = mc.maxTokens?.toString() ?? "";
		maxInput.placeholder = "65535";
		maxInput.addEventListener("change", () => {
			mc.maxTokens = this.parseIntSafe(maxInput.value);
			this.syncCustomModels(provider, card);
		});

		// 测试按钮（针对该模型）
		const actions = row.createDiv({ cls: "tah-custom-model-actions" });
		const testBtn = actions.createEl("button", { text: "测试" });
		testBtn.addClass("tah-model-test-btn");
		testBtn.addEventListener("click", () => {
			const modelId = idInput.value.trim();
			if (!provider.baseUrl.trim()) {
				new Notice("请先填写 API 地址");
				return;
			}
			if (!modelId) {
				new Notice("请填写模型 ID");
				return;
			}
			new Notice("正在测试…");
			void testConnection({
				baseUrl: provider.baseUrl.trim(),
				apiKey: provider.authType === "bearer" ? provider.apiKey : "",
				model: modelId,
				temperature: this.plugin.settings.temperature,
				maxTokens: this.parseIntSafe(maxInput.value) ?? this.plugin.settings.maxTokens,
				timeoutSeconds: this.plugin.settings.timeoutSeconds,
			})
				.then(() => {
					new Notice(`模型「${modelId}」测试通过`);
				})
				.catch((error) => {
					new Notice(`测试失败：${error instanceof Error ? error.message : String(error)}`);
				});
		});

		// 删除按钮
		const delBtn = actions.createEl("button", { text: "✕" });
		delBtn.addClass("tah-model-del-btn");
		delBtn.addEventListener("click", () => {
			provider.customModels = (provider.customModels ?? []).filter((m) => m.id !== mc.id);
			void this.plugin.saveSettings();
			listEl.empty();
			provider.models = (provider.customModels ?? []).map((m) => m.modelId);
			this.updateModelCount(card, provider);
			for (const m2 of provider.customModels ?? []) {
				this.renderCustomModelRow(listEl, provider, m2, card);
			}
			this.refreshCustomCardState(card, provider);
		});
	}

	/** 模型行参数变更或删除后同步派生 models 并更新状态 */
	private syncCustomModels(provider: ModelProvider, card: HTMLElement): void {
		provider.models = (provider.customModels ?? []).map((m) => m.modelId);
		void this.plugin.saveSettings();
		this.updateModelCount(card, provider);
		this.refreshCustomCardState(card, provider);
	}

	private refreshCustomCardState(card: HTMLElement, provider: ModelProvider): void {
		const configured = this.isCustomConfigured(provider);
		card.toggleClass("tah-provider-configured", configured);
		const status = card.querySelector(".tah-provider-status");
		if (status) status.textContent = configured ? "已配置" : "未配置";
	}

	/** 自定义供应商是否视为已配置：填了 API 地址且有至少一个模型 ID */
	private isCustomConfigured(provider: ModelProvider): boolean {
		return (
			provider.baseUrl.trim() !== "" &&
			(provider.customModels ?? []).some((m) => m.modelId.trim() !== "")
		);
	}

	private parseIntSafe(value: string): number | undefined {
		const n = parseInt(value, 10);
		return Number.isFinite(n) && n > 0 ? n : undefined;
	}

	private selectModel(providerId: string, model: string): void {
		this.plugin.settings.activeProviderId = providerId;
		this.plugin.settings.activeModel = model;
		void this.plugin.saveSettings();
		this.display();
	}

	// ==================== 常规配置 Tab ====================

	private renderGeneralTab(container: HTMLElement): void {
		container.createEl("h3", { text: "模型" });

		this.renderModelDropdown(container);

		container.createEl("h3", { text: "报告生成" });

		new Setting(container)
			.setName("报告输出目录")
			.setDesc("生成的报告笔记保存位置，如 TaskNotes/Reports")
			.addText((text) =>
				text
					.setPlaceholder("TaskNotes/Reports")
					.setValue(this.plugin.settings.reportFolder)
					.onChange(async (value) => {
						this.plugin.settings.reportFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		container.createEl("h4", { text: "任务自动筛选的日期口径（可多选）" });
		container.createEl("p", {
			text: "选择哪些日期字段参与自动筛选：任务在所选日期范围内命中任一字段即自动纳入。",
			cls: "setting-item-description",
		});

		for (const option of DATE_FIELD_OPTIONS) {
			new Setting(container)
				.setName(option.label)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.dateFields.includes(option.value))
						.onChange(async (value) => {
							const fields = this.plugin.settings.dateFields;
							if (value && !fields.includes(option.value)) {
								fields.push(option.value);
							} else if (!value) {
								const idx = fields.indexOf(option.value);
								if (idx >= 0) fields.splice(idx, 1);
							}
							this.plugin.settings.dateFields = fields;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(container)
			.setName("周一作为一周起始日")
			.setDesc("开启后，周报的一周从周一开始；关闭则从周日开始。")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.weekStartsOnMonday)
					.onChange(async (value) => {
						this.plugin.settings.weekStartsOnMonday = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(container)
			.setName("报告语言")
			.setDesc("生成报告使用的语言，默认中文。")
			.addText((text) =>
				text
					.setPlaceholder("中文")
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value.trim() || "中文";
						await this.plugin.saveSettings();
					})
			);
	}

	// ==================== 模板配置 Tab ====================

	private renderTemplateTab(container: HTMLElement): void {
		container.createEl("h3", { text: "报告模板" });
		container.createEl("p", {
			text: "自定义报告模板，每个模板包含标题与内容。内容支持占位符 {{tasks}}（任务列表）与 {{range}}（时间范围）。不选择模板时，仅提供任务列表给模型自由生成。",
			cls: "setting-item-description",
		});

		// 添加模板按钮
		const addRow = container.createDiv({ cls: "tah-template-add-row" });
		const addBtn = addRow.createEl("button", { text: "+ 添加模板" });
		addBtn.addClass("tah-add-btn");
		addBtn.addEventListener("click", () => this.addTemplate());

		// 模板列表
		const list = container.createDiv({ cls: "tah-template-list" });
		const templates = this.plugin.settings.templates;
		if (templates.length === 0) {
			list.createDiv({ text: "暂无模板，点击「添加模板」创建。", cls: "tah-empty" });
		}
		for (const template of templates) {
			this.renderTemplateItem(list, template);
		}
	}

	private renderTemplateItem(container: HTMLElement, template: ReportTemplate): void {
		const item = container.createDiv({ cls: "tah-template-item" });

		const header = item.createDiv({ cls: "tah-template-item-header" });
		header.createSpan({ text: template.name, cls: "tah-template-item-name" });

		const actions = header.createDiv({ cls: "tah-template-item-actions" });
		const editBtn = actions.createEl("button", { text: "编辑" });
		editBtn.addClass("tah-remove-btn");
		const delBtn = actions.createEl("button", { text: "删除" });
		delBtn.addClass("tah-remove-btn");

		// 内容预览
		const preview = item.createDiv({ cls: "tah-template-item-preview" });
		preview.setText(template.content);

		editBtn.addEventListener("click", () => this.editTemplate(template));
		delBtn.addEventListener("click", () => this.deleteTemplate(template.id));
	}

	private addTemplate(): void {
		const modal = new TemplateEditModal(
			this.app,
			{ name: "新模板", content: "" },
			async (name, content) => {
				const template: ReportTemplate = { id: genId(), name, content };
				this.plugin.settings.templates.push(template);
				await this.plugin.saveSettings();
				this.display();
			}
		);
		modal.open();
	}

	private deleteTemplate(id: string): void {
		this.plugin.settings.templates = this.plugin.settings.templates.filter((t) => t.id !== id);
		void this.plugin.saveSettings();
		this.display();
	}

	private editTemplate(template: ReportTemplate): void {
		const modal = new TemplateEditModal(this.app, template, async (name, content) => {
			template.name = name;
			template.content = content;
			await this.plugin.saveSettings();
			this.display();
		});
		modal.open();
	}

	/** 选择模型下拉：按供应商分组显示所有已配置的模型 */
	private renderModelDropdown(container: HTMLElement): void {
		const configuredProviders = this.plugin.settings.providers.filter(
			(p) => p.models.length > 0 && p.apiKey.trim() !== ""
		);

		if (configuredProviders.length === 0) {
			container.createEl("p", {
				text: "暂无可选模型，请先在「模型配置」中配置供应商 API Key。",
				cls: "setting-item-description",
			});
			return;
		}

		const setting = new Setting(container)
			.setName("选择模型")
			.setDesc("选择生成报告使用的模型。");

		setting.addDropdown((dropdown) => {
			// 按供应商分组
			for (const provider of configuredProviders) {
				const optgroup = document.createElement("optgroup");
				optgroup.label = provider.name;
				for (const model of provider.models) {
					const option = document.createElement("option");
					option.value = `${provider.id}::${model}`;
					option.text = model;
					optgroup.appendChild(option);
				}
				dropdown.selectEl.appendChild(optgroup);
			}

			const currentValue = `${this.plugin.settings.activeProviderId}::${this.plugin.settings.activeModel}`;
			dropdown.setValue(currentValue);

			dropdown.onChange((value) => {
				const sepIndex = value.indexOf("::");
				if (sepIndex < 0) return;
				this.plugin.settings.activeProviderId = value.slice(0, sepIndex);
				this.plugin.settings.activeModel = value.slice(sepIndex + 2);
				void this.plugin.saveSettings();
			});
		});
	}

	// ==================== 结束 ====================
}

/** 模板编辑弹窗 */
class TemplateEditModal extends Modal {
	private nameInput!: HTMLInputElement;
	private contentInput!: HTMLTextAreaElement;

	constructor(
		app: App,
		private template: { name: string; content: string },
		private onSave: (name: string, content: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root-narrow");
		this.setTitle("编辑模板");

		contentEl.createEl("h4", { text: "模板标题" });
		this.nameInput = contentEl.createEl("input", { type: "text" });
		this.nameInput.addClass("tah-template-name-input");
		this.nameInput.value = this.template.name;
		this.nameInput.placeholder = "如：周报、月报、年终总结";

		contentEl.createEl("h4", { text: "模板内容", cls: "tah-template-content-title" });
		contentEl.createDiv({
			text: "支持占位符：{{tasks}}（任务列表）、{{range}}（时间范围）",
			cls: "tah-picker-hint",
		});
		this.contentInput = contentEl.createEl("textarea");
		this.contentInput.addClass("tah-template-content-input");
		this.contentInput.value = this.template.content;
		this.contentInput.rows = 12;
		this.contentInput.placeholder = "请根据以下任务数据生成报告…\n\n{{tasks}}";

		const actions = contentEl.createDiv({ cls: "tah-preview-actions" });
		const saveBtn = actions.createEl("button", { text: "保存" });
		saveBtn.addClass("tah-generate-btn");
		saveBtn.addEventListener("click", () => this.save());

		const cancelBtn = actions.createEl("button", { text: "取消" });
		cancelBtn.addClass("tah-remove-btn");
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private save(): void {
		const name = this.nameInput.value.trim();
		if (!name) {
			new Notice("请填写模板标题");
			return;
		}
		this.onSave(name, this.contentInput.value);
		this.close();
	}
}
