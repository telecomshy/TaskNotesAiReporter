import { test } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import { selectSourceRepository } from "../src/tasks/source";
import type { TaskRepository } from "../src/tasks/repository";

const app = {} as App;

/** 一个不做任何事、但满足接缝形状的假后端。 */
function stubRepository(): TaskRepository {
	return {
		async list() {
			return [];
		},
		async readBody() {
			return "";
		},
		async statuses() {
			return [];
		},
	};
}

test("selectSourceRepository 按来源选择后端，恒返回一个 TaskRepository", () => {
	const tasknotes = stubRepository();
	const obsidianTasks = stubRepository();
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
