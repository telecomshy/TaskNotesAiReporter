# 支持 Obsidian Tasks 插件任务的可行性调研

> 调研固定于 **TaskNotes AI Reporter**（本地仓库）+ **Obsidian Tasks 8.4.0**（release `9173205`，2026-08-25；`main` HEAD `61ce07a9`，2026-09-05）+ **TaskNotes** 插件 `main`。
> 调研日期 2026-09-21，上游升级后需复核本文件。
> 用途：评估在本插件现有多来源任务读取架构（`TaskRepository` seam）之后，新增一个 Obsidian Tasks 后端适配器的可行性。

## 重要命名更正

Tasks 插件的 manifest id 是 **`obsidian-tasks-plugin`**（不是 `obsidian-tasks`），name = "Tasks"（`manifest.json`）。官方 API 访问器：

```js
app.plugins.plugins['obsidian-tasks-plugin']  // TasksPlugin 实例
```

## 1. Tasks 插件的公开 JS API

公开 API 很小，且不是"列任务"API，而是**任务行级 UI/切换辅助**，挂在 `apiV1` getter 上（`src/main.ts:31-33`，工厂 `src/Api/index.ts`）：

- `createTaskLineModal(): Promise<string>` — 打开「新建/编辑任务」弹窗，返回 Markdown 行
- `editTaskLineModal(taskLine: string): Promise<string>`
- `executeToggleTaskDoneCommand(line, path): string`

接口定义 `src/Api/TasksApiV1.ts`；官方文档 `docs/Advanced/Tasks Api.md` 明确写 *"The Tasks API is available from `app.plugins.plugins['obsidian-tasks-plugin'].apiV1`"*，并列出限制：*"Searching tasks: It is not yet possible to run Tasks searches via the API"*（issue #2459）。**没有公开的 `getAllTasks`/`search`/`list` API。**

`TasksPlugin` 实例上还有些 **TypeScript-public** 但未文档化的方法：
- `getTasks(): Task[]`（`src/main.ts:115-121`）→ 返回内存缓存里的全部任务
- `getState(): State`（`Cold | Initializing | Warm`，`src/main.ts:123-128`）

## 2. 数据模型 / vault 文件格式

任务是**任意 markdown 笔记里的列表行**（`<indent><marker> [<statusSymbol>] <body> ➕🛫⏳📅✅❌🔁⏫🏁🆔⛔ #tags`）。

解析管线（初级源）：
1. **不直接正则扫全文**：靠 Obsidian `metadataCache.listItems`（`ListItemCache[]`）得知哪些行是带复选框的列表项（`src/Obsidian/FileParser.ts:68-112`），按行号读原始行再 `Task.fromLine(...)`。
2. 行结构/状态：`Task.extractTaskComponents`（`src/Task/Task.ts:284-310`）用 `taskRegex`（`src/Task/TaskRegularExpressions.ts:24-31`）抓缩进、列表标记、复选框字符、正文。
3. 字段解析：`Task.parseTaskSignifiers`（`Task.ts:243-277`）→ `DefaultTaskSerializer.deserialize`（`src/TaskSerializer/DefaultTaskSerializer.ts:299-407`）从行尾反复剥离字段 token：

| 字段 | 符号 | 说明 |
|---|---|---|
| 优先级 | `🔺⏫🔼🔽⏬` | `Priority` 枚举 `'0'..'5'`（`src/Task/Priority.ts`） |
| 开始日期 | `🛫` | `startDate` |
| 创建日期 | `➕` | `createdDate` |
| 计划日期 | `⏳`/`⌛` | `scheduledDate`（可能从文件名推断，`DateFallback`） |
| 到期日期 | `📅📆🗓` | `dueDate` |
| 完成日期 | `✅` | `doneDate` |
| 取消日期 | `❌` | `cancelledDate` |
| 重复 | `🔁 <rule>` | 需发生日期做 `Recurrence.fromText` |
| 完成时 | `🏁 keep/delete` | `onCompletion` |
| 任务 id | `🆔 <id>` | 可选，常为空 |
| 依赖 | `⛔ <id,...>` | `dependsOn` |
| 标签 | `#tag` | `extractHashtags`，text 尾巴 |

**`🟥🟨🟢` 更正**：不是 Tasks 内置格式的优先级符号（源码/文档 grep 无结果）；那是主题里的状态符号。内置优先级是箭号。

`taskFormat` 默认 `tasksPluginEmoji`，另有 `dataview` 格式（`DataviewTaskSerializer`），此处只需默认格式。

Task 有 `globalFilter` 前置过滤（`GlobalFilter.includedIn`，`src/Task/Task.ts:221`），默认空串（`src/Config/Settings.ts`）。

## 3. 如何枚举 vault 里所有任务

**没有官方公开枚举 API。** 可行路径：
- 用插件实例 `TasksPlugin.getTasks()` 拿**内存缓存** `this.cache.getTasks()`（`src/main.ts`、`src/Obsidian/Cache.ts`）。缓存 `loadVault()` → `indexFiles(this.vault.getMarkdownFiles())` 会解析**整个 vault** 的每个 `.md`（`Cache.ts:244-268`），并订阅 `metadataCache.on('changed')`、`vault.on('create/delete/rename')` 增量更新（`Cache.ts:146-241`）。这是**内部方法**，非公开 API。
- 或自己用 `metadataCache` + 文档化规则解析 markdown。

未文档化内部事件：`obsidian-tasks-plugin:cache-update`、`:request-cache-update` 等（`src/Obsidian/TasksEvents.ts`），经 `workspace.trigger(...)` 派发。

## 4. 状态语义（对应 `StatusDefinition { value, isCompleted }`）

- `Status`（`src/Statuses/Status.ts`）包 `StatusConfiguration`：`symbol`、`name`、`nextStatusSymbol`、`type: StatusType`。
- `StatusType` = `TODO | DONE | IN_PROGRESS | ON_HOLD | CANCELLED | NON_TASK | EMPTY`（`src/Statuses/StatusConfiguration.ts`）。
- `Status.isCompleted()` = **仅当 `type === DONE`**（`Status.ts:254-256`）。
- **`Task.isDone`** = `DONE | CANCELLED | NON_TASK`（`Task.ts:544-550`）——过滤里 `done/not done` 用这个。
- 自定义状态：任意单个字符作 `symbol`，各有 `type`；默认 `/`→IN_PROGRESS、`-`→CANCELLED（`Status.ts:198-213`）。
- 全局单例 `StatusRegistry.getInstance()`（`src/Statuses/StatusRegistry.ts`），用户设置存 `data.json`。

映射建议：`StatusDefinition.value` ≈ `Status.symbol`；`isCompleted` 取 **`type === DONE`**（严格）还是 **`Task.isDone`**（DONE∪CANCELLED∪NON_TASK）是**语义决策**，需明确。

## 5. 版本固定

- **Obsidian Tasks**：release `8.4.0`（2026-08-25，commit `9173205`）；`main` HEAD `61ce07a9`（2026-09-05）。manifest：`id: "obsidian-tasks-plugin"`、`minAppVersion: "1.8.7"`。
- **TaskNotes AI Reporter**：本地 `main`（README 说 Obsidian ≥ 1.12.2、需 TaskNotes）。

---

# 对 `TaskRepository` seam 的可行性评估

## 0. 要套进去的 seam（本地仓库）

- `TaskRepository` 三个方法：`list()`、`readBody(path)`、`statuses()`（`src/tasks/repository.ts:12-19`）。
- 生产适配器 `obsidianTaskRepository` 注入三个 deps：`listTasks()`（→ `api.tasks.list()` 返回整颗 `TaskInfo`）、`readNote(path)`（→ vault 按路径读文件）、`listStatuses()`（→ `api.catalog.statuses()`）（`src/tasks/obsidian.ts:25-57`）。
- `createTaskRepository.list()` 已过滤 `task.archived`（`repository.ts:37`）。
- ADR-0001：只经 TaskNotes 运行时公开 API 读取，不改其源码（`docs/adr/0001`）。

## 1. `TaskInfo` 逐字段对照

| `TaskInfo` | Obsidian Tasks | 判定 |
|---|---|---|
| `id` | `Task.id`（`🆔`），可选、常为空（依赖 token，非笔记标识） | **部分** |
| `title` | `Task.description`（勾选框后文本） | **可映射** |
| `status` | `Task.status: Status`（symbol/type） | **可映射** |
| `priority` | `Priority` 枚举 `'0'..'5'` | **可映射**（尺度不同） |
| `due` | `dueDate`（📅） | **直接** |
| `scheduled` | `scheduledDate`（⏳，可被文件名推断） | **可映射**（需注意推断） |
| `path` | 所在笔记路径 + 行号（`TaskLocation`），多任务共享一 path | **部分**（语义不同） |
| `archived` | **无此概念**（TaskNotes 有 `AutoArchiveService`） | **缺失** |
| `tags` | `Task.tags`（#tag） | **直接** |
| `contexts` | **无 `@` 上下文概念** | **缺失** |
| `projects` | **无项目概念**（最近似 heading/path） | **缺失** |
| `completedDate` | `doneDate`（✅） | **直接** |
| `timeEstimate` | **无** | **缺失** |
| `timeEntries` | **无** | **缺失** |
| `totalTrackedTime` | **无** | **缺失** |
| `dateCreated` | `createdDate`（➕） | **直接** |
| `dateModified` | **无**（仅文件级 mtime） | **缺失** |
| `details` | 无独立正文文件；最近似 description/blockLink | **部分/缺失** |

小结：~5 直接（due、completedDate、dateCreated、tags、path-近似），~4 可映射（title、status、priority、scheduled），大量**缺失**：archived、contexts、projects、全部时间跟踪（estimate/entries/total）、dateModified、details/body。

## 2. `StatusDefinition` 转化

- 可表达：从 `StatusRegistry` 构 `StatusDefinition[]`，`value`=symbol、`isCompleted`=按 `type===DONE`（或 `Task.isDone`）。
- 难点：我们 `filterTasksBySubset("completed")` 靠 `isCompleted===true`（`src/core/status.ts`）。**"cancelled/non-task 算不算已完成"是语义决策**，TaskNotes 目录（`{value,label,isCompleted,color}`）是个平铺真相源，Tasks 则有两套"done"概念。**判定：可表达，成本中低，需一个语义决定。**

## 3. `DateField`（completedDate | due | scheduled | dateCreated）

四个值在 Obsidian Tasks **都存在**：`doneDate`(✅) / `dueDate`(📅) / `scheduledDate`(⏳) / `createdDate`(➕)。额外有我们未建模的 `startDate`(🛫)、`cancelledDate`(❌)。仅 `scheduled` 需注意"从文件名推断"（`scheduledDateIsInferred`）。

## 4. 读取路径 / vault 格式 —— 最大的结构性缺口

- **我们模型**：任务 = 独立笔记文件，按 path 读（`obsidian.ts:37-41`），`list()` 一次结构化调用返回完整 `TaskInfo`。
- **Tasks 模型**：任务是**行**，散在任意笔记里。枚举要扫整个 vault（`Cache.ts` 逐 `.md`，靠 metadataCache listItems 判断，`cachedRead` 读行 → `FileParser` → `Task.fromLine`）。身份是 `TaskLocation(path, line, sectionStart, precedingHeader)`（`TaskLocation.ts`）。
- 后果：
  1. `list()` 不再是简单结构化调用；得自己扫全库或借用内部 `getTasks()`（公开 API 无 list）。
  2. **重复/归并**：同一逻辑任务可多行出现（重复任务的多个 occurrence、跨笔记/画布粘贴）。Tasks 保持它们独立（`createNextOccurrence`）。我们日期过滤靠**整体 path 去重**（`src/core/filter.ts:34-39`），对共享 path 的笔记会失效。
  3. **`readBody(path)` 无法成立**：无任务正文文件；`details` 语义不适用。

## 5. 可行性结论 + 最难的 3-5 个缺口

**架构层面**：`TaskRepository` seam + deps + adapter（ADR-0001）**在接口层面干净地支持第二个适配器** —— `createTaskRepository(deps)` 与来源无关，加一个设置开关（source: tasknotes | obsidian-tasks）自然映射到在同一个 `TaskRepository` 后面构造其中一个适配器；core 的筛选/状态/prompt 已按来源无关写（`src/core/status.ts:5-7` 明说未来来源只需提供 `StatusDefinition` 列表）。

**但数据模型缺口很大**，最难的 3-5 个：

1. **无公开 API 枚举任务**：`TasksApiV1` 只暴露任务行编辑/切换，无 `list()`。要么借内部 `Cache.getTasks()`（随版本易变、非公开），要么自己写全库行扫描，违反 ADR-0001 "只走运行时公开 API" 的精神。
2. **身份/读取路径错配**：TaskNotes 1 任务=1 笔记，seam 的 `readBody(path)`/path 去重基于此；Tasks 是 1 笔记多任务，靠 path+line 标识。`TaskInfo.path` 无法作唯一键，`details`/正文无对应物。
3. **缺失语义字段**（下游 UI/prompt 正在用）：`archived`（`repository.ts:37`、`filter.ts:36` 过滤）、`projects`/`contexts`（标题搜索/计数 `filter.ts:104-111`）、`totalTrackedTime`/`timeEstimate`/`timeEntries`（`formatTaskLine`、`totaltrackedtime` 占位符 `prompt.ts`）。
4. **状态"已完成"语义**：`Status.isCompleted()` 仅 DONE；`Task.isDone()` = DONE∪CANCELLED∪NON_TASK。completed/in-progress/open 子集判定（`status.ts`）需定义 cancelled/non-task 归属 —— 一处语义决定。
5. **重复/重复任务 occurrence**：同义任务多行存在，日期过滤按整 path 去重会错，无规范归并策略。

## 结论与建议

接口层面的"加一个 obsidian-tasks 后端适配器"是**架构上干净的**；但它**不是一个薄适配器** —— 需要新的身份语义、一个没有公开 API 的全库列举机制，并对一大批当前报告管道正消费的字段（`archived`、`projects`、`contexts`、全部时间跟踪、`dateModified`、`details`）做降级/省略。**可行，当且仅当**显式接受这些字段缺口与 path/身份改动（或把 `TaskInfo` 收窄成减量契约）。

## 初级源清单

- 本地：`src/tasks/repository.ts`、`src/tasks/obsidian.ts`、`src/types.ts`、`src/core/prompt.ts`、`src/core/status.ts`、`src/core/filter.ts`、`docs/adr/0001`。
- obsidian-tasks（github.com/obsidian-tasks-group/obsidian-tasks @ `main`）：`src/main.ts`、`src/Api/index.ts`、`src/Api/TasksApiV1.ts`、`src/Obsidian/Cache.ts`、`src/Obsidian/FileParser.ts`、`src/Obsidian/TasksEvents.ts`、`src/Task/Task.ts`、`src/Task/ListItem.ts`、`src/Task/TaskLocation.ts`、`src/Task/Priority.ts`、`src/Task/TaskRegularExpressions.ts`、`src/Statuses/Status.ts`、`src/Statuses/StatusConfiguration.ts`、`src/Statuses/StatusRegistry.ts`、`src/TaskSerializer/DefaultTaskSerializer.ts`、`src/TaskSerializer/DataviewTaskSerializer.ts`、`docs/Advanced/Tasks Api.md`、`docs/Getting Started/Statuses/*`、`manifest.json`。
- TaskNotes（github.com/callumalpass/tasknotes @ `main`）：`src/api/runtime-api.ts`、`src/api/TaskNotesAPI.ts`、`src/services/TaskService.ts`、`src/services/AutoArchiveService.ts`。

**UNCONFIRMED**：`Cache.getTasks()` 运行时在初始加载完成前是否返回暖数据的时序；以及把 `Cache.getTasks()` 当跨版本依赖的稳定性（是内部方法，非公开 API）。
