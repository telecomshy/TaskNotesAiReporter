/**
 * 设置页「模板配置」Tab：报告模板的查看、添加、编辑、删除。
 * 本模块只导出 renderTemplateTab 入口，附带模板编辑弹窗。
 */

import { Modal, Notice, type App } from "obsidian";
import type { ReportTemplate } from "../types";
import type { Translator } from "../i18n";
import type { SettingsTabContext } from "./index";

/** 新建模板的默认名称：作为持久化数据，保持语言无关，不随界面语言变化。 */
const NEW_TEMPLATE_NAME = "新模板";

/** 渲染「模板配置」Tab */
export function renderTemplateTab(container: HTMLElement, ctx: SettingsTabContext): void {
	const t = ctx.plugin.t;
	container.createEl("h3", { text: t("template.heading") });
	container.createEl("p", {
		text: t("template.intro"),
		cls: "setting-item-description",
	});

	// 添加模板按钮
	const addRow = container.createDiv({ cls: "tah-template-add-row" });
	const addBtn = addRow.createEl("button", { text: t("template.add") });
	addBtn.addClass("tah-add-btn");
	addBtn.addEventListener("click", () => addTemplate(ctx));

	// 模板列表
	const list = container.createDiv({ cls: "tah-template-list" });
	const templates = ctx.plugin.settings.templates;
	if (templates.length === 0) {
		list.createDiv({ text: t("template.empty"), cls: "tah-empty" });
	}
	for (const template of templates) {
		renderTemplateItem(list, template, ctx);
	}
}

function renderTemplateItem(
	container: HTMLElement,
	template: ReportTemplate,
	ctx: SettingsTabContext
): void {
	const t = ctx.plugin.t;
	const item = container.createDiv({ cls: "tah-template-item" });

	const header = item.createDiv({ cls: "tah-template-item-header" });
	header.createSpan({ text: template.name, cls: "tah-template-item-name" });

	const actions = header.createDiv({ cls: "tah-template-item-actions" });
	const editBtn = actions.createEl("button", { text: t("template.edit") });
	editBtn.addClass("tah-remove-btn");
	const delBtn = actions.createEl("button", { text: t("template.delete") });
	delBtn.addClass("tah-remove-btn");

	// 内容预览
	const preview = item.createDiv({ cls: "tah-template-item-preview" });
	preview.setText(template.content);

	editBtn.addEventListener("click", () => editTemplate(template, ctx));
	delBtn.addEventListener("click", () => deleteTemplate(template.id, ctx));
}

function addTemplate(ctx: SettingsTabContext): void {
	const modal = new TemplateEditModal(
		ctx.app,
		ctx.plugin.t,
		{ name: NEW_TEMPLATE_NAME, content: "" },
		(name, content) => {
			void ctx.plugin.appSettings.addTemplate(name, content);
			ctx.refresh();
		}
	);
	modal.open();
}

function deleteTemplate(id: string, ctx: SettingsTabContext): void {
	void ctx.plugin.appSettings.removeTemplate(id);
	ctx.refresh();
}

function editTemplate(template: ReportTemplate, ctx: SettingsTabContext): void {
	const modal = new TemplateEditModal(
		ctx.app,
		ctx.plugin.t,
		template,
		(name, content) => {
			void ctx.plugin.appSettings.updateTemplate(template.id, name, content);
			ctx.refresh();
		}
	);
	modal.open();
}

/** 模板编辑弹窗 */
class TemplateEditModal extends Modal {
	private nameInput!: HTMLInputElement;
	private contentInput!: HTMLTextAreaElement;

	constructor(
		app: App,
		private t: Translator,
		private template: { name: string; content: string },
		private onSave: (name: string, content: string) => void | Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tah-modal");
		this.modalEl.addClass("tah-modal-root-narrow");
		this.setTitle(this.t("template.modalTitle"));

		contentEl.createEl("h4", { text: this.t("template.modalNameHeading") });
		this.nameInput = contentEl.createEl("input", { type: "text" });
		this.nameInput.addClass("tah-template-name-input");
		this.nameInput.value = this.template.name;
		this.nameInput.placeholder = this.t("template.modalNamePlaceholder");

		contentEl.createEl("h4", {
			text: this.t("template.modalContentHeading"),
			cls: "tah-template-content-title",
		});
		contentEl.createDiv({
			text: this.t("template.modalContentHint"),
			cls: "tah-picker-hint",
		});
		this.contentInput = contentEl.createEl("textarea");
		this.contentInput.addClass("tah-template-content-input");
		this.contentInput.value = this.template.content;
		this.contentInput.rows = 12;
		this.contentInput.placeholder = this.t("template.modalContentPlaceholder");

		const actions = contentEl.createDiv({ cls: "tah-preview-actions" });
		const saveBtn = actions.createEl("button", { text: this.t("template.save") });
		saveBtn.addClass("tah-generate-btn");
		saveBtn.addEventListener("click", () => this.save());

		const cancelBtn = actions.createEl("button", { text: this.t("template.cancel") });
		cancelBtn.addClass("tah-remove-btn");
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private save(): void {
		const name = this.nameInput.value.trim();
		if (!name) {
			new Notice(this.t("template.needName"));
			return;
		}
		void this.onSave(name, this.contentInput.value);
		this.close();
	}
}
