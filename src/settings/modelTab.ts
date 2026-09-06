/**
 * 设置页「模型配置」Tab：内置供应商（仅 api key + 动态拉取模型）与自定义供应商。
 * 本模块只导出 renderModelTab 入口，内部辅助函数均为本模块私有。
 */

import { Notice } from "obsidian";
import type { ModelConfig, ModelProvider } from "../types";
import { genId } from "./logic";
import { listModels, testConnection } from "../ai/client";
import type { SettingsTabContext } from "./index";

/** 渲染「模型配置」Tab */
export function renderModelTab(container: HTMLElement, ctx: SettingsTabContext): void {
	container.createEl("h3", { text: "AI 提供商", cls: "tah-provider-title" });
	container.createEl("p", {
		text: "配置供应商的 API 密钥后，即可在「常规配置」中选择其模型。",
		cls: "setting-item-description",
	});

	const list = container.createDiv({ cls: "tah-provider-list" });
	for (const provider of ctx.plugin.settings.providers) {
		if (provider.type === "preset") {
			renderPresetProviderCard(list, provider, ctx);
		} else {
			renderCustomProviderCard(list, provider, ctx);
		}
	}

	// 底部「添加模型供应商」按钮
	const addRow = container.createDiv({ cls: "tah-add-provider-row" });
	const addBtn = addRow.createEl("button", { text: "+ 添加模型供应商" });
	addBtn.addClass("tah-add-provider-btn");
	addBtn.addEventListener("click", () => addCustomProvider(ctx));
}

/** 内置供应商卡片：仅需 api key，模型动态拉取 */
function renderPresetProviderCard(
	container: HTMLElement,
	provider: ModelProvider,
	ctx: SettingsTabContext
): void {
	const configured = provider.apiKey.trim() !== "";

	const card = container.createDiv({ cls: "tah-provider-card" });
	card.toggleClass("tah-provider-configured", configured);

	// 头部
	const header = card.createDiv({ cls: "tah-provider-header" });
	const arrow = header.createSpan({ cls: "tah-provider-arrow", text: "▸" });
	header.createSpan({ cls: "tah-provider-dot" });
	header.createSpan({ cls: "tah-provider-name", text: provider.name });
	const count = header.createSpan({ cls: "tah-provider-count" });
	header.createSpan({ cls: "tah-provider-status", text: configured ? "已配置" : "未配置" });
	if (configured) updateModelCount(card, provider);

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
	fetchBtn.addEventListener("click", () => void fetchModels(card, provider, ctx));

	// 可用模型容器（默认隐藏，拉取到模型后显示）
	const modelsLabel = body.createDiv({ cls: "tah-provider-models-label", text: "可用模型" });
	modelsLabel.style.display = "none";
	const modelsRow = body.createDiv({ cls: "tah-provider-models" });

	const showModels = (models: string[]) => {
		if (models.length > 0) {
			modelsLabel.style.display = "";
			modelsRow.empty();
			renderModelTags(modelsRow, models, provider.id, card, ctx);
			updateModelCount(card, provider);
		} else {
			modelsLabel.style.display = "none";
			modelsRow.empty();
			updateModelCount(card, provider);
		}
	};

	// 打开配置页时，若已配置 key 则自动拉取动态模型列表
	if (configured) {
		void fetchModelsSilent(provider, showModels, ctx);
	}

	// API Key 变更时：更新状态；新填了 key 则自动拉取，清空则清空模型
	keyInput.addEventListener("change", async () => {
		const oldKey = provider.apiKey;
		provider.apiKey = keyInput.value.trim();
		await ctx.plugin.saveSettings();
		refreshPresetCardState(card, provider);

		if (provider.apiKey && provider.apiKey !== oldKey) {
			await fetchModels(card, provider, ctx, showModels);
		} else if (!provider.apiKey) {
			provider.models = [];
			await ctx.plugin.saveSettings();
			showModels([]);
			ctx.refresh();
		}
	});

	// 头部点击折叠/展开
	header.addEventListener("click", () => {
		const expanded = body.style.display !== "none";
		body.style.display = expanded ? "none" : "block";
		arrow.setText(expanded ? "▸" : "▾");
	});

	updateModelCount(card, provider);
}

/** 静默拉取模型列表（打开页面自动调用），失败不打扰用户 */
async function fetchModelsSilent(
	provider: ModelProvider,
	showModels: (models: string[]) => void,
	ctx: SettingsTabContext
): Promise<void> {
	try {
		const models = await listModels(provider.baseUrl, provider.apiKey);
		await applyModels(provider, models, showModels, false, ctx);
	} catch {
		// 静默失败：模型保持为空，不显示模型区域
		showModels([]);
	}
}

/** 应用模型列表到 provider 并更新 UI */
async function applyModels(
	provider: ModelProvider,
	models: string[],
	showModels: (models: string[]) => void,
	notify: boolean,
	ctx: SettingsTabContext
): Promise<void> {
	provider.models = models;
	await ctx.plugin.saveSettings();
	if (models.length > 0) {
		if (notify) new Notice(`已获取 ${models.length} 个模型`);
		showModels(models);
	} else {
		if (notify) new Notice("未获取到模型列表");
		showModels([]);
	}
}

/** 渲染模型标签：只显示主要几个（前2个），其余折叠为「还有 N 个」 */
function renderModelTags(
	container: HTMLElement,
	models: string[],
	providerId: string,
	card: HTMLElement,
	ctx: SettingsTabContext
): void {
	container.empty();
	const MAIN_COUNT = 2;

	const shown = models.slice(0, MAIN_COUNT);
	const rest = models.slice(MAIN_COUNT);

	for (const model of shown) {
		const tag = container.createSpan({ cls: "tah-model-tag", text: model });
		tag.addEventListener("click", () => selectModel(providerId, model, ctx));
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
			renderAllModelTags(container, models, providerId, expanded, ctx);
		});
	}
}

function renderAllModelTags(
	container: HTMLElement,
	models: string[],
	providerId: string,
	expanded: boolean,
	ctx: SettingsTabContext
): void {
	container.empty();
	const shown = expanded ? models : models.slice(0, 2);
	for (const model of shown) {
		const tag = container.createSpan({ cls: "tah-model-tag", text: model });
		tag.addEventListener("click", () => selectModel(providerId, model, ctx));
	}
	if (!expanded && models.length > 2) {
		const rest = models.length - 2;
		const toggle = container.createSpan({ cls: "tah-model-more", text: `还有 ${rest} 个 ▾` });
		toggle.addEventListener("click", () => {
			renderAllModelTags(container, models, providerId, true, ctx);
		});
	}
	if (expanded && models.length > 2) {
		const toggle = container.createSpan({ cls: "tah-model-more", text: "收起 ▾" });
		toggle.addEventListener("click", () => {
			renderAllModelTags(container, models, providerId, false, ctx);
		});
	}
}

/** 动态拉取模型列表并更新（用户手动点击按钮） */
async function fetchModels(
	card: HTMLElement,
	provider: ModelProvider,
	ctx: SettingsTabContext,
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
			await ctx.plugin.saveSettings();
			new Notice(`已获取 ${models.length} 个模型`);
			updateModelCount(card, provider);
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
function updateModelCount(card: HTMLElement, provider: ModelProvider): void {
	const countEl = card.querySelector(".tah-provider-count");
	if (!countEl) return;
	// 内置供应商未配置（无 API Key）时不显示模型个数
	const show =
		provider.type === "preset"
			? provider.apiKey.trim() !== "" && provider.models.length > 0
			: provider.models.length > 0;
	countEl.textContent = show ? `${provider.models.length}模型` : "";
}

function refreshPresetCardState(card: HTMLElement, provider: ModelProvider): void {
	const configured = provider.apiKey.trim() !== "";
	card.toggleClass("tah-provider-configured", configured);
	const status = card.querySelector(".tah-provider-status");
	if (status) status.textContent = configured ? "已配置" : "未配置";
}

/** 添加自定义供应商：直接新增一张卡片，在卡片内维护配置与模型 */
function addCustomProvider(ctx: SettingsTabContext): void {
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
	ctx.plugin.settings.providers.push(newProvider);
	void ctx.plugin.saveSettings();
	ctx.refresh();
}

/** 删除自定义供应商 */
function deleteCustomProvider(provider: ModelProvider, ctx: SettingsTabContext): void {
	ctx.plugin.settings.providers = ctx.plugin.settings.providers.filter(
		(p) => p.id !== provider.id
	);
	// 如果删除的是当前选用的供应商，重置选择
	if (ctx.plugin.settings.activeProviderId === provider.id) {
		ctx.plugin.settings.activeProviderId = ctx.plugin.settings.providers[0]?.id ?? "";
		ctx.plugin.settings.activeModel = "";
	}
	void ctx.plugin.saveSettings();
	ctx.refresh();
}

/** 自定义供应商卡片：全局配置（名称/API 地址/认证方式）+ 多模型列表（每行独立参数 + 测试） */
function renderCustomProviderCard(
	container: HTMLElement,
	provider: ModelProvider,
	ctx: SettingsTabContext
): void {
	const configured = isCustomConfigured(provider);

	const card = container.createDiv({ cls: "tah-provider-card tah-provider-custom" });
	card.toggleClass("tah-provider-configured", configured);

	// 头部
	const header = card.createDiv({ cls: "tah-provider-header" });
	const arrow = header.createSpan({ cls: "tah-provider-arrow", text: "▸" });
	header.createSpan({ cls: "tah-provider-dot" });
	header.createSpan({ cls: "tah-provider-name", text: provider.name });
	header.createSpan({ cls: "tah-provider-count" });
	header.createSpan({ cls: "tah-provider-status", text: configured ? "已配置" : "未配置" });

	// 删除按钮（仅自定义供应商显示）
	const delBtn = header.createEl("button", { text: "✕" });
	delBtn.addClass("tah-provider-delete-btn");
	delBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		deleteCustomProvider(provider, ctx);
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
		void ctx.plugin.saveSettings();
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
		void ctx.plugin.saveSettings();
		refreshCustomCardState(card, provider);
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
		void ctx.plugin.saveSettings();
		refreshCustomCardState(card, provider);
	});

	const updateAuth = () => {
		bearerBtn.toggleClass("tah-auth-active", provider.authType === "bearer");
		noneBtn.toggleClass("tah-auth-active", provider.authType === "none");
		keyRow.style.display = provider.authType === "bearer" ? "" : "none";
	};
	bearerBtn.addEventListener("click", () => {
		provider.authType = "bearer";
		void ctx.plugin.saveSettings();
		updateAuth();
	});
	noneBtn.addEventListener("click", () => {
		provider.authType = "none";
		provider.apiKey = "";
		keyInput.value = "";
		void ctx.plugin.saveSettings();
		updateAuth();
		refreshCustomCardState(card, provider);
	});
	updateAuth();

	// ---- 模型列表区 ----
	body.createDiv({ cls: "tah-provider-models-label", text: "可用模型" });
	const modelsList = body.createDiv({ cls: "tah-custom-models-list" });

	const renderModelRows = () => {
		modelsList.empty();
		// 派生 provider.models 为模型 ID 列表（供常规配置下拉使用）
		provider.models = (provider.customModels ?? []).map((m) => m.modelId);
		updateModelCount(card, provider);
		for (const mc of provider.customModels ?? []) {
			renderCustomModelRow(modelsList, provider, mc, card, ctx);
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
		void ctx.plugin.saveSettings();
		renderModelRows();
		refreshCustomCardState(card, provider);
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
function renderCustomModelRow(
	listEl: HTMLElement,
	provider: ModelProvider,
	mc: ModelConfig,
	card: HTMLElement,
	ctx: SettingsTabContext
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
		syncCustomModels(provider, card, ctx);
	});

	// Context Length
	const ctxGroup = row.createDiv({ cls: "tah-custom-model-group" });
	ctxGroup.createDiv({ cls: "tah-custom-model-label", text: "Context Length" });
	const ctxInput = ctxGroup.createEl("input", { type: "text" });
	ctxInput.addClass("tah-provider-input");
	ctxInput.value = mc.contextLength?.toString() ?? "";
	ctxInput.placeholder = "204800";
	ctxInput.addEventListener("change", () => {
		mc.contextLength = parseIntSafe(ctxInput.value);
		syncCustomModels(provider, card, ctx);
	});

	// Max Tokens
	const maxGroup = row.createDiv({ cls: "tah-custom-model-group" });
	maxGroup.createDiv({ cls: "tah-custom-model-label", text: "Max Tokens" });
	const maxInput = maxGroup.createEl("input", { type: "text" });
	maxInput.addClass("tah-provider-input");
	maxInput.value = mc.maxTokens?.toString() ?? "";
	maxInput.placeholder = "65535";
	maxInput.addEventListener("change", () => {
		mc.maxTokens = parseIntSafe(maxInput.value);
		syncCustomModels(provider, card, ctx);
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
			temperature: ctx.plugin.settings.temperature,
			maxTokens: parseIntSafe(maxInput.value) ?? ctx.plugin.settings.maxTokens,
			timeoutSeconds: ctx.plugin.settings.timeoutSeconds,
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
		void ctx.plugin.saveSettings();
		listEl.empty();
		provider.models = (provider.customModels ?? []).map((m) => m.modelId);
		updateModelCount(card, provider);
		for (const m2 of provider.customModels ?? []) {
			renderCustomModelRow(listEl, provider, m2, card, ctx);
		}
		refreshCustomCardState(card, provider);
	});
}

/** 模型行参数变更或删除后同步派生 models 并更新状态 */
function syncCustomModels(
	provider: ModelProvider,
	card: HTMLElement,
	ctx: SettingsTabContext
): void {
	provider.models = (provider.customModels ?? []).map((m) => m.modelId);
	void ctx.plugin.saveSettings();
	updateModelCount(card, provider);
	refreshCustomCardState(card, provider);
}

function refreshCustomCardState(card: HTMLElement, provider: ModelProvider): void {
	const configured = isCustomConfigured(provider);
	card.toggleClass("tah-provider-configured", configured);
	const status = card.querySelector(".tah-provider-status");
	if (status) status.textContent = configured ? "已配置" : "未配置";
}

/** 自定义供应商是否视为已配置：填了 API 地址且有至少一个模型 ID */
function isCustomConfigured(provider: ModelProvider): boolean {
	return (
		provider.baseUrl.trim() !== "" &&
		(provider.customModels ?? []).some((m) => m.modelId.trim() !== "")
	);
}

function parseIntSafe(value: string): number | undefined {
	const n = parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

function selectModel(providerId: string, model: string, ctx: SettingsTabContext): void {
	ctx.plugin.settings.activeProviderId = providerId;
	ctx.plugin.settings.activeModel = model;
	void ctx.plugin.saveSettings();
	ctx.refresh();
}
