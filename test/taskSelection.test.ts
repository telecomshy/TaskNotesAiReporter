import { test } from "node:test";
import assert from "node:assert/strict";
import { getUncheckedTasks, computeSelectAllState, initialSelection } from "../src/ui/taskSelection";
import type { TaskInfo } from "../src/types";

function makeTask(path: string): TaskInfo {
	return { path, title: path, status: "open", priority: "normal", archived: false };
}

const a = makeTask("a");
const b = makeTask("b");
const c = makeTask("c");

test("getUncheckedTasks 排除已勾选任务", () => {
	assert.deepEqual(getUncheckedTasks([a, b, c], new Set(["b"])), [a, c]);
});

test("getUncheckedTasks 无已勾选时返回全部", () => {
	assert.deepEqual(getUncheckedTasks([a, b], new Set()), [a, b]);
});

test("getUncheckedTasks 空输入返回空", () => {
	assert.deepEqual(getUncheckedTasks([], new Set(["a"])), []);
});

test("getUncheckedTasks 全部已勾选时返回空", () => {
	assert.deepEqual(getUncheckedTasks([a, b], new Set(["a", "b"])), []);
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

test("initialSelection 默认全选：只选尚未已加入的展示任务", () => {
	assert.deepEqual([...initialSelection([a, b, c], new Set(["b"]), true)].sort(), ["a", "c"]);
});

test("initialSelection 默认全选：全是已加入时返回空", () => {
	assert.deepEqual([...initialSelection([a, b], new Set(["a", "b"]), true)], []);
});

test("initialSelection 默认不选：返回空集", () => {
	assert.deepEqual([...initialSelection([a, b], new Set(), false)], []);
});

test("initialSelection 空显示返回空集", () => {
	assert.deepEqual([...initialSelection([], new Set(), true)], []);
});
