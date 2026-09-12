/**
 * 报告文件名生成。纯函数，无 Obsidian 依赖。
 */

/**
 * 生成带时间戳的报告文件名（不含扩展名），格式：模板名称YYYYMMDDHHMM。
 * - 模板名称为空时用「报告」兜底。
 * - date 缺省用当前本地时间。
 * 例如：周报2026090416
 */
export function buildDatedReportFilename(templateName: string, date: Date = new Date()): string {
	const prefix = (templateName || "").trim() || "报告";
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
