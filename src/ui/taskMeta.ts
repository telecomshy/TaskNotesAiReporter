/**
 * 任务条目的元信息渲染：状态 / 优先级 / 完成 / 到期，以及标签(#)与上下文(@)。
 * 标签与上下文每类最多显示 MAX_TOKENS 个，超出显示 "+N"，鼠标悬停显示全部。
 * 供「选择任务」窗口与主窗口已选任务列表复用。
 */

import type { TaskInfo } from "../types";

/** 标签 / 上下文每类最多展示的个数 */
export const MAX_TOKENS = 3;

export interface TokenSummary {
	/** 前 max 个（含前缀）拼接后的显示文本 */
	shown: string;
	/** 被折叠的数量 */
	rest: number;
	/** 全部（含前缀）拼接后的完整文本，用于悬浮提示 */
	full: string;
}

/**
 * 把一组值（标签或上下文）汇总为「前 N 个 + 折叠数量 + 完整文本」。
 * 空数组返回 null。纯函数，可单元测试。
 */
export function summarizeTokens(
	values: string[] | undefined,
	max: number,
	prefix: string
): TokenSummary | null {
	if (!values || values.length === 0) return null;
	const labels = values.map((value) => `${prefix}${value}`);
	const shown = labels.slice(0, max).join(" ");
	return {
		shown,
		rest: Math.max(0, labels.length - max),
		full: labels.join(" "),
	};
}

/** 渲染任务条目的元信息行。 */
export function renderTaskMeta(container: HTMLElement, task: TaskInfo): void {
	const meta = container.createDiv({ cls: "tah-task-meta" });

	const metaText: string[] = [];
	if (task.status) metaText.push(`状态:${task.status}`);
	if (task.priority) metaText.push(`优先级:${task.priority}`);
	if (task.completedDate) metaText.push(`完成:${task.completedDate}`);
	if (task.due) metaText.push(`到期:${task.due}`);
	if (metaText.length > 0) {
		meta.createSpan({ cls: "tah-task-meta-text", text: metaText.join(" · ") });
	}

	appendTokenGroup(meta, task.tags, "#");
	appendTokenGroup(meta, task.contexts, "@");
}

function appendTokenGroup(meta: HTMLElement, values: string[] | undefined, prefix: string): void {
	const summary = summarizeTokens(values, MAX_TOKENS, prefix);
	if (!summary) return;
	const group = meta.createSpan({ cls: "tah-task-token-group" });
	group.createSpan({ text: summary.shown });
	if (summary.rest > 0) {
		group.createSpan({ cls: "tah-task-token-more", text: ` +${summary.rest}` });
	}
	group.setAttribute("title", summary.full);
}
