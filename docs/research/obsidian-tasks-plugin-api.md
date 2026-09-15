# Obsidian Tasks 插件（obsidian-tasks-plugin）的运行时 API 与数据模型

> 调研固定于 `obsidian-tasks-group/obsidian-tasks` **v8.4.0**（`main`，commit `61ce07a`）。
> 上游升级后需复核本文件。用途：本插件从 Tasks 读取行内任务（见 issue #27）。

## 1. 没有「读取任务」的官方 API

- 唯一官方接口是 **`apiV1`**（`app.plugins.plugins["obsidian-tasks-plugin"].apiV1`，Tasks 2.0.0 起）：
  - `createTaskLineModal(): Promise<string>`
  - `editTaskLineModal(taskLine): Promise<string>`
  - `executeToggleTaskDoneCommand(line, path): string`
- 官方文档明确：**通过 API 运行 Tasks 搜索尚不可用**（上游 issue #2459）。没有 `apiV2`。
- 来源：`src/main.ts:31-33`、`src/Api/TasksApiV1.ts:4-32`、`docs/Advanced/Tasks Api.md`。

**读任务的唯一途径是非官方的 `plugin.getTasks(): Task[]`**（`src/main.ts:115-121`，读内存缓存）。
配套 `plugin.getState(): Cold | Initializing | Warm`（`src/Obsidian/Cache.ts:26-30`）；未 Warm 时 `getTasks()` 返回 `[]`。

## 2. 存储与身份

- 任务是**任意 Markdown 笔记里的行内清单项**，没有「一任务一笔记」。
- 身份 = **文件路径 + 行号（0 基）**；`TaskLocation` 另带 `sectionStart` / `sectionIndex` / `precedingHeader`。
- 来源：`src/Obsidian/Cache.ts`、`src/Task/TaskLocation.ts`、`src/Obsidian/FileParser.ts:105-111`。

## 3. Task 对象（`Task extends ListItem`）

- **继承自 `ListItem`**：`originalMarkdown`、`parent`、`children[]`、`indentation`、`listMarker`、
  `description`、`statusCharacter`、`taskLocation`、getter `path`/`file`/`lineNumber`/`sectionStart`/
  `sectionIndex`/`precedingHeader`/`outlinks`。
- **Task 自有**：`status`（`Status` 对象）、`tags: string[]`、`priority`（枚举）、`recurrence`、
  `onCompletion`、`dependsOn`、`id`、`blockLink`、`scheduledDateIsInferred`。
- **日期 getter**（`Moment | null`）：`createdDate`/`startDate`/`scheduledDate`/`dueDate`/`doneDate`/`cancelledDate`；
  另有 `TasksDate` 包装（`.formatAsDate()` → `YYYY-MM-DD`）。
- 派生：`isDone`、`priorityNumber`、`priorityName`、`urgency`、`descriptionWithoutTags`、`isRecurring`、
  `heading`/`hasHeading`、`happensDates`。
- 来源：`src/Task/Task.ts`、`src/Task/ListItem.ts:17-67`、`docs/Scripting/Task Properties.md`。

**没有** TaskNotes 那样的「详情 / 正文」字段。可作详情来源的上下文：`children`（嵌套子项）、
`originalMarkdown`、`precedingHeader`/`heading`、`task.file.property(...)`、`outlinks`。

## 4. 状态与优先级

- 状态是 **`Status` 对象**（可配置）：`symbol` / `name` / `type`（`StatusType`）/ `nextStatusSymbol` / `nextSymbol`。
  默认 `[ ]`=Todo、`[x]`=Done、`[/]`=In Progress、`[-]`=Cancelled；`StatusType` 含
  `TODO` / `DONE` / `IN_PROGRESS` / `ON_HOLD` / `CANCELLED` / `NON_TASK`。
- 优先级是**固定枚举**（用户不可改符号）：`Highest(0)`/`High(1)`/`Medium(2)`/`None(3)`/`Low(4)`/`Lowest(5)`；
  `priorityName` 对 `None` 返回 `'Normal'`。Emoji：`🔺⏫🔼 (无) 🔽⏬`。
- `task.tags` **带 `#` 前缀**（如 `['#todo']`）。若启用了标签型全局过滤器，该标签会从 `tags` 中移除。
- 来源：`src/Statuses/*`、`src/Task/Priority.ts`、`src/lib/PriorityTools.ts`、`docs/Getting Started/*`。

## 5. 文档 / 参考

- 仓库：<https://github.com/obsidian-tasks-group/obsidian-tasks>
- Tasks API：<https://publish.obsidian.md/tasks/Advanced/Tasks+Api>
- 任务属性：<https://publish.obsidian.md/tasks/Scripting/Task+Properties>
