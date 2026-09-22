import { test } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import { selectSourceRepository } from "../src/tasks/source";
import { fakeTaskRepository } from "./fakes/taskRepository";

const app = {} as App;

test("selectSourceRepository 按来源选择后端，恒返回一个 TaskRepository", () => {
	const tasknotes = fakeTaskRepository();
	const obsidianTasks = fakeTaskRepository();
	const called: string[] = [];
	const backends = {
		tasknotes: () => {
			called.push("tasknotes");
			return tasknotes;
		},
		obsidianTasks: () => {
			called.push("obsidian-tasks");
			return obsidianTasks;
		},
	};

	assert.equal(selectSourceRepository("tasknotes", app, backends), tasknotes);
	assert.equal(selectSourceRepository("obsidian-tasks", app, backends), obsidianTasks);
	assert.deepEqual(called, ["tasknotes", "obsidian-tasks"]);
});
