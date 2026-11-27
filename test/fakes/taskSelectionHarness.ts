/**
 * 「选择任务」视图的测试脚手架（#115）：真实 TaskSelectionView + FakeEl 假 DOM。
 * 只搭环境、不替测试写断言；交互由用例经 FakeEl 记录的事件驱动。
 *
 * 时钟（mock.timers）由用例自己钉，本 harness 不接时钟参数——快捷周期在视图构造时
 * 就按真实 `Date` 现算，晚于构造再钉就晚了。
 */

import { BUNDLES, createTranslator, type Translator } from "../../src/i18n";
import { TaskSelectionView } from "../../src/ui/TaskSelectionView";
import type { DateField, StatusDefinition, TaskInfo } from "../../src/types";
import { FakeEl } from "./dom";

export interface TaskSelectionHarnessOptions {
	tasks: TaskInfo[];
	/** 参与区间筛选的日期口径；必填——让用例自己声明口径，不替产品默认值做主。 */
	dateFields: readonly DateField[];
	/** 状态目录；缺省四档齐备（chip 可用）。传空数组＝目录缺失（chip 禁用）。 */
	statuses?: readonly StatusDefinition[];
	weekStartsOnMonday?: boolean;
}

export interface TaskSelectionHarness {
	root: FakeEl;
	view: TaskSelectionView;
	t: Translator;
	/** 右栏当前集合（生成报告读取的同一来源）。 */
	joinedIds: () => string[];
}

const DEFAULT_STATUSES: StatusDefinition[] = [
	{ value: "open", statusClass: "todo" },
	{ value: "in-progress", statusClass: "in-progress" },
	{ value: "done", statusClass: "completed" },
	{ value: "cancelled", statusClass: "cancelled" },
];

/** 用真实视图渲染一次「选择任务」区，返回根元素、视图与便捷读法。 */
export function renderTaskSelectionHarness(
	options: TaskSelectionHarnessOptions
): TaskSelectionHarness {
	const root = new FakeEl("div");
	const t = createTranslator(BUNDLES.zh);
	const view = new TaskSelectionView({
		container: root as unknown as HTMLElement,
		dateFields: options.dateFields,
		statuses: options.statuses ?? DEFAULT_STATUSES,
		weekStartsOnMonday: options.weekStartsOnMonday ?? true,
		t,
		lang: "zh",
	});
	view.setTasks(options.tasks);

	return {
		root,
		view,
		t,
		joinedIds: () => view.getJoinedTasks().map((task) => task.id),
	};
}
