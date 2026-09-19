import { test } from "node:test";
import assert from "node:assert/strict";
import {
	planReportFile,
	type ReportPlanDeps,
	type ReportPlanInput,
} from "../src/report/planReportFile";
import type { DateRange } from "../src/types";

const range: DateRange = { start: "2026-08-31", end: "2026-09-06" };

function baseInput(over: Partial<ReportPlanInput> = {}): ReportPlanInput {
	return {
		folder: "TaskNotes/Reports",
		templateName: "周报",
		type: "week",
		range,
		body: "报告正文",
		...over,
	};
}

/** 内存版依赖：记录探测过的路径与取时刻次数，时钟固定为 2026-09-04 16:05:30。 */
function harness(existing: string[] = [], over: Partial<ReportPlanDeps> = {}) {
	const clock = new Date(2026, 8, 4, 16, 5, 30);
	const probes: string[] = [];
	let nowCalls = 0;
	const deps: ReportPlanDeps = {
		now: () => {
			nowCalls += 1;
			return clock;
		},
		exists: async (path) => {
			probes.push(path);
			return existing.includes(path);
		},
		normalizePath: (path) => path,
		...over,
	};
	return { deps, probes, clock, nowCalls: () => nowCalls };
}

// 后缀格式在测试内独立推导，不复用被测模块的实现。
const stampOf = (date: Date) => date.toISOString().replace(/[:.]/g, "-").slice(0, 19);

test("目录缺失：报出待创建目录，路径与内容成型", async () => {
	const { deps } = harness([]);
	const plan = await planReportFile(baseInput(), deps);
	assert.equal(plan.folderToCreate, "TaskNotes/Reports");
	assert.equal(plan.path, "TaskNotes/Reports/周报202609041605.md");
	assert.ok(plan.content.startsWith("---\n"));
	assert.ok(plan.content.endsWith("---\n\n报告正文"));
});

test("目录已存在：无待创建目录", async () => {
	const { deps } = harness(["TaskNotes/Reports"]);
	const plan = await planReportFile(baseInput(), deps);
	assert.equal(plan.folderToCreate, null);
});

test("空目录：路径无前缀且无待创建目录", async () => {
	const { deps } = harness([]);
	const plan = await planReportFile(baseInput({ folder: "" }), deps);
	assert.equal(plan.folderToCreate, null);
	assert.equal(plan.path, "周报202609041605.md");
});

test("无模板名：文件名用「报告」兜底", async () => {
	const { deps } = harness([]);
	const plan = await planReportFile(baseInput({ templateName: undefined }), deps);
	assert.equal(plan.path, "TaskNotes/Reports/报告202609041605.md");
});

test("同名冲突：追加一次注入时刻的后缀，且不再重新探测", async () => {
	const { deps, probes, clock } = harness([
		"TaskNotes/Reports",
		"TaskNotes/Reports/周报202609041605.md",
	]);
	const plan = await planReportFile(baseInput(), deps);
	assert.equal(plan.path, `TaskNotes/Reports/周报202609041605-${stampOf(clock)}.md`);
	assert.deepEqual(probes, [
		"TaskNotes/Reports",
		"TaskNotes/Reports/周报202609041605.md",
	]);
});

test("单一时钟：一次调用只取一次时刻，frontmatter 与冲突后缀同源", async () => {
	const { deps, clock, nowCalls } = harness([
		"TaskNotes/Reports",
		"TaskNotes/Reports/周报202609041605.md",
	]);
	const plan = await planReportFile(baseInput(), deps);
	assert.equal(nowCalls(), 1);
	assert.ok(plan.content.includes(`generatedAt: "${clock.toISOString()}"`));
	assert.ok(plan.path.endsWith(`-${stampOf(clock)}.md`));
});

test("frontmatter：标题、类型、区间、生成器齐备", async () => {
	const { deps } = harness(["TaskNotes/Reports"]);
	const plan = await planReportFile(baseInput(), deps);
	assert.ok(plan.content.includes(`title: "周报 2026-08-31 ~ 2026-09-06"`));
	assert.ok(plan.content.includes("type: week"));
	assert.ok(plan.content.includes(`start: "2026-08-31"`));
	assert.ok(plan.content.includes(`end: "2026-09-06"`));
	assert.ok(plan.content.includes("generator: tasknotes-aireporter"));
});

test("路径规范化由注入实现决定：目录与文件路径都过规范化", async () => {
	const { deps } = harness([], { normalizePath: (path) => path.replace(/\\/g, "/") });
	const plan = await planReportFile(baseInput({ folder: "TaskNotes\\Reports" }), deps);
	assert.equal(plan.folderToCreate, "TaskNotes/Reports");
	assert.equal(plan.path, "TaskNotes/Reports/周报202609041605.md");
});

test("正文原样追加在 frontmatter 之后", async () => {
	const { deps } = harness(["TaskNotes/Reports"]);
	const plan = await planReportFile(baseInput({ body: "第一行\n第二行" }), deps);
	assert.ok(plan.content.endsWith("---\n\n第一行\n第二行"));
});
