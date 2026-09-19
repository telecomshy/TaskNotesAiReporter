import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddableTasks } from "../src/ui/taskSelection";
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
