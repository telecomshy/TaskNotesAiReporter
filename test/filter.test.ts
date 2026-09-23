import { test } from "node:test";
import assert from "node:assert/strict";
import {
	normalizeDateValue,
	filterTasksByDateRange,
	parseTitleQuery,
	filterTasksByTitleQuery,
	isTitleQueryEmpty,
	stripContextTokens,
} from "../src/core/filter";
import type { DateField, TaskInfo } from "../src/types";

function makeTask(overrides: Partial<TaskInfo> & { id: string; title: string }): TaskInfo {
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
		makeTask({ id: "a", title: "A", completedDate: "2026-09-01" }),
		makeTask({ id: "b", title: "B", completedDate: "2026-09-10" }),
		makeTask({ id: "c", title: "C", due: "2026-09-02" }),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.deepEqual(
		result.map((t) => t.id).sort(),
		["a", "c"]
	);
});

test("filterTasksByDateRange 排除已归档任务", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({ id: "a", title: "A", completedDate: "2026-09-01" }),
		makeTask({ id: "b", title: "B", completedDate: "2026-09-02", archived: true }),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.deepEqual(result.map((t) => t.id), ["a"]);
});

test("filterTasksByDateRange 多字段命中去重", () => {
	const range = { start: "2026-08-31", end: "2026-09-06" };
	const tasks = [
		makeTask({
			id: "a",
			title: "A",
			completedDate: "2026-09-01",
			due: "2026-09-03",
		}),
	];
	const result = filterTasksByDateRange(tasks, range, dateFields);
	assert.equal(result.length, 1);
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
		makeTask({ id: "a", title: "修复登录 Bug" }),
		makeTask({ id: "b", title: "编写文档" }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: ["bug"], tags: [], contexts: [] });
	assert.deepEqual(result.map((t) => t.id), ["a"]);

	// 同一维度内多个关键字为 OR：命中任一即可
	const result2 = filterTasksByTitleQuery(tasks, {
		keywords: ["修复", "文档"],
		tags: [],
		contexts: [],
	});
	assert.deepEqual(result2.map((t) => t.id).sort(), ["a", "b"]);
});

test("isTitleQueryEmpty 判断三个维度是否全空", () => {
	assert.equal(isTitleQueryEmpty({ keywords: [], tags: [], contexts: [] }), true);
	assert.equal(isTitleQueryEmpty({ keywords: ["a"], tags: [], contexts: [] }), false);
	assert.equal(isTitleQueryEmpty({ keywords: [], tags: ["a"], contexts: [] }), false);
	assert.equal(isTitleQueryEmpty({ keywords: [], tags: [], contexts: ["a"] }), false);
});

test("filterTasksByTitleQuery 标签命中（OR）并排除归档", () => {
	const tasks = [
		makeTask({ id: "a", title: "A", tags: ["前端"] }),
		makeTask({ id: "b", title: "B", tags: ["后端"] }),
		makeTask({ id: "c", title: "C", tags: ["前端"], archived: true }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: ["前端"], contexts: [] });
	assert.deepEqual(result.map((t) => t.id), ["a"]);
});

test("filterTasksByTitleQuery 标签层级前缀匹配", () => {
	const tasks = [
		makeTask({ id: "a", title: "A", tags: ["work"] }),
		makeTask({ id: "b", title: "B", tags: ["work/report"] }),
		makeTask({ id: "c", title: "C", tags: ["work/design"] }),
		makeTask({ id: "d", title: "D", tags: ["home"] }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: ["work"], contexts: [] });
	assert.deepEqual(result.map((t) => t.id).sort(), ["a", "b", "c"]);
	// 精确标签 work 不匹配 work/report 子级以外
	const result2 = filterTasksByTitleQuery(tasks, { keywords: [], tags: ["home"], contexts: [] });
	assert.deepEqual(result2.map((t) => t.id), ["d"]);
});

test("filterTasksByTitleQuery 上下文命中（OR，精确匹配）", () => {
	const tasks = [
		makeTask({ id: "a", title: "A", contexts: ["工作"] }),
		makeTask({ id: "b", title: "B", contexts: ["家庭"] }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: [], contexts: ["家庭"] });
	assert.deepEqual(result.map((t) => t.id), ["b"]);
});

test("filterTasksByTitleQuery 三条件 AND 组合", () => {
	const tasks = [
		// 关键字不匹配
		makeTask({ id: "a", title: "需求 A", tags: ["前端"], contexts: ["工作"] }),
		// 标签不匹配
		makeTask({ id: "b", title: "需要 A", tags: ["后端"], contexts: ["工作"] }),
		// 上下文不匹配
		makeTask({ id: "c", title: "需要 A", tags: ["前端"], contexts: ["家庭"] }),
		// 全部命中
		makeTask({ id: "d", title: "需要 A", tags: ["前端"], contexts: ["工作"] }),
	];
	const result = filterTasksByTitleQuery(tasks, {
		keywords: ["需要"],
		tags: ["前端"],
		contexts: ["工作"],
	});
	assert.deepEqual(result.map((t) => t.id), ["d"]);
});

test("filterTasksByTitleQuery 空查询返回全部非归档任务", () => {
	const tasks = [
		makeTask({ id: "a", title: "A" }),
		makeTask({ id: "b", title: "B", archived: true }),
	];
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: [], contexts: [] });
	assert.deepEqual(result.map((t) => t.id), ["a"]);
});

test("filterTasksByTitleQuery 上下文为精确匹配，不做子串匹配", () => {
	const tasks = [
		makeTask({ id: "a", title: "A", contexts: ["office"] }),
		makeTask({ id: "b", title: "B", contexts: ["workplace"] }),
	];
	// @office 只匹配精确等于 office 的上下文，不匹配 workplace 的子串 office
	const result = filterTasksByTitleQuery(tasks, { keywords: [], tags: [], contexts: ["office"] });
	assert.deepEqual(result.map((t) => t.id), ["a"]);
});

test("stripContextTokens 去掉 @上下文 token，保留关键字与 #标签", () => {
	// 空白结构原样保留（见 #45），因此按令牌断言，不锁死具体空格数。
	const tokens = (input: string) => stripContextTokens(input).split(/\s+/).filter(Boolean);
	assert.deepEqual(tokens("报告 @工作 #前端"), ["报告", "#前端"]);
	assert.deepEqual(tokens("@a @b"), []);
	assert.deepEqual(tokens("  报告   @x  标签  "), ["报告", "标签"]);
	assert.equal(stripContextTokens(""), "");
});

test("Tasks 来源先去除 @上下文再解析：不再产生上下文条件（UI 层禁用，不改 parseTitleQuery）", () => {
	const parsed = parseTitleQuery(stripContextTokens("周报 @工作 #前端"));
	assert.deepEqual(parsed, { keywords: ["周报"], tags: ["前端"], contexts: [] });
});
