import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddableTasks, computeSelectAllState, initialSelection } from "../src/ui/taskSelection";
import type { TaskInfo } from "../src/types";

function makeTask(path: string): TaskInfo {
	return { path, title: path, status: "open", priority: "normal", archived: false };
}

const a = makeTask("a");
const b = makeTask("b");
const c = makeTask("c");

test("getAddableTasks 排除已加入的任务", () => {
	assert.deepEqual(getAddableTasks([a, b, c], new Set(["b"])), [a, c]);
});

test("getAddableTasks 无已加入任务时返回全部", () => {
	assert.deepEqual(getAddableTasks([a, b], new Set()), [a, b]);
});

test("getAddableTasks 空输入返回空", () => {
	assert.deepEqual(getAddableTasks([], new Set(["a"])), []);
});

test("getAddableTasks 全部已加入时返回空", () => {
	assert.deepEqual(getAddableTasks([a, b], new Set(["a", "b"])), []);
});

test("computeSelectAllState 空显示为未选中", () => {
	assert.deepEqual(computeSelectAllState([], new Set()), {
		checked: false,
		indeterminate: false,
	});
});

test("computeSelectAllState 无勾选", () => {
	assert.deepEqual(computeSelectAllState([a, b], new Set()), {
		checked: false,
		indeterminate: false,
	});
});

test("computeSelectAllState 全部勾选为全选", () => {
	assert.deepEqual(computeSelectAllState([a, b], new Set(["a", "b"])), {
		checked: true,
		indeterminate: false,
	});
});

test("computeSelectAllState 部分勾选为半选", () => {
	assert.deepEqual(computeSelectAllState([a, b, c], new Set(["a"])), {
		checked: false,
		indeterminate: true,
	});
});

test("initialSelection 默认全选：返回全部展示任务", () => {
	assert.deepEqual([...initialSelection([a, b, c], true)].sort(), ["a", "b", "c"]);
});

test("initialSelection 默认不选：返回空集", () => {
	assert.deepEqual([...initialSelection([a, b], false)], []);
});

test("initialSelection 空显示返回空集", () => {
	assert.deepEqual([...initialSelection([], true)], []);
});
