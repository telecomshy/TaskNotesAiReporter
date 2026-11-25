/**
 * 设置页「模型配置」Tab：内置供应商（仅 api key + 动态拉取模型）与自定义供应商。
 * 本模块只导出 renderModelTab 入口，内部辅助函数均为本模块私有。
 * 领域规则（count 显隐 / stale / active / 孤儿判定）在 ./modelTabModel 投影，
 * 「思考行」的控件组合（开关 / 徽标 / 备注 / 测试入口）在 ./thinkingCardModel 投影（#102），
 * 卡壳与标签折叠控件在 ./providerCard；本模块只剩渲染接线（#100）。
 */

import { Notice, SecretComponent, type App } from "obsidian";
import type { ModelProvider } from "../types";
import { apiStyleOf } from "../core/apiStyle";
import type { Translator } from "../i18n";
import { AIClientError, testConnection } from "../ai/client";
import { describeAIError } from "../ai/errorMessage";
import { runAndAnnounceThinkingTest } from "../ui/thinkingTestAction";
import {
	activeModelCardModel,
	providerCardModel,
	type CustomCardModel,
	type CustomModelRowModel,
	type PresetCardModel,
	type ProviderCardModel,
} from "./modelTabModel";
import { thinkingCardModel, hasActiveModel } from "./thinkingCardModel";
import {
	createProviderCard,
	renderModelTagList,
	type ModelTagRow,
	type ModelTabViewState,
	type ProviderCardHandle,
} from "./providerCard";
import type { ActiveModelInfo, ProviderSettings } from "./providerSettings";
import type { SettingsSnapshot } from "./owner";
import { runFetchModelsFlow } from "./fetchModels";
import { openModelPicker } from "./modelPicker";

/** 「模型配置」Tab 的依赖面：模型 / 供应商相关；不含非供应商设置命令。 */
export interface ModelTabContext {
	app: App;
	settings: SettingsSnapshot;
	providers: ProviderSettings;
	t: Translator;
	refresh: () => void;
	/** 展开态账本（#100 step 1）：卡开合与标签展开跨重绘存活。 */
	viewState: ModelTabViewState;
}

/** 渲染「模型配置」Tab；返回退订函数（#108：顶卡重绘由供应商门面的变更通知驱动）。 */
export function renderModelTab(container: HTMLElement, ctx: ModelTabContext): () => void {
	// 初始帧唯一一次「当前模型」读（顶部读面）：当前模型卡与两张供应商卡的投影共用。
	// 卡内变更触发的目标化重绘（#107）是另一帧：只重读顶卡，不重投供应商卡。
	const info = ctx.providers.activeModelInfo();

	// 顶部「当前模型」独立宿主（#107）：卡内变更经通知只重投这一块，
	// 供应商卡的 DOM 不动，正在编辑的输入框因此不失焦、不丢光标。
	const activeHost = container.createDiv({ cls: "tah-active-model-host" });
	renderActiveModelSection(activeHost, ctx, info);
	/** 目标化重绘：在独立帧里重读一次当前模型并重建顶部卡（下拉 + 思考行 + 能力徽标）。 */
	const refreshActiveModel = (): void => {
		activeHost.empty();
		renderActiveModelSection(activeHost, ctx, ctx.providers.activeModelInfo());
	};

	// 单一失效入口（#108）：门面发布三类变更；只有 selectable 改变可选模型集合。
	// layout 由既有调用方整页刷新，quiet（行参数 / 改名）不影响顶卡。
	const unsubscribe = ctx.providers.subscribe((kind) => {
		if (kind === "selectable") refreshActiveModel();
	});

	const t = ctx.t;
	container.createEl("h3", { text: t("model.providersHeading"), cls: "tah-provider-title" });
	container.createEl("p", {
		text: t("model.providersIntro"),
		cls: "setting-item-description",
	});

	const list = container.createDiv({ cls: "tah-provider-list" });
	for (const provider of ctx.settings.providers) {
		const model = providerCardModel(provider, info, t);
		if (model.kind === "preset") {
			renderPresetProviderCard(list, model, provider, ctx);
		} else {
			renderCustomProviderCard(list, model, provider, ctx);
		}
	}

	// 底部「添加模型供应商」按钮
	const addRow = container.createDiv({ cls: "tah-add-provider-row" });
	const addBtn = addRow.createEl("button", { text: t("model.addProvider") });
	addBtn.addClass("tah-add-provider-btn");
	addBtn.addEventListener("click", () => addCustomProvider(ctx));

	return unsubscribe;
}

/** 头部三件套 + 计数显隐：卡级投影 → 卡壳句柄（视图不再回查 DOM，#100 step 2）。 */
function applyCardHead(card: ProviderCardHandle, model: ProviderCardModel): void {
	card.setName(model.name);
	card.setStatus(model.configured);
	card.setCount(model.count.show ? model.count.value : null);
}

/** 「选择模型」卡的一行：左名称＋说明，右控件（P1 卡片设计语言）。返回行容器。 */
function cardRow(card: HTMLElement, name: string, desc: string): HTMLElement {
	const row = card.createDiv({ cls: "tah-model-card-row" });
	const text = row.createDiv({ cls: "tah-model-card-text" });
	text.createDiv({ cls: "tah-model-card-name", text: name });
	text.createDiv({ cls: "tah-model-card-desc", text: desc });
	return row;
}

/**
 * 顶部「当前模型」区：「选择模型」卡（#88，P1 同卡第二行摆放）。
 * 卡内第一行选择模型；分隔线下第二行「思考开关」两档滑动开关（开关跟模型走）；
 * 卡脚注行放能力徽标 ＋ 备注 ＋ 右对齐测试入口位。
 * 分组选项 / 当前值 / 孤儿占位由 activeModelCardModel 投影给出（#100 step 2）；
 * 初始帧的 `info` 由 renderModelTab 顶部传入；目标化重绘（#107）在独立帧重读后传入。
 */
function renderActiveModelSection(
	container: HTMLElement,
	ctx: ModelTabContext,
	info: ActiveModelInfo
): void {
	const t = ctx.t;
	container.createEl("h3", { text: t("model.activeHeading") });

	const model = activeModelCardModel(ctx.settings, info, t);
	if (model.options.length === 0) {
		container.createEl("p", {
			text: t("model.noModels"),
			cls: "setting-item-description",
		});
		return;
	}

	const card = container.createDiv({ cls: "tah-model-card" });

	// 第一行：选择模型（下拉按供应商分组；「已失效」模型仍可选（保留可移除，AC6））
	const selectRow = cardRow(card, t("model.selectModelName"), t("model.selectModelDesc"));
	const selectEl = selectRow.createEl("select", { cls: "tah-model-select" });
	// 孤儿占位（裁决 7）：当前值不在选项里时补一个占位 option（置于分组之前的顶级位），
	// 让下拉如实呈现当前值；无当前模型时不算孤儿、不显示。
	if (model.orphan) {
		const placeholder = selectEl.createEl("option");
		placeholder.value = model.selected;
		placeholder.text = `${info.model} · ${t("model.activeModelUnavailable")}`;
	}
	for (const group of model.options) {
		const optgroup = selectEl.createEl("optgroup");
		optgroup.label = group.providerName;
		for (const option of group.models) {
			const optionEl = optgroup.createEl("option");
			optionEl.value = option.value;
			optionEl.text = option.label;
		}
	}
	selectEl.value = model.selected;
	selectEl.addEventListener("change", () => {
		const value = selectEl.value;
		const sepIndex = value.indexOf("::");
		if (sepIndex < 0) return;
		ctx.providers.selectActiveModel(value.slice(0, sepIndex), value.slice(sepIndex + 2));
		// 刷新以更新思考行（「思考开关」与能力随模型而变）
		ctx.refresh();
	});

	// 分隔线之下第二行：「思考」两档开关 + 卡脚注
	card.createDiv({ cls: "tah-model-card-divider" });
	renderThinkingRow(card, model.info, ctx);
}

/**
 * 「思考开关」两档滑动开关（#88）：作用于当前模型，取值按模型持久化。
 * 状态 → 控件组合（开关 / 徽标 / 备注 / 测试入口）由 thinkingCardModel 投影（#102），
 * 本函数只按规格建元素（文案键在 i18n，ADR-0005）。
 * 测试入口（#89）：未知＝「测试思考能力」按钮；习得档＝「重新测试」文字入口（清习得并重跑）；
 * 已知（内置）＝置灰「已知，无需测试」。运行中态（「测试中…」文案、异步期禁用）是瞬态
 * view 状态，留在 startTest。
 */
function renderThinkingRow(card: HTMLElement, info: ActiveModelInfo, ctx: ModelTabContext): void {
	const t = ctx.t;
	const view = thinkingCardModel(info);

	const row = cardRow(card, t("model.thinking"), t("model.thinkingDesc"));

	const sw = row.createEl("button", {
		cls: "tah-thinking-switch",
		attr: {
			role: "switch",
			"aria-checked": String(view.toggle.checked),
			"aria-label": t("model.thinking"),
			title: t(view.toggle.titleKey),
		},
	});
	sw.disabled = !view.toggle.enabled;
	sw.addEventListener("click", () => {
		if (!view.toggle.enabled) return;
		ctx.providers.setModelThinking(
			info.providerId,
			info.model,
			view.toggle.checked ? "off" : "on"
		);
		ctx.refresh();
	});

	// 卡脚注：能力徽标 ＋ 备注 ＋ 右对齐测试入口位
	const foot = card.createDiv({ cls: "tah-thinking-foot" });
	const badge = foot.createSpan({ cls: `tah-thinking-badge tah-thinking-badge-${view.badge.tone}` });
	badge.createSpan({ cls: "tah-thinking-badge-dot" });
	badge.createSpan({ text: t(view.badge.key, view.badge.vars) });
	foot.createSpan({
		cls: view.footnote.warn
			? "tah-thinking-footnote tah-thinking-footnote-warn"
			: "tah-thinking-footnote",
		text: t(view.footnote.key, view.footnote.vars),
	});
	foot.createSpan({ cls: "tah-thinking-foot-spacer" });

	const startTest = (btn: HTMLElement, retest: boolean) => {
		if (!hasActiveModel(info)) return;
		btn.setAttribute("disabled", "true");
		btn.setText(t("model.thinkingTestRunning"));
		void runAndAnnounceThinkingTest(
			{
				providers: ctx.providers,
				timeoutSeconds: ctx.settings.timeoutSeconds,
				t,
				onDone: ctx.refresh,
			},
			retest
		);
	};

	switch (view.test.kind) {
		case "run": {
			const testBtn = foot.createEl("button", {
				cls: "tah-thinking-test-btn",
				text: t(view.test.labelKey),
			});
			testBtn.disabled = view.test.disabled;
			testBtn.addEventListener("click", () => startTest(testBtn, false));
			break;
		}
		case "retest": {
			// 「重新测试」文字入口（#89）：清习得并重跑；假关告警内另有同款动作
			const retestBtn = foot.createEl("button", {
				cls: "tah-thinking-test-link",
				text: t(view.test.labelKey),
			});
			retestBtn.addEventListener("click", () => startTest(retestBtn, true));
			break;
		}
		case "done": {
			// 显示矩阵「测试入口置灰」：位在，已知无需测试（置灰决策由 model 给出）
			const doneBtn = foot.createEl("button", {
				cls: "tah-thinking-test-done",
				text: t(view.test.labelKey),
			});
			doneBtn.disabled = view.test.disabled;
			break;
		}
	}
}

/** 内置供应商卡片：仅需 api key，模型动态拉取。头部与标签列由卡级投影给出（#100 step 2）。 */
function renderPresetProviderCard(
	container: HTMLElement,
	model: PresetCardModel,
	provider: ModelProvider,
	ctx: ModelTabContext
): void {
	const t = ctx.t;
	const card = createProviderCard(container, {
		name: model.name,
		deletable: model.deletable,
		t,
		viewState: ctx.viewState,
		key: provider.id,
	});

	// API 密钥 + 获取模型列表按钮（同一行，选好密钥即可点击）。
	// 密钥变更只保存密钥名：「启用模型」只在「获取模型列表」＋挑选确认处变动（#90 唯一入口），
	// 清空密钥名连带清空启用集由 provider 层不变量处理（#90，回归 #29）。
	const keyRow = card.body.createDiv({ cls: "tah-provider-field" });
	keyRow.createSpan({ cls: "tah-provider-field-label", text: t("model.apiKeyLabel") });
	const keyHost = keyRow.createDiv({ cls: "tah-provider-input" });
	attachSecretControl(ctx, keyHost, provider, (value) => {
		ctx.providers.setSecretId(provider.id, value);
		// 卡内重画：清空密钥名的清空联动（#90）可能同时改计数 / 状态 / 标签列
		redraw();
	});
	const fetchBtn = keyRow.createEl("button", { text: t("model.fetchModels") });
	fetchBtn.addClass("tah-fetch-models-btn");
	fetchBtn.addEventListener("click", () => void fetchModels(provider, ctx));

	// 启用模型容器（默认隐藏，启用集为空时隐藏）
	const modelsLabel = card.body.createDiv({
		cls: "tah-provider-models-label",
		text: t("model.enabledModels"),
	});
	modelsLabel.addClass("tah-hidden");
	const modelsRow = card.body.createDiv({ cls: "tah-provider-models" });

	/** 标签列：展开态以 viewState 为初值，toggle 回写（卡内重画不再丢展开）。 */
	const renderTags = (entries: ModelTagRow[]): void => {
		modelsLabel.toggleClass("tah-hidden", entries.length === 0);
		renderModelTagList(modelsRow, entries, {
			expanded: ctx.viewState.expandedTags.has(provider.id),
			onToggle: (next) => {
				if (next) ctx.viewState.expandedTags.add(provider.id);
				else ctx.viewState.expandedTags.delete(provider.id);
			},
			t,
		});
	};

	// 卡内重画是它自己的帧：重算一次投影，头部与标签列一起同步（密钥变更入口）。
	// 本卡由预设供应商渲染，投影恒为 preset 型——kind 判别只为对齐视图分支。
	const redraw = (): void => {
		const fresh = providerCardModel(provider, ctx.providers.activeModelInfo(), ctx.t);
		applyCardHead(card, fresh);
		if (fresh.kind === "preset") renderTags(fresh.entries);
	};

	applyCardHead(card, model);
	renderTags(model.entries);
}

/** 固定位数的密钥掩码（8 颗圆点），替代原生「点 + ×」显示。 */
const SECRET_MASK = "••••••••";

interface SecretControl {
	component: SecretComponent;
	/** 重新计算掩码显隐与「密钥不可用」提示。 */
	syncSecretState: (secretId: string) => void;
}

/**
 * 挂载密钥选择控件：用固定点掩码取代 Obsidian 原生的「点 + ×」值显示（CSS 隐藏），
 * 保留原生「更改/Link」按钮以复用其选择与新建密钥弹窗。变更时先同步掩码再回调。
 * 另给一个「管理密钥」入口（重命名/删除归 Obsidian 密钥存储）与「密钥不可用」内联提示。
 */
function attachSecretControl(
	ctx: ModelTabContext,
	host: HTMLElement,
	provider: ModelProvider,
	onChange: (value: string) => void
): SecretControl {
	host.addClass("tah-secret-host");
	const t = ctx.t;
	const mask = host.createSpan({ cls: "tah-secret-mask", text: SECRET_MASK });
	const component = new SecretComponent(ctx.app, host).setValue(provider.apiKeySecretId);

	const manageBtn = host.createEl("button", { text: t("model.manageSecret") });
	manageBtn.addClass("tah-secret-manage-btn");
	manageBtn.addEventListener("click", () => openSecretStorage(ctx));

	const hint = host.createSpan({ cls: "tah-secret-hint tah-hidden", text: t("model.secretUnavailable") });

	const syncSecretState = (secretId: string) => {
		mask.toggleClass("is-empty", secretId.trim() === "");
		hint.toggleClass("tah-hidden", !ctx.providers.isSecretMissing(secretId));
	};
	syncSecretState(provider.apiKeySecretId);

	component.onChange((value) => {
		syncSecretState(value);
		onChange(value);
	});
	return { component, syncSecretState };
}

/** Obsidian「密钥存储」设置页的 tab id（内部 API 跳转，见 ADR-0008）。 */
const SECRET_STORAGE_TAB_ID = "keychain";

/** 打开 Obsidian 的「密钥存储」设置页（内部 API 不在公开类型里，见 ADR-0008；带降级提示）。 */
function openSecretStorage(ctx: ModelTabContext): void {
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
	new Notice(ctx.t("model.manageSecretHint"));
}

/**
 * 「获取模型列表」（手动点击，#87）：规则（守卫 / 拉取 / 空表记账）由 fetchModels 流程拥有，
 * 本函数只把结局映射为提示 / 挑选框。确认才改动启用集；取消对话框即什么也不发生。
 */
async function fetchModels(provider: ModelProvider, ctx: ModelTabContext): Promise<void> {
	const t = ctx.t;
	const outcome = await runFetchModelsFlow(
		ctx.providers,
		provider,
		ctx.settings.timeoutSeconds,
		undefined,
		() => new Notice(t("model.fetching", { name: provider.name }))
	);
	switch (outcome.kind) {
		case "need-url":
			new Notice(t("model.testNeedUrl"));
			return;
		case "need-key":
			new Notice(t("model.fetchNeedKey"));
			return;
		case "secret-missing":
			new Notice(t("model.fetchSecretMissing"));
			return;
		case "failed": {
			// Anthropic 方言的网关常只实现 `/messages`、不实现 `/v1/models`（#105 US12）：
			// 404 时把「手动填模型 ID」的兜底路径一并提示，否则用户只看到一句 404。
			const hint =
				apiStyleOf(provider) === "anthropic" &&
				outcome.error instanceof AIClientError &&
				outcome.error.code === "models.http" &&
				outcome.error.details.status === 404
					? `\n${t("model.fetchFailedNoModelList")}`
					: "";
			new Notice(`${t("model.fetchFailed", { error: describeAIError(outcome.error, t) })}${hint}`);
			return;
		}
		case "empty":
			new Notice(t("model.fetchEmpty", { name: provider.name }));
			ctx.refresh();
			return;
		case "fetched":
			openModelPicker(ctx, provider);
			return;
	}
	// 穷尽性守卫：新增结局时这里编译失败，逼视图补上映射。
	const exhaustive: never = outcome;
	void exhaustive;
}

/** 添加自定义供应商：直接新增一张卡片，在卡片内维护配置与模型 */
function addCustomProvider(ctx: ModelTabContext): void {
	ctx.providers.addProvider();
	ctx.refresh();
}

/** 删除自定义供应商 */
function deleteCustomProvider(provider: ModelProvider, ctx: ModelTabContext): void {
	ctx.providers.removeProvider(provider.id);
	ctx.refresh();
}

/** 自定义供应商卡的行编辑器环境：卡级依赖与两个局部重画动作一起传递（#108）。 */
interface CustomCardEnv {
	provider: ModelProvider;
	ctx: ModelTabContext;
	/** 行参数 / 名称变更后的头部同步（计数 / 状态），不重画列表。 */
	syncHead: () => void;
	/** 删除后重画整张列表（含列表尾的追加行）＋ 头部。 */
	redraw: () => void;
}

/** 自定义供应商卡片：全局配置（名称/API 地址/认证方式）+ 多模型列表（每行独立参数 + 测试）。
 * 头部（含删除按钮）与开合走卡壳，模型行由卡级投影给出（#100 step 2）。 */
function renderCustomProviderCard(
	container: HTMLElement,
	model: CustomCardModel,
	provider: ModelProvider,
	ctx: ModelTabContext
): void {
	const t = ctx.t;
	const card = createProviderCard(container, {
		name: model.name,
		deletable: model.deletable,
		onDelete: () => deleteCustomProvider(provider, ctx),
		t,
		viewState: ctx.viewState,
		key: provider.id,
	});
	card.el.addClass("tah-provider-custom");
	const body = card.body;

	// ---- 全局配置区 ----

	// 服务商名称
	const nameRow = body.createDiv({ cls: "tah-provider-field" });
	nameRow.createSpan({ cls: "tah-provider-field-label", text: t("model.providerName") });
	const nameInput = nameRow.createEl("input", { type: "text" });
	nameInput.addClass("tah-provider-input");
	nameInput.value = provider.name;
	nameInput.placeholder = t("model.providerNamePlaceholder");
	nameInput.addEventListener("change", () => {
		ctx.providers.setProviderName(provider.id, nameInput.value);
		nameInput.value = provider.name;
		card.setName(provider.name);
	});

	// 「接口方言」（#105）：紧挨 API 地址——它决定这个地址该按哪套规矩填
	// （地址 / 认证头 / 请求体）。切换只写方言，模型行 / 启用集 / 当前模型全部保留。
	const styleRow = body.createDiv({ cls: "tah-provider-field" });
	styleRow.createSpan({ cls: "tah-provider-field-label", text: t("model.apiStyle") });
	const styleGroup = styleRow.createDiv({ cls: "tah-auth-group" });
	const openaiStyleBtn = styleGroup.createEl("button", { text: t("model.apiStyleOpenai") });
	const anthropicStyleBtn = styleGroup.createEl("button", { text: t("model.apiStyleAnthropic") });
	openaiStyleBtn.addClass("tah-auth-btn");
	anthropicStyleBtn.addClass("tah-auth-btn");

	// API 地址
	const urlRow = body.createDiv({ cls: "tah-provider-field" });
	urlRow.createSpan({ cls: "tah-provider-field-label", text: t("model.apiUrl") });
	const urlInput = urlRow.createEl("input", { type: "text" });
	urlInput.addClass("tah-provider-input");
	urlInput.value = provider.baseUrl;
	urlInput.placeholder = t("model.apiUrlPlaceholder");
	urlInput.addEventListener("change", () => {
		ctx.providers.setProviderBaseUrl(provider.id, urlInput.value);
		urlInput.value = provider.baseUrl;
		syncHead();
	});

	// Anthropic 方言的地址提示（#105）：少了 /v1 会得到莫名其妙的 404。
	const styleHint = body.createDiv({
		cls: "setting-item-description tah-provider-style-hint",
		text: t("model.apiStyleHint"),
	});

	// 认证方式（按钮单选）+ API 密钥（Bearer / x-api-key 时显示）
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
		ctx.providers.setSecretId(provider.id, value);
		syncHead();
	});

	const updateAuth = () => {
		bearerBtn.toggleClass("tah-auth-active", provider.authType === "bearer");
		noneBtn.toggleClass("tah-auth-active", provider.authType === "none");
		keyRow.toggleClass("tah-hidden", provider.authType !== "bearer");
	};

	/** 方言单选：高亮当前值；认证头文案随方言（`Bearer Token` / `x-api-key`）；地址提示按需显示。 */
	const updateStyle = () => {
		const anthropicStyle = apiStyleOf(provider) === "anthropic";
		openaiStyleBtn.toggleClass("tah-auth-active", !anthropicStyle);
		anthropicStyleBtn.toggleClass("tah-auth-active", anthropicStyle);
		bearerBtn.setText(t(anthropicStyle ? "model.authApiKeyHeader" : "model.authBearer"));
		styleHint.toggleClass("tah-hidden", !anthropicStyle);
	};
	openaiStyleBtn.addEventListener("click", () => {
		ctx.providers.setProviderApiStyle(provider.id, "openai");
		updateStyle();
	});
	anthropicStyleBtn.addEventListener("click", () => {
		ctx.providers.setProviderApiStyle(provider.id, "anthropic");
		updateStyle();
	});
	bearerBtn.addEventListener("click", () => {
		ctx.providers.setAuthType(provider.id, "bearer");
		updateAuth();
	});
	noneBtn.addEventListener("click", () => {
		ctx.providers.setAuthType(provider.id, "none");
		secret.syncSecretState("");
		secret.component.setValue("");
		updateAuth();
		syncHead();
	});
	updateAuth();
	updateStyle();

	// ---- 模型列表区 ----
	// 「启用模型」标签行：标签居左，「获取模型列表」居右——本区的半自动入口
	// （仅手动触发、无静默拉取，走同一挑选对话框，AC7；拉取 → 挑选两步）
	const labelRow = body.createDiv({ cls: "tah-provider-models-label" });
	labelRow.createSpan({ text: t("model.enabledModels") });
	const fetchBtn = labelRow.createEl("button", { text: t("model.fetchModels") });
	fetchBtn.addClass("tah-fetch-models-btn");
	fetchBtn.addEventListener("click", () => void fetchModels(provider, ctx));
	const modelsList = body.createDiv({ cls: "tah-custom-models-list" });

	/** 头部同步（地址 / 密钥 / 认证方式 / 行参数变更后）：计数与状态跟随，不重画列表。 */
	const syncHead = (): void => {
		applyCardHead(card, providerCardModel(provider, ctx.providers.activeModelInfo(), ctx.t));
	};

	const renderModelRows = (rows: CustomModelRowModel[]): void => {
		modelsList.empty();
		const env: CustomCardEnv = { provider, ctx, syncHead, redraw };
		for (const row of rows) {
			renderCustomModelRow(modelsList, row, env);
		}
		// 列表尾「手动添加」追加行：手动配置＝给列表添一行草稿，与列表编辑同属一体
		const appendBtn = modelsList.createEl("button", {
			cls: "tah-add-model-btn",
			text: t("model.newModel"),
		});
		appendBtn.addEventListener("click", () => {
			ctx.providers.addModel(provider.id);
			redraw();
		});
	};

	// 卡内重画是它自己的帧：重算一次投影，头部与模型行一起同步（删除行 / 追加行入口）。
	// 本卡由自定义供应商渲染，投影恒为 custom 型——kind 判别只为对齐视图分支。
	const redraw = (): void => {
		const fresh = providerCardModel(provider, ctx.providers.activeModelInfo(), ctx.t);
		applyCardHead(card, fresh);
		if (fresh.kind === "custom") renderModelRows(fresh.rows);
	};

	applyCardHead(card, model);
	renderModelRows(model.rows);
}

/** 渲染单个模型配置行（模型ID + Context Length + Max Tokens + 测试 + 删除）；
 * 行 flag（stale / active / draft）由卡级投影算好（#100 step 2），本函数只接线。 */
function renderCustomModelRow(
	listEl: HTMLElement,
	row: CustomModelRowModel,
	env: CustomCardEnv
): void {
	const { provider, ctx, syncHead, redraw } = env;
	const t = ctx.t;
	const rowEl = listEl.createDiv({ cls: "tah-custom-model-row" });
	if (row.active) {
		rowEl.addClass("tah-custom-model-row-active");
	}

	// 模型 ID
	const idGroup = rowEl.createDiv({ cls: "tah-custom-model-group" });
	idGroup.createDiv({ cls: "tah-custom-model-label", text: t("model.modelId") });
	const idInput = idGroup.createEl("input", { type: "text" });
	idInput.addClass("tah-provider-input");
	idInput.value = row.modelId;
	idInput.placeholder = t("model.modelIdPlaceholder");
	idInput.addEventListener("change", () => {
		ctx.providers.renameModel(provider.id, row.rowId, idInput.value);
		// 存储侧写入的是 trim 后的值；行数据是 modelRows 快照（非活对象），回填取 trim 后的输入。
		idInput.value = idInput.value.trim();
		syncHead();
	});
	// 上游消失的启用模型标「已失效」，保留可移除（AC6）
	if (row.stale) {
		idGroup.createDiv({ cls: "tah-stale-badge", text: t("model.staleBadge") });
	}

	// Context Length
	const ctxGroup = rowEl.createDiv({ cls: "tah-custom-model-group" });
	ctxGroup.createDiv({ cls: "tah-custom-model-label", text: t("model.contextLength") });
	const ctxInput = ctxGroup.createEl("input", { type: "text" });
	ctxInput.addClass("tah-provider-input");
	ctxInput.value = row.params.contextLength?.toString() ?? "";
	ctxInput.placeholder = "204800";
	ctxInput.addEventListener("change", () => {
		ctx.providers.setModelParams(provider.id, row.rowId, {
			contextLength: parseIntSafe(ctxInput.value),
		});
		syncHead();
	});

	// Max Tokens
	const maxGroup = rowEl.createDiv({ cls: "tah-custom-model-group" });
	maxGroup.createDiv({ cls: "tah-custom-model-label", text: t("model.maxTokens") });
	const maxInput = maxGroup.createEl("input", { type: "text" });
	maxInput.addClass("tah-provider-input");
	maxInput.value = row.params.maxTokens?.toString() ?? "";
	maxInput.placeholder = "65535";
	maxInput.addEventListener("change", () => {
		ctx.providers.setModelParams(provider.id, row.rowId, {
			maxTokens: parseIntSafe(maxInput.value),
		});
		syncHead();
	});

	// 测试按钮（针对该模型）
	const actions = rowEl.createDiv({ cls: "tah-custom-model-actions" });
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
			// 「测试」按当前方言发请求（#105）：测试通过即真实生成路径可用。
			apiStyle: apiStyleOf(provider),
			baseUrl: provider.baseUrl.trim(),
			apiKey:
				provider.authType === "bearer"
					? ctx.providers.secretValue(provider.apiKeySecretId)
					: "",
			model: modelId,
			temperature: ctx.settings.temperature,
			maxTokens: parseIntSafe(maxInput.value) ?? ctx.settings.maxTokens,
			timeoutSeconds: ctx.settings.timeoutSeconds,
		})
			.then(() => {
				new Notice(t("model.testPassed", { model: modelId }));
			})
			.catch((error) => {
				new Notice(t("model.testFailed", { error: describeAIError(error, t) }));
			});
	});

	// 删除按钮（「当前模型」受保护：移除前需先切换模型，AC3）
	const delBtn = actions.createEl("button", { text: "✕" });
	delBtn.addClass("tah-model-del-btn");
	delBtn.addEventListener("click", () => {
		if (ctx.providers.isModelProtected(provider.id, row.modelId)) {
			new Notice(t("model.protectActiveModel"));
			return;
		}
		ctx.providers.removeModel(provider.id, row.rowId);
		// 整张列表重画（含列表尾追加行）：单删一行后不再丢「+ 手动添加模型 ID」按钮。
		redraw();
	});
}

function parseIntSafe(value: string): number | undefined {
	const n = parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}
