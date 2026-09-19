/**
 * 报告写入 vault：把「报告文件计划」落到磁盘。
 * 本模块只做 I/O——提供存在性探测、执行按计划建目录与写文件——不含任何写入决定
 * （决定见 planReportFile）。
 */

import { normalizePath, type App } from "obsidian";
import type { DateRange, ReportType } from "../types";
import { planReportFile } from "./planReportFile";

/**
 * 将报告内容写入 vault，返回最终文件路径。
 * - 自动创建输出文件夹。
 * - 文件名格式：模板名称YYYYMMDDHHMM。
 * - 若同一分钟已存在同名文件（避免覆盖历史），追加时间戳后缀。
 */
export async function saveReport(
	app: App,
	folder: string,
	type: ReportType,
	range: DateRange,
	content: string,
	templateName?: string
): Promise<string> {
	const plan = await planReportFile(
		{ folder, templateName, type, range, body: content },
		{
			now: () => new Date(),
			exists: (path) => app.vault.adapter.exists(path),
			normalizePath,
		}
	);

	if (plan.folderToCreate) {
		await app.vault.createFolder(plan.folderToCreate);
	}
	await app.vault.create(plan.path, plan.content);
	return plan.path;
}
