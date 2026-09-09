import { test } from "node:test";
import assert from "node:assert/strict";
import {
	normalizeDateValue,
	filterTasksByDateRange,
	filterTasksWithoutDate,
	hasNoDate,
	parseTitleQuery,
	filterTasksByTitleQuery,
} from "../src/core/filter";
import type { DateField, TaskInfo } from "../src/types";

function makeTask(overrides: Partial<TaskInfo> & { path: string; title: string }): TaskInfo {
	return {
		status: "open",
		priority: "normal",
		archived: false,
		...overrides,
	};
}

const dateFields: DateField[] = ["completedDate", "due", "scheduled"];

test("normalizeDateValue 提取 YYYY-MM-DD", () => {
	assert.equal(normalizeDateValue("2026-09-03"), "2026-09-03");
	assert.equal(normalizeDateValue("2026-09-03T10:30:00Z"), "2026-09-03");
	assert.equal(normalizeDateValue(undefined), null);
	assert.equal(normalizeDateValue(""), null);
});

test("filterTasksByDateRange 按完成日期筛选", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({ path: "a", title: "A", completedDate: "2026-09-01" }),
		makeTask({ path: "b", title: "B", completedDate: "2026-09-10" }),
		makeTask({ path: "c", title: "C", due: "2026-09-02" }),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.deepEqual(
		result.map((t) => t.path).sort(),
		["a", "c"]
	);
});

test("filterTasksByDateRange 排除已归档任务", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({ path: "a", title: "A", completedDate: "2026-09-01" }),
		makeTask({ path: "b", title: "B", completedDate: "2026-09-02", archived: true }),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.deepEqual(result.map((t) => t.path), ["a"]);
});

test("filterTasksByDateRange 多字段命中去重", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({
			path: "a",
			title: "A",
			completedDate: "2026-09-01",
			due: "2026-09-03",
		}),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.equal(result.length, 1);
});

test("filterTasksWithoutDate 识别无日期任务", () => {
	const tasks = [
		makeTask({ path: "a", title: "A" }), // 无任何日期
		makeTask({ path: "b", title: "B", completedDate: "2026-09-01" }),
	];
	const result = filterTasksWithoutDate(tasks, dateFields);
	assert.deepEqual(result.map((t) => t.path), ["a"]);
});

test("hasNoDate 判断正确", () => {
	assert.equal(hasNoDate(makeTask({ path: "a", title: "A" }), dateFields), true);
	assert.equal(
		hasNoDate(makeTask({ path: "b", title: "B", due: "2026-09-01" }), dateFields),
		false
	);
});

test("parseTitleQuery 拆分关键字/标签/上下文", () => {
	assert.deepEqual(parseTitleQuery("需求 #前端 @工作"), {
		keywords: ["需求"],
		tags: ["前端"],
		contexts: ["工作"],
	});
});

test("parseTitleQuery 多个同类条件归组", () => {
	const q = parseTitleQuery("报告 #前端 #后端 @工作 @家庭");
	assert.deepEqual(q.keywords, ["报告"]);
	assert.deepEqual(q.tags, ["前端", "后端"]);
	assert.deepEqual(q.contexts, ["工作", "家庭"]);
});

test("parseTitleQuery 大小写归一化且忽略多余空白", () => {
	const q = parseTitleQuery("  Bug   #Work   @Home  ");
	assert.deepEqual(q, { keywords: ["bug"], tags: ["work"], contexts: ["home"] });
});

test("parseTitleQuery 空输入返回三空数组", () => {
	assert.deepEqual(parseTitleQuery(""), { keywords: [], tags: [], contexts: [] });
	assert.deepEqual(parseTitleQuery("   "), { keywords: [], tags: [], contexts: [] });
});

test("filterTasksByTitleQuery 仅关键字匹配标题（兼容原行为）", () => {
	const tasks = [
		makeTask({ path: "a", title: "修复登录 Bug" }),
		makeTask({ path: "b", title: "编写文档" }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: ["bug"], tags: [], contexts: [] });
	assert.deepEqual(result.map((t) => t.path), ["a"]);

	// 多个关键字之间为 AND
	const result2 = filterTasksByTitleQuery(tasks, {
		keywords: ["修复", "登录"],
		tags: [],
		contexts: [],
	});
	assert.deepEqual(result2.map((t) => t.path), ["a"]);
});

test("filterTasksByTitleQuery 标签命中（OR）并排除归档", () => {
	const tasks = [
		makeTask({ path: "a", title: "A", tags: ["前端"] }),
		makeTask({ path: "b", title: "B", tags: ["后端"] }),
		makeTask({ path: "c", title: "C", tags: ["前端"], archived: true }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: ["前端"], contexts: [] });
	assert.deepEqual(result.map((t) => t.path), ["a"]);
});

test("filterTasksByTitleQuery 标签层级前缀匹配", () => {
	const tasks = [
		makeTask({ path: "a", title: "A", tags: ["work"] }),
		makeTask({ path: "b", title: "B", tags: ["work/report"] }),
		makeTask({ path: "c", title: "C", tags: ["work/design"] }),
		makeTask({ path: "d", title: "D", tags: ["home"] }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: ["work"], contexts: [] });
	assert.deepEqual(result.map((t) => t.path).sort(), ["a", "b", "c"]);
	// 精确标签 work 不匹配 work/report 子级以外
	const result2 = filterTasksByTitleQuery(tasks, { keywords: [], tags: ["home"], contexts: [] });
	assert.deepEqual(result2.map((t) => t.path), ["d"]);
});

test("filterTasksByTitleQuery 上下文命中（OR，精确匹配）", () => {
	const tasks = [
		makeTask({ path: "a", title: "A", contexts: ["工作"] }),
		makeTask({ path: "b", title: "B", contexts: ["家庭"] }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: [], contexts: ["家庭"] });
	assert.deepEqual(result.map((t) => t.path), ["b"]);
});

test("filterTasksByTitleQuery 三条件 AND 组合", () => {
	const tasks = [
		// 关键字不匹配
		makeTask({ path: "a", title: "需求 A", tags: ["前端"], contexts: ["工作"] }),
		// 标签不匹配
		makeTask({ path: "b", title: "需要 A", tags: ["后端"], contexts: ["工作"] }),
		// 上下文不匹配
		makeTask({ path: "c", title: "需要 A", tags: ["前端"], contexts: ["家庭"] }),
		// 全部命中
		makeTask({ path: "d", title: "需要 A", tags: ["前端"], contexts: ["工作"] }),
	];
	const result = filterTasksByTitleQuery(tasks, {
		keywords: ["需要"],
		tags: ["前端"],
		contexts: ["工作"],
	});
	assert.deepEqual(result.map((t) => t.path), ["d"]);
});

test("filterTasksByTitleQuery 空查询返回全部非归档任务", () => {
	const tasks = [
		makeTask({ path: "a", title: "A" }),
		makeTask({ path: "b", title: "B", archived: true }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: [], contexts: [] });
	assert.deepEqual(result.map((t) => t.path), ["a"]);
});
