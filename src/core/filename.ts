/**
 * 报告命名：报告名的兜底规则与文件名生成。纯函数，无 Obsidian 依赖。
 *
 * `reportName` 同时供**文件名**与 **frontmatter 标题**使用（两者同源，见 #55），
 * 故本模块不只管文件名格式。
 */

/**
 * 报告名：模板名去首尾空白，空则用「报告」兜底。
 * 文件名与 frontmatter 标题同源使用它（见 #55）。
 */
export function reportName(templateName: string | undefined): string {
	return (templateName || "").trim() || "报告";
}

/**
 * 生成带时间戳的报告文件名（不含扩展名），格式：模板名称YYYYMMDDHHMM。
 * - 模板名称为空时用「报告」兜底（规则见 `reportName`）。
 * - date 缺省用当前本地时间。
 * 例如：周报2026090416
 */
export function buildDatedReportFilename(templateName: string, date: Date = new Date()): string {
	const prefix = reportName(templateName);
	const pad = (n: number) => String(n).padStart(2, "0");
	const stamp = [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		pad(date.getHours()),
		pad(date.getMinutes()),
	].join("");
	return `${prefix}${stamp}`;
}
