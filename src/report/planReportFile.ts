/**
 * 报告文件计划：拥有「写哪个文件、写什么」的全部决定——规范化目录、生成带时间戳
 * 的文件名、同名冲突追加一次后缀、拼 frontmatter 与正文。
 *
 * 纯逻辑，不依赖 Obsidian：时刻、存在性探测与路径规范化都由调用方注入，
 * vault 适配器（writer.ts）退化为纯 I/O。对外文件名格式与行为保持不变。
 *
 * frontmatter 的 `title` 与文件名同源（都用 `reportName` 的「模板名 + 兜底」规则，见 #55）；
 * 恒定值的 `type` 键已删除（零信息，汇总请用 `generator`）。
 */

import type { DateRange } from "../types";
import { buildDatedReportFilename, reportName } from "../core/filename";

/** 报告计划的输入要素。 */
export interface ReportPlanInput {
	folder: string;
	templateName?: string;
	range: DateRange;
	body: string;
}

/** 报告计划的可注入依赖。 */
export interface ReportPlanDeps {
	/** 当前时刻：基准文件名、冲突后缀与 frontmatter 生成时间同源。 */
	now(): Date;
	/** 探测路径是否已存在。 */
	exists(path: string): Promise<boolean>;
	/** 规范化 vault 路径（生产用 Obsidian 实现，测试用平凡实现）。 */
	normalizePath(path: string): string;
}

/** 写报告所需的完整计划。 */
export interface ReportPlan {
	/** 最终文件路径。 */
	path: string;
	/** frontmatter 加正文的完整内容。 */
	content: string;
	/** 需要创建的目录；null 表示无需创建。 */
	folderToCreate: string | null;
}

/**
 * 计算写报告的文件计划：
 * - 目录缺失时报出待创建的规范化目录；
 * - 文件名格式：模板名称YYYYMMDDHHMM；
 * - 同名已存在时追加一次时间戳后缀（不重复探测），避免覆盖历史。
 */
export async function planReportFile(
	input: ReportPlanInput,
	deps: ReportPlanDeps
): Promise<ReportPlan> {
	const now = deps.now();
	const folderPath = deps.normalizePath(input.folder || "");
	const folderToCreate =
		folderPath !== "" && !(await deps.exists(folderPath)) ? folderPath : null;

	const baseName = buildDatedReportFilename(input.templateName ?? "", now);
	const path = await resolvePath(baseName, folderPath, now, deps);
	const content = `${buildReportFrontmatter(input.templateName, input.range, now)}\n${input.body}`;

	return { path, content, folderToCreate };
}

/**
 * 把一段文本安全地放进**双引号 YAML 标量**：转义反斜杠与引号、把换行压成空格。
 * 标题承载用户可编辑的模板名，不转义会让引号截断标量、破坏整个 frontmatter。
 */
function escapeYamlScalar(value: string): string {
	return value.replace(/"/g, '\\"').replace(/\n+/g, " ");
}

/** 拼 frontmatter 头部（含结尾空行）。 */
function buildReportFrontmatter(
	templateName: string | undefined,
	range: DateRange,
	now: Date
): string {
	return [
		"---",
		`title: "${escapeYamlScalar(reportName(templateName))} ${range.start} ~ ${range.end}"`,
		`start: "${range.start}"`,
		`end: "${range.end}"`,
		`generatedAt: "${now.toISOString()}"`,
		`generator: tasknotes-aireporter`,
		"---",
		"",
	].join("\n");
}

/** 基准路径未占用则用之；已占用则追加一次时间戳后缀，不再探测。 */
async function resolvePath(
	baseName: string,
	folderPath: string,
	now: Date,
	deps: ReportPlanDeps
): Promise<string> {
	const basePath = deps.normalizePath(joinPath(folderPath, `${baseName}.md`));
	if (!(await deps.exists(basePath))) return basePath;

	const suffix = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return deps.normalizePath(joinPath(folderPath, `${baseName}-${suffix}.md`));
}

function joinPath(folder: string, filename: string): string {
	return folder ? `${folder}/${filename}` : filename;
}
