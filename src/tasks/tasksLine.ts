/**
 * Obsidian Tasks 清单行 → 插件统一任务模型的纯函数映射。
 *
 * 无 Obsidian 依赖，可在 Node 单测。行格式与字段符号见
 * docs/research/obsidian-tasks-plugin-support.md（上游版本固定 8.4.0）。
 * 首版只内置默认状态符号映射；读 Tasks data.json 的自定义状态留作后续增强。
 */

import type { DateField, StatusDefinition, TaskInfo } from "../types";

/** 一条待解析的 Tasks 行：所属笔记路径、0 基行号、原始行文本。 */
export interface RawTaskLine {
	path: string;
	line: number;
	text: string;
}

interface StatusInfo {
	value: string;
	isCompleted: boolean;
	type: string;
}

const TODO: StatusInfo = { value: "Todo", isCompleted: false, type: "TODO" };
const DONE: StatusInfo = { value: "Done", isCompleted: true, type: "DONE" };
const IN_PROGRESS: StatusInfo = { value: "In Progress", isCompleted: false, type: "IN_PROGRESS" };
const CANCELLED: StatusInfo = { value: "Cancelled", isCompleted: true, type: "CANCELLED" };

/**
 * 内置复选框符号 → 状态。`isCompleted` 取 Tasks 的 isDone 口径
 * （DONE ∪ CANCELLED ∪ NON_TASK 皆视为已结束），未知符号按 TODO 兜底。
 */
const STATUS_BY_SYMBOL: Record<string, StatusInfo> = {
	" ": TODO,
	x: DONE,
	X: DONE,
	"/": IN_PROGRESS,
	"-": CANCELLED,
};

/** 内置状态目录（含 type）：供「进行中」等来源无关判定使用。 */
export const TASKS_STATUS_DEFINITIONS: StatusDefinition[] = [
	{ value: TODO.value, isCompleted: TODO.isCompleted, type: TODO.type },
	{ value: DONE.value, isCompleted: DONE.isCompleted, type: DONE.type },
	{ value: IN_PROGRESS.value, isCompleted: IN_PROGRESS.isCompleted, type: IN_PROGRESS.type },
	{ value: CANCELLED.value, isCompleted: CANCELLED.isCompleted, type: CANCELLED.type },
];

/** 优先级箭号（高→低）；缺省 Normal。 */
const PRIORITIES: ReadonlyArray<readonly [string, string]> = [
	["🔺", "Highest"],
	["⏫", "High"],
	["🔼", "Medium"],
	["🔽", "Low"],
	["⏬", "Lowest"],
];

/** 日期字段 emoji → 统一模型字段。 */
const DATE_FIELDS: ReadonlyArray<readonly [string, DateField]> = [
	["➕", "dateCreated"],
	["⏳", "scheduled"],
	["📅", "due"],
	["✅", "completedDate"],
];

/** 复选框行：允许前导缩进，标记为无序（`-` / `*` / `+`）或有序（`1.` / `1)`，对齐 metadataCache 的清单行。 */
const CHECKBOX_RE = /^\s*(?:[-*+]|\d+[.)])\s*\[(.)\]\s?(.*)$/;

/**
 * 解析一条 Tasks 行，生成统一任务模型。
 *
 * - `title`：去字段（状态 / 优先级 / 映射的日期）与去标签后的描述；
 * - `tags`：行内 `#tag`，去 `#` 前缀存储；
 * - `status`：复选框符号 → 可读名（Todo / Done / In Progress / Cancelled）；
 * - `priority`：箭号 → Highest…Lowest，缺省 Normal；
 * - 日期：`✅`→completedDate、`📅`→due、`⏳`→scheduled、`➕`→dateCreated（`YYYY-MM-DD`）；
 * - `path`：`笔记路径#行号`（0 基），承载全库唯一性；
 * - `archived` 恒 false，`contexts` / `projects` 为空数组。
 *
 * 未结构化字段（`🛫 ❌ 🔁 🆔 ⛔` 等）不提升为结构化字段，保留在描述文本里。
 */
export function parseTaskLine(raw: RawTaskLine): TaskInfo {
	const match = raw.text.match(CHECKBOX_RE);
	const symbol = match ? match[1] : " ";
	const status = STATUS_BY_SYMBOL[symbol] ?? TODO;
	let text = match ? match[2] : raw.text.trim();

	// 标签：行内 #tag（去 # 前缀存储），并从描述文本中剥掉。
	const tags: string[] = [];
	text = text.replace(/(?:^|\s)#([^\s#]+)/g, (_match, tag: string) => {
		tags.push(tag);
		return " ";
	});

	// 优先级：按高→低顺序取首个命中者，并移除其符号。
	let priority = "Normal";
	for (const [emoji, name] of PRIORITIES) {
		if (text.includes(emoji)) {
			if (priority === "Normal") priority = name;
			text = text.split(emoji).join(" ");
		}
	}

	// 日期：抽取并格式化（Tasks 本就写 YYYY-MM-DD），同时从描述文本中剥掉。
	const dates: Partial<Record<DateField, string>> = {};
	for (const [emoji, field] of DATE_FIELDS) {
		const re = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})?`, "g");
		text = text.replace(re, (_match, value: string | undefined) => {
			if (value) dates[field] = value;
			return " ";
		});
	}

	return {
		title: text.replace(/\s+/g, " ").trim(),
		status: status.value,
		priority,
		...dates,
		id: `${raw.path}#${raw.line}`,
		archived: false,
		tags,
		contexts: [],
		projects: [],
	};
}
