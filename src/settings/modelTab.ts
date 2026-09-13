/**
 * 设置页「模型配置」Tab：内置供应商（仅 api key + 动态拉取模型）与自定义供应商。
 * 本模块只导出 renderModelTab 入口，内部辅助函数均为本模块私有。
 */

import { Notice, SecretComponent, Setting } from "obsidian";
import type { ModelConfig, ModelProvider } from "../types";
import type { Translator } from "../i18n";
import { resolveSecretValue } from "./secrets";
import { listModels, testConnection } from "../ai/client";
import { describeAIError } from "../ai/errorMessage";
import { modelsOf, isConfigured, isSelectable, isActiveModel } from "./provider";
import type { SettingsTabContext } from "./index";

/** 新自定义供应商的默认名称：作为持久化数据，保持语言无关，不随界面语言变化。 */
const DEFAULT_CUSTOM_PROVIDER_NAME = "自定义供应商";

/** 渲染「模型配置」Tab */
export function renderModelTab(container: HTMLElement, ctx: SettingsTabContext): void {
	renderActiveModelSection(container, ctx);

	const t = ctx.plugin.t;
	container.createEl("h3", { text: t("model.providersHeading"), cls: "tah-provider-title" });
	container.createEl("p", {
		text: t("model.providersIntro"),
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
	const addBtn = addRow.createEl("button", { text: t("model.addProvider") });
	addBtn.addClass("tah-add-provider-btn");
	addBtn.addEventListener("click", () => addCustomProvider(ctx));
}

/** 顶部「当前模型」区：选择生成报告使用的模型 */
function renderActiveModelSection(container: HTMLElement, ctx: SettingsTabContext): void {
	const t = ctx.plugin.t;
	container.createEl("h3", { text: t("model.activeHeading") });

	const selectable = ctx.plugin.settings.providers.filter(isSelectable);
	if (selectable.length === 0) {
		container.createEl("p", {
			text: t("model.noModels"),
			cls: "setting-item-description",
		});
		return;
	}

	new Setting(container)
		.setName(t("model.selectModelName"))
		.setDesc(t("model.selectModelDesc"))
		.addDropdown((dropdown) => {
			// 按供应商分组
			for (const provider of selectable) {
				const optgroup = dropdown.selectEl.createEl("optgroup");
				optgroup.label = provider.name;
				for (const model of modelsOf(provider)) {
					const option = optgroup.createEl("option");
					option.value = `${provider.id}::${model}`;
					option.text = model;
				}
			}

			const currentValue = `${ctx.plugin.settings.activeProviderId}::${ctx.plugin.settings.activeModel}`;
			dropdown.setValue(currentValue);

			dropdown.onChange((value) => {
				const sepIndex = value.indexOf("::");
				if (sepIndex < 0) return;
				ctx.plugin.settings.activeProviderId = value.slice(0, sepIndex);
				ctx.plugin.settings.activeModel = value.slice(sepIndex + 2);
				void ctx.plugin.saveSettings();
				// 刷新以更新模型标签/行的「当前」高亮
				ctx.refresh();
			});
		});
}

/** 内置供应商卡片：仅需 api key，模型动态拉取 */
function renderPresetProviderCard(
	container: HTMLElement,
	provider: ModelProvider,
	ctx: SettingsTabContext
): void {
	const t = ctx.plugin.t;
	const configured = isConfigured(provider);

	const card = container.createDiv({ cls: "tah-provider-card" });
	card.toggleClass("tah-provider-configured", configured);

	// 头部
	const header = card.createDiv({ cls: "tah-provider-header" });
	const arrow = header.createSpan({ cls: "tah-provider-arrow", text: "▸" });
	header.createSpan({ cls: "tah-provider-dot" });
	header.createSpan({ cls: "tah-provider-name", text: provider.name });
	header.createSpan({ cls: "tah-provider-count" });
	header.createSpan({
		cls: "tah-provider-status",
		text: configured ? t("model.configured") : t("model.notConfigured"),
	});
	if (configured) updateModelCount(card, provider, t);

	// 展开区
	const body = card.createDiv({ cls: "tah-provider-body" });
	body.addClass("tah-hidden");

	// API 密钥 + 获取模型列表按钮（同一行，选好密钥即可点击）
	const keyRow = body.createDiv({ cls: "tah-provider-field" });
	keyRow.createSpan({ cls: "tah-provider-field-label", text: t("model.apiKeyLabel") });
	const keyHost = keyRow.createDiv({ cls: "tah-provider-input" });
	attachSecretControl(ctx, keyHost, provider, (value) =>
		void onPresetSecretChange(card, provider, value, showModels, ctx)
	);
	const fetchBtn = keyRow.createEl("button", { text: t("model.fetchModels") });
	fetchBtn.addClass("tah-fetch-models-btn");
	fetchBtn.addEventListener("click", () => void fetchModels(card, provider, ctx));

	// 可用模型容器（默认隐藏，拉取到模型后显示）
	const modelsLabel = body.createDiv({ cls: "tah-provider-models-label", text: t("model.availableModels") });
	modelsLabel.addClass("tah-hidden");
	const modelsRow = body.createDiv({ cls: "tah-provider-models" });

	const showModels = (models: string[]) => {
		if (models.length > 0) {
			modelsLabel.removeClass("tah-hidden");
			modelsRow.empty();
			renderModelTags(modelsRow, models, provider.id, card, ctx);
			updateModelCount(card, provider, t);
		} else {
			modelsLabel.addClass("tah-hidden");
			modelsRow.empty();
			updateModelCount(card, provider, t);
		}
	};

	// 打开配置页时，若已配置 key 则自动拉取动态模型列表
	if (configured) {
		void fetchModelsSilent(provider, showModels, ctx);
	}

	// 头部点击折叠/展开
	wireCollapse(header, body, arrow);

	updateModelCount(card, provider, t);
}

/** 固定位数的密钥掩码（8 颗圆点），替代原生「点 + ×」显示。 */
const SECRET_MASK = "••••••••";

interface SecretControl {
	component: SecretComponent;
	/** 重新计算掩码显隐与「密钥不可用」提示。 */
	refresh: (secretId: string) => void;
}

/**
 * 挂载密钥选择控件：用固定点掩码取代 Obsidian 原生的「点 + ×」值显示（CSS 隐藏），
 * 保留原生「更改/Link」按钮以复用其选择与新建密钥弹窗。变更时先同步掩码再回调。
 * 另给一个「管理密钥」入口（重命名/删除归 Obsidian 密钥存储）与「密钥不可用」内联提示。
 */
function attachSecretControl(
	ctx: SettingsTabContext,
	host: HTMLElement,
	provider: ModelProvider,
	onChange: (value: string) => void
): SecretControl {
	host.addClass("tah-secret-host");
	const t = ctx.plugin.t;
	const mask = host.createSpan({ cls: "tah-secret-mask", text: SECRET_MASK });
	const component = new SecretComponent(ctx.app, host).setValue(provider.apiKeySecretId);

	const manageBtn = host.createEl("button", { text: t("model.manageSecret") });
	manageBtn.addClass("tah-secret-manage-btn");
	manageBtn.addEventListener("click", () => openSecretStorage(ctx));

	const hint = host.createSpan({ cls: "tah-secret-hint tah-hidden", text: t("model.secretUnavailable") });

	const refresh = (secretId: string) => {
		mask.toggleClass("is-empty", secretId.trim() === "");
		hint.toggleClass("tah-hidden", !isSecretMissing(ctx, secretId));
	};
	refresh(provider.apiKeySecretId);

	component.onChange((value) => {
		refresh(value);
		onChange(value);
	});
	return { component, refresh };
}

/** Obsidian「密钥存储」设置页的 tab id（内部 API 跳转，见 ADR-0008）。 */
const SECRET_STORAGE_TAB_ID = "keychain";

/** 所选密钥名在 SecretStorage 中缺失（区别于存在但值为空）。 */
function isSecretMissing(ctx: SettingsTabContext, secretId: string): boolean {
	const id = secretId.trim();
	if (id === "") return false;
	return ctx.app.secretStorage.getSecret(id) === null;
}

/** 打开 Obsidian 的「密钥存储」设置页（内部 API 不在公开类型里，见 ADR-0008；带降级提示）。 */
function openSecretStorage(ctx: SettingsTabContext): void {
	const setting = (ctx.app as unknown as {
		setting?: { open?: () => void; openTabById?: (id: string) => void };
	}).setting;
	try {
		if (setting?.open && setting?.openTabById) {
			setting.open();
			setting.openTabById(SECRET_STORAGE_TAB_ID);
			return;
		}
	} catch {
		// 内部 API 不可用，走降级提示
	}
	new Notice(ctx.plugin.t("model.manageSecretHint"));
}

/** 绑定卡片头部点击折叠/展开：切换 tah-hidden 并同步箭头。 */
function wireCollapse(header: HTMLElement, body: HTMLElement, arrow: HTMLElement): void {
	header.addEventListener("click", () => {
		const collapsed = body.hasClass("tah-hidden");
		body.toggleClass("tah-hidden", !collapsed);
		arrow.setText(collapsed ? "▾" : "▸");
	});
}

/** 把密钥名解析为密钥值；未选或存储中缺失时返回空串。 */
function resolveSecret(ctx: SettingsTabContext, secretId: string): string {
	return resolveSecretValue(secretId, (id) => ctx.app.secretStorage.getSecret(id));
}

/** 预设供应商的密钥变更：保存并更新状态；新选了密钥则自动拉取，清空则清空模型。 */
async function onPresetSecretChange(
	card: HTMLElement,
	provider: ModelProvider,
	value: string,
	showModels: (models: string[]) => void,
	ctx: SettingsTabContext
): Promise<void> {
	const oldId = provider.apiKeySecretId;
	provider.apiKeySecretId = value;
	await ctx.plugin.saveSettings();
	refreshCardState(card, provider, ctx.plugin.t);

	if (provider.apiKeySecretId && provider.apiKeySecretId !== oldId) {
		await fetchModels(card, provider, ctx, showModels);
	} else if (!provider.apiKeySecretId) {
		provider.models = [];
		await ctx.plugin.saveSettings();
		showModels([]);
		ctx.refresh();
	}
}

/** 静默拉取模型列表（打开页面自动调用），失败不打扰用户 */
async function fetchModelsSilent(
	provider: ModelProvider,
	showModels: (models: string[]) => void,
	ctx: SettingsTabContext
): Promise<void> {
	try {
		const models = await listModels(provider.baseUrl, resolveSecret(ctx, provider.apiKeySecretId));
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
	const t = ctx.plugin.t;
	provider.models = models;
	await ctx.plugin.saveSettings();
	if (models.length > 0) {
		if (notify) new Notice(t("model.fetched", { count: models.length }));
		showModels(models);
	} else {
		if (notify) new Notice(t("model.fetchEmpty"));
		showModels([]);
	}
}

/** 渲染单个模型标签；若为当前模型则高亮。 */
function appendModelTag(
	container: HTMLElement,
	providerId: string,
	model: string,
	ctx: SettingsTabContext
): void {
	const tag = container.createSpan({ cls: "tah-model-tag", text: model });
	const settings = ctx.plugin.settings;
	if (isActiveModel(settings.activeProviderId, settings.activeModel, providerId, model)) {
		tag.addClass("tah-model-tag-active");
	}
	tag.addEventListener("click", () => selectModel(providerId, model, ctx));
}

/** 渲染模型标签：只显示主要几个（前2个），其余折叠为「还有 N 个」 */
function renderModelTags(
	container: HTMLElement,
	models: string[],
	providerId: string,
	card: HTMLElement,
	ctx: SettingsTabContext
): void {
	const t = ctx.plugin.t;
	container.empty();
	const MAIN_COUNT = 2;

	const shown = models.slice(0, MAIN_COUNT);
	const rest = models.slice(MAIN_COUNT);

	for (const model of shown) {
		appendModelTag(container, providerId, model, ctx);
	}

	if (rest.length > 0) {
		const toggle = container.createSpan({
			cls: "tah-model-more",
			text: t("model.moreModels", { count: rest.length }),
		});
		let expanded = false;
		toggle.addEventListener("click", () => {
			expanded = !expanded;
			toggle.setText(expanded ? t("model.collapse") : t("model.moreModels", { count: rest.length }));
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
	const t = ctx.plugin.t;
	container.empty();
	const shown = expanded ? models : models.slice(0, 2);
	for (const model of shown) {
		appendModelTag(container, providerId, model, ctx);
	}
	if (!expanded && models.length > 2) {
		const rest = models.length - 2;
		const toggle = container.createSpan({
			cls: "tah-model-more",
			text: t("model.moreModels", { count: rest }),
		});
		toggle.addEventListener("click", () => {
			renderAllModelTags(container, models, providerId, true, ctx);
		});
	}
	if (expanded && models.length > 2) {
		const toggle = container.createSpan({ cls: "tah-model-more", text: t("model.collapse") });
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
	const t = ctx.plugin.t;
	if (provider.apiKeySecretId.trim() === "") {
		new Notice(t("model.fetchNeedKey"));
		return;
	}
	const apiKey = resolveSecret(ctx, provider.apiKeySecretId);
	if (apiKey === "") {
		new Notice(t("model.fetchSecretMissing"));
		return;
	}
	new Notice(t("model.fetching", { name: provider.name }));
	try {
		const models = await listModels(provider.baseUrl, apiKey);
		if (models.length > 0) {
			provider.models = models;
			await ctx.plugin.saveSettings();
			new Notice(t("model.fetched", { count: models.length }));
			updateModelCount(card, provider, t);
			if (showModels) showModels(models);
		} else {
			new Notice(t("model.fetchEmpty"));
			if (showModels) showModels([]);
		}
	} catch (error) {
		new Notice(t("model.fetchFailed", { error: describeAIError(error, t) }));
	}
}

/** 更新卡片上的模型数量标签（模型数由 provider module 统一读取） */
function updateModelCount(card: HTMLElement, provider: ModelProvider, t: Translator): void {
	const countEl = card.querySelector(".tah-provider-count");
	if (!countEl) return;
	const count = modelsOf(provider).length;
	const show = count > 0 && (provider.type === "custom" || isConfigured(provider));
	countEl.textContent = show ? t("model.modelCount", { count }) : "";
}

/** 同步卡片「已配置 / 未配置」状态。 */
function refreshCardState(card: HTMLElement, provider: ModelProvider, t: Translator): void {
	const configured = isConfigured(provider);
	card.toggleClass("tah-provider-configured", configured);
	const status = card.querySelector(".tah-provider-status");
	if (status) {
		status.textContent = configured ? t("model.configured") : t("model.notConfigured");
	}
}

/** 添加自定义供应商：直接新增一张卡片，在卡片内维护配置与模型 */
function addCustomProvider(ctx: SettingsTabContext): void {
	const newProvider: ModelProvider = {
		id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		name: DEFAULT_CUSTOM_PROVIDER_NAME,
		type: "custom",
		baseUrl: "",
		apiKeySecretId: "",
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
	const t = ctx.plugin.t;
	const configured = isConfigured(provider);

	const card = container.createDiv({ cls: "tah-provider-card tah-provider-custom" });
	card.toggleClass("tah-provider-configured", configured);

	// 头部
	const header = card.createDiv({ cls: "tah-provider-header" });
	const arrow = header.createSpan({ cls: "tah-provider-arrow", text: "▸" });
	header.createSpan({ cls: "tah-provider-dot" });
	header.createSpan({ cls: "tah-provider-name", text: provider.name });
	header.createSpan({ cls: "tah-provider-count" });
	header.createSpan({
		cls: "tah-provider-status",
		text: configured ? t("model.configured") : t("model.notConfigured"),
	});

	// 删除按钮（仅自定义供应商显示）
	const delBtn = header.createEl("button", { text: "✕" });
	delBtn.addClass("tah-provider-delete-btn");
	delBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		deleteCustomProvider(provider, ctx);
	});

	// 展开区
	const body = card.createDiv({ cls: "tah-provider-body" });
	body.addClass("tah-hidden");

	// ---- 全局配置区 ----

	// 服务商名称
	const nameRow = body.createDiv({ cls: "tah-provider-field" });
	nameRow.createSpan({ cls: "tah-provider-field-label", text: t("model.providerName") });
	const nameInput = nameRow.createEl("input", { type: "text" });
	nameInput.addClass("tah-provider-input");
	nameInput.value = provider.name;
	nameInput.placeholder = t("model.providerNamePlaceholder");
	nameInput.addEventListener("change", () => {
		provider.name = nameInput.value.trim() || DEFAULT_CUSTOM_PROVIDER_NAME;
		void ctx.plugin.saveSettings();
		const nameEl = card.querySelector(".tah-provider-name");
		if (nameEl) nameEl.textContent = provider.name;
	});

	// API 地址
	const urlRow = body.createDiv({ cls: "tah-provider-field" });
	urlRow.createSpan({ cls: "tah-provider-field-label", text: t("model.apiUrl") });
	const urlInput = urlRow.createEl("input", { type: "text" });
	urlInput.addClass("tah-provider-input");
	urlInput.value = provider.baseUrl;
	urlInput.placeholder = "https://api.example.com/v1";
	urlInput.addEventListener("change", () => {
		provider.baseUrl = urlInput.value.trim();
		void ctx.plugin.saveSettings();
		refreshCardState(card, provider, t);
	});

	// 认证方式（按钮单选）+ API 密钥（Bearer 时显示）
	const authRow = body.createDiv({ cls: "tah-provider-field" });
	authRow.createSpan({ cls: "tah-provider-field-label", text: t("model.authType") });
	const authGroup = authRow.createDiv({ cls: "tah-auth-group" });
	const bearerBtn = authGroup.createEl("button", { text: t("model.authBearer") });
	const noneBtn = authGroup.createEl("button", { text: t("model.authNone") });
	bearerBtn.addClass("tah-auth-btn");
	noneBtn.addClass("tah-auth-btn");

	const keyRow = body.createDiv({ cls: "tah-provider-field tah-custom-key-field" });
	keyRow.createSpan({ cls: "tah-provider-field-label", text: t("model.apiKeyLabel") });
	const keyHost = keyRow.createDiv({ cls: "tah-provider-input" });
	const secret = attachSecretControl(ctx, keyHost, provider, (value) => {
		provider.apiKeySecretId = value;
		void ctx.plugin.saveSettings();
		refreshCardState(card, provider, t);
	});

	const updateAuth = () => {
		bearerBtn.toggleClass("tah-auth-active", provider.authType === "bearer");
		noneBtn.toggleClass("tah-auth-active", provider.authType === "none");
		keyRow.toggleClass("tah-hidden", provider.authType !== "bearer");
	};
	bearerBtn.addEventListener("click", () => {
		provider.authType = "bearer";
		void ctx.plugin.saveSettings();
		updateAuth();
	});
	noneBtn.addEventListener("click", () => {
		provider.authType = "none";
		provider.apiKeySecretId = "";
		secret.refresh("");
		secret.component.setValue("");
		void ctx.plugin.saveSettings();
		updateAuth();
		refreshCardState(card, provider, t);
	});
	updateAuth();

	// ---- 模型列表区 ----
	body.createDiv({ cls: "tah-provider-models-label", text: t("model.availableModels") });
	const modelsList = body.createDiv({ cls: "tah-custom-models-list" });

	const renderModelRows = () => {
		modelsList.empty();
		updateModelCount(card, provider, t);
		for (const mc of provider.customModels ?? []) {
			renderCustomModelRow(modelsList, provider, mc, card, ctx);
		}
	};

	// 新增模型按钮
	const addModelRow = body.createDiv({ cls: "tah-add-model-row" });
	const addModelBtn = addModelRow.createEl("button", { text: t("model.newModel") });
	addModelBtn.addClass("tah-add-model-btn");
	addModelBtn.addEventListener("click", () => {
		if (!provider.customModels) provider.customModels = [];
		provider.customModels.push({
			id: `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
			modelId: "",
		});
		void ctx.plugin.saveSettings();
		renderModelRows();
		refreshCardState(card, provider, t);
	});

	renderModelRows();

	// 头部点击折叠/展开
	wireCollapse(header, body, arrow);
}

/** 渲染单个模型配置行（模型ID + Context Length + Max Tokens + 测试 + 删除） */
function renderCustomModelRow(
	listEl: HTMLElement,
	provider: ModelProvider,
	mc: ModelConfig,
	card: HTMLElement,
	ctx: SettingsTabContext
): void {
	const t = ctx.plugin.t;
	const row = listEl.createDiv({ cls: "tah-custom-model-row" });
	const active = ctx.plugin.settings;
	if (
		mc.modelId !== "" &&
		isActiveModel(active.activeProviderId, active.activeModel, provider.id, mc.modelId)
	) {
		row.addClass("tah-custom-model-row-active");
	}

	// 模型 ID
	const idGroup = row.createDiv({ cls: "tah-custom-model-group" });
	idGroup.createDiv({ cls: "tah-custom-model-label", text: t("model.modelId") });
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
	ctxGroup.createDiv({ cls: "tah-custom-model-label", text: t("model.contextLength") });
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
	maxGroup.createDiv({ cls: "tah-custom-model-label", text: t("model.maxTokens") });
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
	const testBtn = actions.createEl("button", { text: t("model.test") });
	testBtn.addClass("tah-model-test-btn");
	testBtn.addEventListener("click", () => {
		const modelId = idInput.value.trim();
		if (!provider.baseUrl.trim()) {
			new Notice(t("model.testNeedUrl"));
			return;
		}
		if (!modelId) {
			new Notice(t("model.testNeedModel"));
			return;
		}
		new Notice(t("model.testing"));
		void testConnection({
			baseUrl: provider.baseUrl.trim(),
			apiKey: provider.authType === "bearer" ? resolveSecret(ctx, provider.apiKeySecretId) : "",
			model: modelId,
			temperature: ctx.plugin.settings.temperature,
			maxTokens: parseIntSafe(maxInput.value) ?? ctx.plugin.settings.maxTokens,
			timeoutSeconds: ctx.plugin.settings.timeoutSeconds,
		})
			.then(() => {
				new Notice(t("model.testPassed", { model: modelId }));
			})
			.catch((error) => {
				new Notice(t("model.testFailed", { error: describeAIError(error, t) }));
			});
	});

	// 删除按钮
	const delBtn = actions.createEl("button", { text: "✕" });
	delBtn.addClass("tah-model-del-btn");
	delBtn.addEventListener("click", () => {
		provider.customModels = (provider.customModels ?? []).filter((m) => m.id !== mc.id);
		void ctx.plugin.saveSettings();
		listEl.empty();
		updateModelCount(card, provider, t);
		for (const m2 of provider.customModels ?? []) {
			renderCustomModelRow(listEl, provider, m2, card, ctx);
		}
		refreshCardState(card, provider, t);
	});
}

/** 模型行参数变更或删除后保存并更新状态 */
function syncCustomModels(
	provider: ModelProvider,
	card: HTMLElement,
	ctx: SettingsTabContext
): void {
	void ctx.plugin.saveSettings();
	updateModelCount(card, provider, ctx.plugin.t);
	refreshCardState(card, provider, ctx.plugin.t);
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
