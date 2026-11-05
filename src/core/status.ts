/**
 * 「状态归类」四档（待办 / 进行中 / 已结束 / 未知）与来源的判定规则（见 #47 / ADR-0015）。
 * 纯函数，无 Obsidian 依赖，可单元测试。
 *
 * 来源词汇不出缝：TaskNotes 的 isCompleted 与状态值名只在本文件的纯映射函数里陈述一次；缝外只见四档。
 */

import type { StatusClass, StatusDefinition, TaskInfo } from "../types";

/**
 * 任务子集口径（四档 → 三子集，见 #47 修订一）。
 */
export type TaskSubset = "completed" | "in-progress" | "open";

/**
 * 「状态筛选」的三档 chip 口径（#75 / ADR-0021）：状态归类的投影，不含「未知」——
 * 未知不设档，只在全不选时出现。
 */
export type StatusFilterClass = Exclude<StatusClass, "unknown">;

/**
 * TaskNotes 规则（ADR-0015 的值名限制如实保留）：
 * `isCompleted` → 已结束；值名 `in-progress` → 进行中；其余未完成 → 待办。
 * TaskNotes 侧不产生「未知」。
 */
export function taskNotesStatusClass(value: string, isCompleted: boolean | undefined): StatusClass {
	if (isCompleted === true) return "completed";
	return value.trim().toLowerCase() === "in-progress" ? "in-progress" : "todo";
}

/**
 * 任务状态的归类：查状态目录；目录里没有的值（认不出的状态）→ 未知。
 * 第四档的牙在这里：认不出的状态永远不会被谎报成已完成或进行中。
 */
export function statusClassOf(status: string, statuses: readonly StatusDefinition[]): StatusClass {
	return statuses.find((definition) => definition.value === status)?.statusClass ?? "unknown";
}

/**
 * 按子集口径筛选任务（四档 → 三子集）：
 * - completed：已结束；
 * - in-progress：进行中；
 * - open：未完成（进行中 + 待办 + **未知**）。
 *
 * 不变式（测试钉住）：`count = completed + open` 且 `inProgress <= open`——
 * 未知归入未完成（`Task.isDone()` 不含它），但绝不进「进行中」或「已结束」。
 */
export function filterTasksBySubset(
	tasks: readonly TaskInfo[],
	subset: TaskSubset,
	statuses: readonly StatusDefinition[]
): TaskInfo[] {
	switch (subset) {
		case "completed":
			return tasks.filter((task) => statusClassOf(task.status, statuses) === "completed");
		case "in-progress":
			return tasks.filter((task) => statusClassOf(task.status, statuses) === "in-progress");
		default:
			return tasks.filter((task) => statusClassOf(task.status, statuses) !== "completed");
	}
}

/** 按状态归类筛选的投影：命中集合 + 被藏起的未知数（左栏一次问全）。 */
export interface StatusFilterProjection {
	/** 选中档内的任务，保持原顺序。 */
	matching: TaskInfo[];
	/** 被状态筛选藏起的「未知」任务数（「另有 N 条…未显示」提示条用）。 */
	unknownHidden: number;
}

/**
 * 「状态筛选」的按归类筛选（#75 / ADR-0021）：命中任一选中档即保留，档间为 OR；
 * 选中任一档时「未知」一律被排除，只计数供提示条使用——认不出的状态绝不谎报进任何档。
 * 全不选（classes 为空）的「不过滤」语义由调用方（选择会话）短路，这里陈述集合语义本身。
 */
export function filterTasksByStatusClasses(
	tasks: readonly TaskInfo[],
	classes: readonly StatusFilterClass[],
	statuses: readonly StatusDefinition[]
): StatusFilterProjection {
	const selected = new Set(classes);
	const matching: TaskInfo[] = [];
	let unknownHidden = 0;
	for (const task of tasks) {
		const statusClass = statusClassOf(task.status, statuses);
		if (statusClass === "unknown") unknownHidden++;
		else if (selected.has(statusClass)) matching.push(task);
	}
	return { matching, unknownHidden };
}
