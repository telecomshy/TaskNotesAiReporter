/**
 * 设置页「模板配置」Tab：报告模板的查看、添加、编辑、删除。
 * 本模块只导出 renderTemplateTab 入口，附带模板编辑弹窗。
 */

import { Modal, Notice, type App } from "obsidian";
import type { ReportTemplate } from "../types";
import { genId } from "./logic";
import type { SettingsTabContext } from "./index";

/** 渲染「模板配置」Tab */
export function renderTemplateTab(container: HTMLElement, ctx: SettingsTabContext): void {
	container.createEl("h3", { text: "报告模板" });
	container.createEl("p", {
		text: "自定义报告模板，每个模板包含标题与内容。内容支持占位符 {{tasks}}（任务列表）与 {{range}}（时间范围）。不选择模板时，仅提供任务列表给模型自由生成。",
		cls: "setting-item-description",
	});

	// 添加模板按钮
	const addRow = container.createDiv({ cls: "tah-template-add-row" });
	const addBtn = addRow.createEl("button", { text: "+ 添加模板" });
	addBtn.addClass("tah-add-btn");
	addBtn.addEventListener("click", () => addTemplate(ctx));

	// 模板列表
	const list = container.createDiv({ cls: "tah-template-list" });
	const templates = ctx.plugin.settings.templates;
	if (templates.length === 0) {
		list.createDiv({ text: "暂无模板，点击「添加模板」创建。", cls: "tah-empty" });
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

	editBtn.addEventListener("click", () => editTemplate(template, ctx));
	delBtn.addEventListener("click", () => deleteTemplate(template.id, ctx));
}

function addTemplate(ctx: SettingsTabContext): void {
	const modal = new TemplateEditModal(
		ctx.app,
		{ name: "新模板", content: "" },
		async (name, content) => {
			const template: ReportTemplate = { id: genId(), name, content };
			ctx.plugin.settings.templates.push(template);
			await ctx.plugin.saveSettings();
			ctx.refresh();
		}
	);
	modal.open();
}

function deleteTemplate(id: string, ctx: SettingsTabContext): void {
	ctx.plugin.settings.templates = ctx.plugin.settings.templates.filter((t) => t.id !== id);
	void ctx.plugin.saveSettings();
	ctx.refresh();
}

function editTemplate(template: ReportTemplate, ctx: SettingsTabContext): void {
	const modal = new TemplateEditModal(
		ctx.app,
		template,
		async (name, content) => {
			template.name = name;
			template.content = content;
			await ctx.plugin.saveSettings();
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
