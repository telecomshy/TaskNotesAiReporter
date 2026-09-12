import { test } from "node:test";
import assert from "node:assert/strict";
import { getSelectablePaths, computeSelectAllState, initialSelection } from "../src/ui/taskSelection";
import type { TaskInfo } from "../src/types";

function makeTask(path: string): TaskInfo {
	return { path, title: path, status: "open", priority: "normal", archived: false };
}

const a = makeTask("a");
const b = makeTask("b");
const c = makeTask("c");

test("getSelectablePaths 排除已加入主列表的任务", () => {
	assert.deepEqual(getSelectablePaths([a, b, c], new Set(["b"])), ["a", "c"]);
});

test("getSelectablePaths 无已加入任务时返回全部", () => {
	assert.deepEqual(getSelectablePaths([a, b], new Set()), ["a", "b"]);
});

test("getSelectablePaths 空显示返回空", () => {
	assert.deepEqual(getSelectablePaths([], new Set(["a"])), []);
});

test("getSelectablePaths 全部已加入时返回空", () => {
	assert.deepEqual(getSelectablePaths([a, b], new Set(["a", "b"])), []);
});

test("computeSelectAllState 空显示为未选中", () => {
	assert.deepEqual(computeSelectAllState([], new Set(), new Set()), {
		checked: false,
		indeterminate: false,
	});
});

test("computeSelectAllState 无勾选", () => {
	assert.deepEqual(computeSelectAllState([a, b], new Set(), new Set()), {
		checked: false,
		indeterminate: false,
	});
});

test("computeSelectAllState 全部本地勾选为全选", () => {
	assert.deepEqual(computeSelectAllState([a, b], new Set(["a", "b"]), new Set()), {
		checked: true,
		indeterminate: false,
	});
});

test("computeSelectAllState 部分勾选为半选", () => {
	assert.deepEqual(computeSelectAllState([a, b, c], new Set(["a"]), new Set()), {
		checked: false,
		indeterminate: true,
	});
});

test("computeSelectAllState 已加入的任务视为已勾选（全为已加入=全选）", () => {
	assert.deepEqual(computeSelectAllState([a, b], new Set(), new Set(["a", "b"])), {
		checked: true,
		indeterminate: false,
	});
});

test("computeSelectAllState 本地勾选与已加入混合覆盖全部为全选", () => {
	assert.deepEqual(computeSelectAllState([a, b, c], new Set(["a"]), new Set(["b", "c"])), {
		checked: true,
		indeterminate: false,
	});
});

test("computeSelectAllState 本地勾选与已加入混合仅覆盖部分为半选", () => {
	assert.deepEqual(computeSelectAllState([a, b, c], new Set(["a"]), new Set(["b"])), {
		checked: false,
		indeterminate: true,
	});
});

test("initialSelection 默认全选：返回可勾选集（排除已加入）", () => {
	assert.deepEqual([...initialSelection([a, b, c], new Set(["b"]), true)].sort(), ["a", "c"]);
});

test("initialSelection 默认不选：返回空集", () => {
	assert.deepEqual([...initialSelection([a, b], new Set(), false)], []);
});

test("initialSelection 空显示返回空集", () => {
	assert.deepEqual([...initialSelection([], new Set(), true)], []);
});
