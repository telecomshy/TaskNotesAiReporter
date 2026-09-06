/**
 * TaskNotes AI Reporter 主插件入口。
 * 提供：设置页、左侧 Ribbon 按钮、命令面板命令，打开"生成报告"交互弹窗。
 */

import { Plugin } from "obsidian";
import { TaskNotesAIHelperSettingTab } from "./src/settings";
import { ReportModal } from "./src/ui/ReportModal";
import { normalizeSettings, type TaskNotesAIHelperSettings } from "./src/settings/logic";

export default class TaskNotesAIHelperPlugin extends Plugin {
	settings: TaskNotesAIHelperSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addSettingTab(new TaskNotesAIHelperSettingTab(this.app, this));

		// 左侧 Ribbon 快捷按钮（置底）
		const ribbonIcon = this.addRibbonIcon("sparkles", "生成任务报告", () => {
			this.openReportModal();
		});
		ribbonIcon.addClass("tah-ribbon-bottom");

		// 命令面板命令
		this.addCommand({
			id: "generate-report",
			name: "生成任务报告",
			callback: () => {
				this.openReportModal();
			},
		});
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = normalizeSettings(data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	openReportModal(): void {
		new ReportModal(this.app, this).open();
	}
}
