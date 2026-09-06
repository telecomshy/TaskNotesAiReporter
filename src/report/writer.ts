/**
 * 报告写入 vault。使用 Obsidian vault API 创建 Markdown 笔记。
 */

import { normalizePath, type App } from "obsidian";
import type { DateRange, ReportType } from "../types";
import { buildDatedReportFilename } from "../core/filename";
import { REPORT_TYPE_LABEL } from "../core/reportType";

/** 生成报告正文的 YAML frontmatter 头部 */
export function buildReportFrontmatter(type: ReportType, range: DateRange): string {
	const now = new Date().toISOString();
	return [
		"---",
		`title: "${REPORT_TYPE_LABEL[type]} ${range.start} ~ ${range.end}"`,
		`type: ${type}`,
		`start: "${range.start}"`,
		`end: "${range.end}"`,
		`generatedAt: "${now}"`,
		`generator: tasknotes-aireporter`,
		"---",
		"",
	].join("\n");
}

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
	const now = new Date();
	const baseName = buildDatedReportFilename(templateName ?? "", now);
	const folderPath = normalizePath(folder || "");

	if (folderPath && !(await app.vault.adapter.exists(folderPath))) {
		await app.vault.createFolder(folderPath);
	}

	let filename = `${baseName}.md`;
	let filePath = folderPath ? `${folderPath}/${filename}` : filename;
	filePath = normalizePath(filePath);

	// 避免覆盖历史：同名已存在时加时间戳后缀（精确到秒）
	if (await app.vault.adapter.exists(filePath)) {
		const ts = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.slice(0, 19);
		filename = `${baseName}-${ts}.md`;
		filePath = folderPath ? `${folderPath}/${filename}` : filename;
		filePath = normalizePath(filePath);
	}

	const finalContent = `${buildReportFrontmatter(type, range)}\n${content}`;
	await app.vault.create(filePath, finalContent);
	return filePath;
}
