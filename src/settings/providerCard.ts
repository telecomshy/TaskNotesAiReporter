/**
 * 供应商卡壳 + 模型标签列（#100，架构候选 2 step 1）：「模型配置」Tab 两张卡
 * （预设 / 自定义）共用的卡壳，与「前 2 + 还有 N 个」的标签折叠控件。
 *
 * 本模块只管呈现：count 显隐规则、stale / active 判定、orphan 处理归 view-model
 * （#100 step 2 的 modelTabModel）；展开态以 `ModelTabViewState` 为账本，卡壳以它为
 * 初值、toggle 时回写，跨 `ctx.refresh()` 整页重建与卡内闭包重画存活。
 * DOM 结构类名（tah-provider-* / tah-model-tag 等）与拆分前的 modelTab 保持一致。
 */

import type { Translator } from "../i18n";

/** 「前 2 个 + 还有 N 个」的 2：标签列折叠策略的唯一常量。 */
export const MAIN_COUNT = 2;

/** 标签列的一行：stale / active 由调用方（view-model）算好，本控件只呈现。 */
export interface ModelTagRow {
	modelId: string;
	stale: boolean;
	active: boolean;
}

/**
 * 「模型配置」Tab 的展开态账本：卡开合与标签展开跨重绘存活。
 * 由 settings/index.ts 的 display() 创建、随 ModelTabContext 传入；键为供应商 id，
 * 重开设置页即归零（display 重建账本）。
 */
export interface ModelTabViewState {
	/** 展开的供应商卡。 */
	expandedProviders: Set<string>;
	/** 展开的模型标签列（目前只有预设卡有标签列）。 */
	expandedTags: Set<string>;
}

/** 供应商卡壳句柄：调用方经它同步头部与开合，不回查 DOM（querySelector 回查绝迹）。 */
export interface ProviderCardHandle {
	/** 卡片根元素（调用方可追加自己的类，如自定义卡的 tah-provider-custom）。 */
	el: HTMLElement;
	/** 展开区容器：卡内容（密钥行 / 模型行）由调用方填入。 */
	body: HTMLElement;
	/** 头部名称（自定义卡改名时回写）。 */
	setName(name: string): void;
	/** 头部模型计数；`null`＝隐藏（显隐规则归 view-model，壳只管呈现）。 */
	setCount(count: number | null): void;
	/** 头部状态文案与卡的 configured 类。 */
	setStatus(configured: boolean): void;
	/** 程序化开合（只管呈现，不记账；用户点击才回写 viewState）。 */
	setExpanded(expanded: boolean): void;
}

/** 卡壳选项。 */
export interface ProviderCardOptions {
	/** 初始名称（后续经 setName 同步）。 */
	name: string;
	/** 显示删除按钮；点击只触发 onDelete、不影响开合（stopPropagation 内置）。 */
	deletable?: boolean;
	onDelete?: () => void;
	t: Translator;
	/** 展开态账本与键：初值取 `expandedProviders.has(key)`，头部点击切换时回写。 */
	viewState: ModelTabViewState;
	/** 账本键：供应商 id。 */
	key: string;
}

/**
 * 造一张供应商卡：头部（箭头 / 圆点 / 名称 / 计数 / 状态 ［/ 删除］）＋ 折叠机械内置
 * （吸收原 wireCollapse——预设 / 自定义两份 header 构造重复到此为止）。
 * 初始开合取自 viewState；箭头与 tah-hidden 同步由壳负责。
 */
export function createProviderCard(
	list: HTMLElement,
	opts: ProviderCardOptions
): ProviderCardHandle {
	const card = list.createDiv({ cls: "tah-provider-card" });

	const header = card.createDiv({ cls: "tah-provider-header" });
	const arrow = header.createSpan({ cls: "tah-provider-arrow" });
	header.createSpan({ cls: "tah-provider-dot" });
	const nameEl = header.createSpan({ cls: "tah-provider-name", text: opts.name });
	const countEl = header.createSpan({ cls: "tah-provider-count" });
	const statusEl = header.createSpan({ cls: "tah-provider-status" });

	if (opts.deletable) {
		const delBtn = header.createEl("button", { text: "✕", cls: "tah-provider-delete-btn" });
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			opts.onDelete?.();
		});
	}

	const body = card.createDiv({ cls: "tah-provider-body" });

	const apply = (expanded: boolean): void => {
		body.toggleClass("tah-hidden", !expanded);
		arrow.setText(expanded ? "▾" : "▸");
	};

	// 展开态初值：账本里有记录则展开（跨 ctx.refresh() 整页重建存活）
	apply(opts.viewState.expandedProviders.has(opts.key));

	header.addEventListener("click", () => {
		const expanded = body.hasClass("tah-hidden");
		apply(expanded);
		// toggle 回写账本：下一次整页重建照旧展开
		if (expanded) opts.viewState.expandedProviders.add(opts.key);
		else opts.viewState.expandedProviders.delete(opts.key);
	});

	return {
		el: card,
		body,
		setName: (name) => {
			nameEl.textContent = name;
		},
		setCount: (count) => {
			countEl.textContent = count === null ? "" : opts.t("model.modelCount", { count });
		},
		setStatus: (configured) => {
			card.toggleClass("tah-provider-configured", configured);
			statusEl.textContent = configured ? opts.t("model.configured") : opts.t("model.notConfigured");
		},
		setExpanded: apply,
	};
}

/** 标签列选项。 */
export interface ModelTagListOptions {
	/** 初值：标签列是否展开（调用方从 viewState 读）。 */
	expanded: boolean;
	/** 开合回调：toggle 后以新状态就地重画；调用方在此记账。 */
	onToggle: (expanded: boolean) => void;
	t: Translator;
}

/**
 * 模型标签列（预设卡的「启用模型」展示）：「前 MAIN_COUNT 个 + 还有 N 个」折叠策略
 * 只此一处（吸收原 renderModelTags / renderAllModelTags 两份实现）。
 * stale 徽标与 active 高亮由行数据携带；本控件只呈现（#91：选择唯一入口是下拉）。
 */
export function renderModelTagList(
	container: HTMLElement,
	rows: ModelTagRow[],
	opts: ModelTagListOptions
): void {
	container.empty();
	for (const row of opts.expanded ? rows : rows.slice(0, MAIN_COUNT)) {
		appendModelTag(container, row, opts.t);
	}

	const rest = rows.length - MAIN_COUNT;
	if (rest <= 0) return;

	const toggle = container.createSpan({ cls: "tah-model-more" });
	toggle.setText(
		opts.expanded ? opts.t("model.collapse") : opts.t("model.moreModels", { count: rest })
	);
	toggle.addEventListener("click", () => {
		const next = !opts.expanded;
		opts.onToggle(next);
		// 就地重画：以新开合状态重建标签列（不整页 refresh）
		renderModelTagList(container, rows, { ...opts, expanded: next });
	});
}

/** 渲染单个模型标签：上游消失的标「已失效」徽标；当前模型加高亮类。 */
function appendModelTag(container: HTMLElement, row: ModelTagRow, t: Translator): void {
	const tag = container.createSpan({ cls: "tah-model-tag" });
	tag.createSpan({ text: row.modelId });
	if (row.stale) {
		tag.createSpan({ cls: "tah-stale-badge", text: t("model.staleBadge") });
	}
	if (row.active) {
		tag.addClass("tah-model-tag-active");
	}
}
