/**
 * 挑选对话框（#87，ADR-0026）：「获取模型列表」拉取成功后弹出，呈现「模型清单」供勾选。
 * 默认仅挑选「启用模型」；提供全选 / 全不选；确认才生效（取消不改动启用集）。
 * 「当前模型」受保护：试图取消勾选时提示先切换模型（真正移除需先切换，见 ADR-0026）。
 * 预设与自定义供应商共用同一对话框；启用集 / 清单 / 呈现序读面在 providerModels，
 * 启停语义在 providerSettings 命令里，本模块只做呈现与勾选收集。
 */

import { Modal, Notice, type App } from "obsidian";
import type { ModelProvider } from "../types";
import type { Translator } from "../i18n";
import { enabledModels, isModelStale, pickerRows } from "./providerModels";
import type { ProviderSettings } from "./providerSettings";

/** 挑选对话框的依赖面：供应商命令 + 弹窗所需的 app。 */
export interface ModelPickerContext {
	app: App;
	providers: ProviderSettings;
	t: Translator;
	refresh: () => void;
}

/** 打开挑选对话框（调用方先完成拉取与「模型清单」刷新）。 */
export function openModelPicker(ctx: ModelPickerContext, provider: ModelProvider): void {
	new ModelPickerModal(ctx, provider).open();
}

class ModelPickerModal extends Modal {
	/** 当前勾选草稿（确认前不落状态）。 */
	private readonly checked = new Set<string>();
	/** 每行勾选框（全选 / 全不选联动用）。 */
	private readonly rowInputs = new Map<string, HTMLInputElement>();

	constructor(
		private readonly ctx: ModelPickerContext,
		private readonly provider: ModelProvider
	) {
		super(ctx.app);
	}

	onOpen(): void {
		const t = this.ctx.t;
		this.modalEl.addClass("tah-model-picker");
		this.setTitle(t("model.pickerTitle"));
		this.contentEl.createEl("p", {
			text: t("model.pickerHint"),
			cls: "setting-item-description",
		});

		for (const model of enabledModels(this.provider)) this.checked.add(model);

		const actions = this.contentEl.createDiv({ cls: "tah-model-picker-actions" });
		const selectAllBtn = actions.createEl("button", { text: t("model.pickerSelectAll") });
		selectAllBtn.addClass("tah-auth-btn");
		selectAllBtn.addEventListener("click", () => this.setCheckedAll(true));
		const selectNoneBtn = actions.createEl("button", { text: t("model.pickerSelectNone") });
		selectNoneBtn.addClass("tah-auth-btn");
		selectNoneBtn.addEventListener("click", () => this.setCheckedAll(false));

		const list = this.contentEl.createDiv({ cls: "tah-model-picker-list" });
		for (const model of pickerRows(this.provider)) this.renderRow(list, model);

		const footer = this.contentEl.createDiv({ cls: "tah-modal-footer" });
		const cancelBtn = footer.createEl("button", { text: t("model.pickerCancel") });
		cancelBtn.addClass("tah-auth-btn");
		cancelBtn.addEventListener("click", () => this.close());
		const confirmBtn = footer.createEl("button", { text: t("model.pickerConfirm") });
		confirmBtn.addClass("tah-generate-btn");
		confirmBtn.addEventListener("click", () => this.confirm());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderRow(list: HTMLElement, model: string): void {
		const t = this.ctx.t;
		const row = list.createEl("label", { cls: "tah-model-picker-row" });
		const checkbox = row.createEl("input", { type: "checkbox" });
		checkbox.checked = this.checked.has(model);
		this.rowInputs.set(model, checkbox);
		row.createSpan({ text: model });
		if (isModelStale(this.provider, model)) {
			row.createSpan({ cls: "tah-stale-badge", text: t("model.staleBadge") });
		}
		checkbox.addEventListener("change", () => {
			if (
				!checkbox.checked &&
				this.ctx.providers.isModelProtected(this.provider.id, model)
			) {
				checkbox.checked = true;
				new Notice(t("model.protectActiveModel"));
				return;
			}
			if (checkbox.checked) this.checked.add(model);
			else this.checked.delete(model);
		});
	}

	/** 全选 / 全不选；「全不选」也保留受保护的「当前模型」。 */
	private setCheckedAll(checked: boolean): void {
		for (const [model, input] of this.rowInputs) {
			const next = checked || this.ctx.providers.isModelProtected(this.provider.id, model);
			input.checked = next;
			if (next) this.checked.add(model);
			else this.checked.delete(model);
		}
	}

	private confirm(): void {
		this.ctx.providers.applyPickedModels(this.provider.id, [...this.checked]);
		this.close();
		this.ctx.refresh();
	}
}
