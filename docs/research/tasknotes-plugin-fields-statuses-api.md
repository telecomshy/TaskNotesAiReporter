# TaskNotes 插件的任务字段、状态与运行时 API

> 调研固定于 TaskNotes **4.13.1**（commit `9f59d23`，2026-09-15）+ `@tasknotes/model@0.3.0-rc.9`。
> 上游升级后需复核本文件。用途：本插件读取 TaskNotes 任务、把状态归类为已完成 / 进行中 / 未完成。

## 1. 日期字段哪些恒存在

关键结论：**唯一恒存在的是 `dateCreated`**，不是 `scheduled`。

| 字段 | 是否恒有 | 依据 |
|---|---|---|
| `dateCreated` | **恒有** | 创建时必写 `getCurrentTimestamp()`；portable schema `"required": ["status","dateCreated"]` |
| `dateModified` | 创建时必写 | mdbase 标 `generated: now_on_write` |
| `scheduled` | **默认自动设为「今天」**，但可选 | `DEFAULT_TASK_CREATION_DEFAULTS.defaultScheduledDate = "today"`，用户可设 `"none"` |
| `due` | 可选 | 默认 `"none"`，不自动设 |
| `completedDate` | 仅完成时写 | 状态切到 `isCompleted` 状态时打，否则清空；重复任务不写 |

来源：`src/types.ts:454-499`（`TaskInfo`）、`src/services/MdbaseSpecService.ts:198-245`、
`src/services/task-service/TaskCreationService.ts:146-154,217-251`、`src/settings/defaults.ts:107-126`、
`tasknotes-spec/schemas/tasknotes-task.schema.json`。

## 2. 状态：只有 isCompleted，没有 isInProgress

默认状态（`src/settings/defaults.ts:28-73`）：

| value | label | `isCompleted` |
|---|---|---|
| `none` | None | false |
| `open` | Open | false |
| `in-progress` | In progress | false |
| `done` | Done | **true** |

- `StatusConfig` 只有 `isCompleted` 与 `isSkipped` 两个语义标志（`src/types.ts:735-748`），**没有**「进行中」标志。
- 「进行中」只是某个状态值；要识别它，只能拿 `task.status` 去匹配 `api.catalog.statuses()` 的 `value`（默认 `in-progress`）。用户可自定义 / 改名状态。
- StatusManager 提供 `getCompletedStatuses()` / `getOpenStatuses()`（`src/services/StatusManager.ts:113-137`）。
- `api.catalog.statuses()` 原样返回配置数组（浅拷贝），每项含 `id/value/label/color/isCompleted/isSkipped?/order/...`（`src/api/TaskNotesAPI.ts:731-733,1030-1032`）。

## 3. 运行时公开 API

入口：`app.plugins.plugins["tasknotes"].api`（`src/bootstrap/pluginBootstrap.ts:113`，类型 `TaskNotesRuntimeApiV1`）。

- `tasks.get(path)` / `tasks.list(query?)` —— `list()` 无参返回全部任务；`get/list` 走元数据缓存。
- `tasks.create/update/patch/delete/complete/uncomplete/setStatus/setPriority/setDue/clearDue/setScheduled/clearScheduled/reschedule/archive/...`
- `catalog.statuses()` / `catalog.priorities()` / `catalog.fields()` / ...

**注意 `details`（正文）不在 `get`/`list` 返回里**——运行时 API 读缓存，只有 HTTP API / MCP 才 hydrate 正文。要正文须自行读文件（本插件的 `TaskRepository.readBody` 已这么做）。

## 4. 字段与前缀

`TaskInfo`（`src/types.ts:454-499`）常用字段：`id`(=path)、`title`、`status`、`priority`、`path`、
`archived`、`due?`、`scheduled?`、`tags?`、`contexts?`、`projects?`、`completedDate?`、`dateCreated?`、
`dateModified?`、`timeEstimate?`（分钟）、`timeEntries?`、`totalTrackedTime?`（分钟，计算得出）、`details?`。

- `tags`：**不带 `#`**（映射时 `normalizeFrontmatterTag` 去掉了 `#`）。
- `contexts`：原样字符串（UI 显示时才加 `@`）。
- `projects`：原样字符串，通常是 wikilink。
- `archived`：由 tags 里是否含归档标签推导。

`src/utils/taskInfoAssembly.ts:23-38`、`@tasknotes/model` 的 `mapping.ts`。

## 5. 文档 / 参考

- 仓库：<https://github.com/callumalpass/tasknotes>
- JavaScript API 文档：`docs/javascript-api.md`（`api.catalog.statuses()`、`api.tasks.*`）
