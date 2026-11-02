# TaskNotes 日期字段事实核查：`dateModified` 与相关字段

> 调研对象：TaskNotes **4.15.0**（截至 2026-11-02 的最新 release，发布于 2026-11-01）
> 上游 commit：`9ead322c111c7811d843235532149fde134ea650`（annotated tag `4.15.0` = tag object `0ca234bb0cf48ab31db5364be6e25c932ce023ad`）
> 依赖版本：`@tasknotes/model@0.3.0-rc.18`（`package-lock.json` 锁定；默认字段映射由该包提供）
> 核查方式：读取 tag `4.15.0` 的 GitHub 源码压缩包 + npm 上的锁定版本 `@tasknotes/model` 包；未依赖二手文章。
> 结论适用于上述版本；上游升级后需复核。

## 结论速览

| 问题 | 结论 |
|---|---|
| `TaskInfo` 是否有 `dateModified`？ | **有**，字段名就是 camelCase **`dateModified`**；类型为 `string`，但**可选**（`dateModified?: string`）。 |
| `api.tasks.list()` 是否返回它？ | **是**。`list()` 返回 `TaskInfo[]`，从任务缓存/`TaskInfo` 原样拷贝，不做 mtime 回填。 |
| 它是文件 mtime 吗？ | **不是**。它是任务 frontmatter 中的显式字段，默认属性名也是 `dateModified`（可通过字段映射改名）。`file.mtime` 只是在筛选/Base 属性里作为别名或显示回退出现，不等于该字段的来源。 |
| 何时更新？ | TaskNotes 自己写任务时会更新：创建任务、通过 API/UI 修改任务属性、完成/取消完成、归档、时间追踪、重复任务操作等。官方设置文案是“**当任何任务属性变化时自动更新**”。 |
| 直接编辑正文会更新吗？ | **不会**。在 Obsidian 编辑器里直接改正文（或直接改 frontmatter）只会改变文件系统 mtime，TaskNotes 只刷新缓存、不重写 `dateModified`。但通过 TaskNotes 的“Edit task”弹窗或 `api.tasks.update()` 修改正文，会作为一次 TaskNotes 写入而更新它。 |
| 值格式？ | 官方类型/文档：**ISO 8601 timestamp**。TaskNotes 生成的值实际为本地时区、带毫秒和数字偏移的 ISO 串，例如 `2026-11-02T09:15:42.123+08:00`；不保证是 UTC `Z`。 |
| 可能缺失/为空吗？ | **可能**。类型是可选的；TaskNotes 新建的任务会写入，外部创建/旧任务/被手工删除该字段的任务可能没有。空字符串会被归一化为 `undefined`。 |

## 1. `dateModified` 是否存在、拼写是什么

### 1.1 内部类型 `TaskInfo`

`src/types.ts` 的 `TaskInfo` 明确定义了这些字段（注意大小写）：

```ts
due?: string;
scheduled?: string; // Date (YYYY-MM-DD) when task is scheduled to be worked on
completedDate?: string; // Date (YYYY-MM-DD) when task was marked as done
dateCreated?: string; // Creation date (ISO timestamp)
dateModified?: string; // Last modification date (ISO timestamp)
```

来源：`src/types.ts` L456–L502，日期字段在 L481–L486。
<https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/types.ts#L456-L502>

因此：

- 拼写是 **`dateModified`**，不是 `date_modified`、`modified`、`lastModified`。
- 类型是 `string`，且带 `?`，即**可能不存在**。
- 同一接口里也有 `dateCreated`（不是 `createdDate`）、`completedDate`（不是 `completed`）、`due`、`scheduled`。

### 1.2 公开 API 的返回对象

运行时 API 文档把入口写成 `app.plugins.plugins.tasknotes.api`，并列出 `api.tasks.list(query?)` 返回任务：

- `docs/javascript-api.md` L202–L225：<https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/docs/javascript-api.md#L202-L225>
- 实现：`api.tasks.list()` 调用 `listTasks()`，返回 `TaskInfo[]`：
  `src/api/TaskNotesAPI.ts` L749–L752、L1847–L1853
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L1847-L1853>
- `listTasks()` 无查询参数时执行 `cacheManager.getAllTasks()`，再对每个结果做 `copyTaskInfo()`；后者只是浅拷贝/数组复制，**没有**把 `file.mtime` 写进 `dateModified`：
  `src/api/TaskNotesAPI.ts` L3469–L3510
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L3469-L3510>
- API 的字段目录也把它列为模型字段、可写、类型为 `datetime`：
  `src/api/TaskNotesAPI.ts` L283–L295
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L283-L295>

所以：**`api.tasks.list()` 返回的任务对象原生带 `dateModified` 这个 key（当任务数据里有该字段时）；字段名固定为 `dateModified`。**

## 2. 语义：frontmatter 显式字段，不是文件 mtime

### 2.1 读取路径

`TaskManager` 从 Obsidian metadata cache 的 **frontmatter** 映射出 `TaskInfo`：

```ts
const mappedTask = this.fieldMapper.mapFromFrontmatter(frontmatter, path, ...);
return buildTaskInfoFromMappedTask({ path, mappedTask, ... });
```

来源：`src/utils/TaskManager.ts` L325–L357
<https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/TaskManager.ts#L325-L357>

`@tasknotes/model` 的映射逻辑在读取时只做字符串归一化：

```js
if (frontmatter[mapping.dateModified] !== void 0) {
  mapped.dateModified = normalizeStringValue(frontmatter[mapping.dateModified]);
}
```

`normalizeStringValue()` 对空字符串返回 `undefined`，对非空字符串原样返回。来源：`@tasknotes/model@0.3.0-rc.18` 的 `dist/esm/mapping.js` L365–L367、L664–L670（包地址见文末）。

默认 frontmatter 字段名由 `@tasknotes/model` 的 `DEFAULT_FIELD_MAPPING` 提供，`dateModified` 的默认属性名就是 `"dateModified"`；TaskNotes 侧只是扩展该默认映射：

- `src/core/defaultFieldMapping.ts` L7–L10
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/core/defaultFieldMapping.ts#L7-L10>
- `@tasknotes/model@0.3.0-rc.18` `dist/esm/config.js` L13–L15 的 `DEFAULT_FIELD_MAPPING`（`dateCreated: "dateCreated"`、`dateModified: "dateModified"`）。

注意：**`TaskInfo.dateModified` 是固定内部字段名；对应的 frontmatter 属性名可被用户改掉**（设置里的字段映射/Property key）。如果改了，API 返回的仍叫 `dateModified`，但 YAML 里可能是 `date_modified` 或别的名字。官方 release 也修过自定义属性名相关问题（4.1.0, #1170：<https://github.com/callumalpass/tasknotes/blob/4.15.0/docs/releases/4.1.0.md>）。

### 2.2 为什么不是 mtime

- 该字段来自 frontmatter 映射，见上一节；`TaskInfo` 里没有 `mtime` 字段，只有 `path` 等。
- API 文档/字段定义把它标为 **model** 字段（`source: "model"`），不是 computed / file 字段：`src/api/TaskNotesAPI.ts` L290–L295。
- `file.mtime` 确实出现在 TaskNotes 中，但用途不同：
  - 运行时筛选属性的别名：`task.dateModified` 的 aliases 包含 `"file.mtime"`，这是为了兼容按 Base 属性名筛选，不是取值回退：
    `src/api/TaskNotesAPI.ts` L587–L596
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L587-L596>
  - Base 属性映射会把 `file.mtime` 映射到 `dateModified`，同样是属性名兼容：
    `src/bases/PropertyMappingService.ts` L96–L100
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/bases/PropertyMappingService.ts#L96-L100>
  - **例外/显示层回退**：Bases 日历事件构造时，如果任务没有 `dateModified`，会拿 `file.mtime` 填进用于显示的事件对象；同一函数也会用 `file.ctime` 回填缺失的 `dateCreated`：
    `src/bases/calendarEventMount.ts` L154–L170
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/bases/calendarEventMount.ts#L154-L170>
    这不应被理解为 `api.tasks.list()` 或 `TaskInfo` 的字段语义。

### 2.3 何时写入/更新

官方设置页对 `Date modified` 的说明是：

> “Timestamp of the last change to the task. **Automatically updated when any task property changes.**”

来源：`src/settings/tabs/taskPropertiesTab.ts` L214–L216
<https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/settings/tabs/taskPropertiesTab.ts#L214-L216>

代码层面的触发点：

1. **创建任务**：创建时 `dateCreated` 和 `dateModified` 都取当前时间（若调用方未提供）。
   `src/services/task-service/TaskCreationService.ts` L147–L155
   <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/task-service/TaskCreationService.ts#L147-L155>
2. **通过 TaskNotes 更新任务**：`TaskUpdateService.updateTask()` 在写 frontmatter 前生成 `dateModified = getCurrentTimestamp()`，并把该值放进要写回的 `completeTaskData`。
   `src/services/task-service/TaskUpdateService.ts` L143–L146；
   `src/services/task-service/taskUpdatePlanning.ts` L301–L332（L318 把 `dateModified` 加入写回数据）
   <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/task-service/taskUpdatePlanning.ts#L301-L332>
3. **通过 Edit task 弹窗更新**：只要检测到有变化（包括正文 `details` 变化），就写入 `dateModified`。
   `src/modals/taskEditChanges.ts` L184–L203
   <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/modals/taskEditChanges.ts#L184-L203>
4. **特定业务操作**也会写：状态变更、完成/取消完成、归档、时间追踪、重复任务推进等，都走各自 planning 后写回该字段。例如归档 `src/services/task-service/taskArchivePlanning.ts` L49–L54、L77–L78，时间追踪 `src/services/task-service/taskTimeTrackingPlanning.ts` 等。

**不会**触发的场景：

- 在 Obsidian 编辑器里直接编辑任务正文。`TaskManager` 的 `metadataCache.on("changed")` 处理器只重新抽取 `TaskInfo` 并触发 `EVENT_TASK_UPDATED`，没有写 frontmatter：
  `src/utils/TaskManager.ts` L113–L140、L166–L202
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/TaskManager.ts#L166-L202>
  代码注释也明确说这是为了“users edit task frontmatter directly in Obsidian”时刷新卡片，而不是替用户改字段。
- 直接手工改 frontmatter：同理，TaskNotes 读取你写的值；它不会自动把 `dateModified` 改成当前时间。
- 外部同步/其它工具只改文件 mtime：不会影响 `dateModified`。

因此准确表述是：

> `dateModified` 不是文件系统 mtime，而是 TaskNotes 管理的 frontmatter 时间戳。它由 TaskNotes 的任务写入路径维护；任何通过 TaskNotes 的任务属性/内容修改都会刷新，绕过 TaskNotes 的直接文件编辑不会刷新。

补充：`TaskUpdateService.updateTask()` 是在写 frontmatter 时**无条件**生成当前时间，并没有先做“字段是否真的变了”的 diff；`TaskEditModal` 这一层会在无变化时不提交。因此不要假设“只有值实际变化才更新”，但可以假设“TaskNotes 的写入会更新”。

## 3. 值格式与缺失情况

### 3.1 官方格式

- `TaskInfo.dateModified` 注释：`// Last modification date (ISO timestamp)`（`src/types.ts` L486）。
- 官方属性类型文档把它列为 `text (datetime)`，格式 **ISO 8601 timestamp**，示例 `"2025-01-15T10:30:00Z"`：
  `docs/settings/property-types-reference.md` L112–L117
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/docs/settings/property-types-reference.md#L112-L117>
- 同一文档的快速表也确认 `dateModified` 为 `text (datetime)`：
  `docs/settings/property-types-reference.md` L8–L17
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/docs/settings/property-types-reference.md#L8-L17>

### 3.2 TaskNotes 实际生成的值

`getCurrentTimestamp()` 生成的是**本地时区**的 ISO 风格字符串，包含毫秒和 `±HH:MM` 偏移：

```ts
return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${diff}${tzOffsetHours}:${tzOffsetMinutes}`;
```

来源：`src/utils/dateUtils.ts` L760–L782
<https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/dateUtils.ts#L760-L782>

例如（示意）：`2026-11-02T09:15:42.123+08:00`。它不是固定的 UTC `Z` 格式；文档示例用 `Z` 只是表示 ISO 8601 的合法写法之一。解析时应按 ISO 8601 处理，不要假设一定以 `Z` 结尾或一定是 UTC。

### 3.3 会不会缺失/为空

- 类型是 `dateModified?: string`，**允许缺失**。
- TaskNotes 自己创建的任务会写入该字段（创建时 = 当前时间）。
- 以下情况会缺失：
  - 任务笔记由外部工具/手工创建，且没有写 `dateModified`；
  - 旧版本/导入任务没有该字段；
  - 用户手工删除了该属性。
- 空值：`@tasknotes/model` 的 `normalizeStringValue()` 会把 `null`、`undefined`、空白字符串归一化为 `undefined`；因此 YAML 里写 `dateModified:` 空值，映射后等于没有该字段（`task.dateModified === undefined`），不是空字符串。
- 读取时**不校验日期格式**：非空字符串会原样保留。因此如果手工写了 `YYYY-MM-DD` 或乱写的字符串，API 仍可能把它作为字符串返回。官方约定的格式是 ISO 8601 timestamp，但“字段存在”不等于“值一定能被 `new Date()` 正确解析”。
- `api.tasks.list()` 不会回退到 `file.mtime` 来补这个字段；缺失时就是 `undefined`（见第 1.2 节）。

## 4. 其它日期字段的官方命名与格式

以下均指 `TaskInfo`/API 返回对象里的字段名；默认 frontmatter 属性名相同，但可通过字段映射改成别的 YAML key。

| 字段（精确拼写） | 类型 | 官方格式 | 语义/写入时机 | 是否可缺失 |
|---|---|---|---|---|
| `dateCreated` | `string?` | ISO 8601 timestamp | 创建时间；TaskNotes 创建任务时写入 `getCurrentTimestamp()` | 类型上可选；TaskNotes 新建任务会有 |
| `dateModified` | `string?` | ISO 8601 timestamp | 最后修改时间；TaskNotes 任务写入路径更新 | 类型上可选；外部/旧任务可能没有 |
| `completedDate` | `string?` | `YYYY-MM-DD` | 任务被标记为完成时的日期；状态变为完成时写入，取消完成时删除；**重复任务不使用**（用 `complete_instances`） | 可选；未完成/重复任务通常没有 |
| `due` | `string?` | `YYYY-MM-DD` 或 ISO 8601 timestamp | 截止日期；由 frontmatter 原样读取 | 可选 |
| `scheduled` | `string?` | `YYYY-MM-DD` 或 ISO 8601 timestamp | 计划执行日期；由 frontmatter 原样读取 | 可选 |

注意：MDBASE schema 把 `dateCreated` 标为 `required: true`、`dateModified` 标为 `generated: now_on_write`，但运行时 `TaskInfo` 类型把两者都标为可选。不要把 schema 的约束直接当成“`api.tasks.list()` 返回的每个任务都一定有这两个值”——外部创建/导入的任务仍可能缺字段。

依据：

- `TaskInfo` 字段与注释：`src/types.ts` L461–L486
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/types.ts#L461-L486>
- 官方字段类型文档：
  - 快速表 `due`/`scheduled`/`completedDate`/`dateCreated`/`dateModified`：
    `docs/settings/property-types-reference.md` L8–L17
  - `due`、`scheduled` 详细说明（`YYYY-MM-DD` 或 ISO 8601 timestamp）：
    `docs/settings/property-types-reference.md` L74–L96
  - `completedDate`（`YYYY-MM-DD`）、`dateCreated`、`dateModified`：
    `docs/settings/property-types-reference.md` L98–L117
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/docs/settings/property-types-reference.md#L69-L117>
- API 字段目录：
  - `due` / `scheduled` 为 `date`：`src/api/TaskNotesAPI.ts` L177–L178
  - `completedDate` 为 `date`：`src/api/TaskNotesAPI.ts` L254–L260
  - `dateCreated` / `dateModified` 为 `datetime`：`src/api/TaskNotesAPI.ts` L282–L295
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L177-L295>
- `completedDate` 的写入逻辑：
  - `TaskService.updateCompletedDateInFrontmatter()` 使用 `getCurrentDateString()`：
    `src/services/TaskService.ts` L2405–L2430
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/TaskService.ts#L2405-L2430>
  - `getCurrentDateString()` 明确返回 `YYYY-MM-DD`：
    `src/utils/dateUtils.ts` L784–L795
    <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/dateUtils.ts#L784-L795>
  - 重复任务跳过 `completedDate`，改用完成实例数组（`complete_instances` / `skipped_instances`）。
- `dateCreated`/`dateModified` 创建时写入：
  `src/services/task-service/TaskCreationService.ts` L147–L155
  <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/task-service/TaskCreationService.ts#L147-L155>
- 官方 `TaskInfo` 注释也把 `scheduled` 标为 `YYYY-MM-DD`，但类型文档明确允许带时间的 ISO 串；实现读取时不做格式收紧。实际以 frontmatter 原值为准。

## 5. 对本项目/使用方的实践建议

1. **用 `task.dateModified`，不要读 `stat.mtime` 来代替它**。两者语义不同：前者是 TaskNotes 管理的“任务数据最后修改时间”，后者是“文件字节最后写入时间”。
2. 把 `dateModified` 当成**可选**字段处理：`task.dateModified ?? null`，不要假定所有任务都有。
3. 解析时用宽容的 ISO 8601 解析器；实际值可能是 `+08:00` 偏移 + 毫秒，不一定是 `Z`。
4. 如果依赖它判断“任务是否被用户改过”，注意它**不会**跟踪直接编辑正文/直接改 frontmatter；这类外部修改只能看文件 mtime 或自己监听 `metadataCache`/`vault` 事件。
5. 如果项目自己写任务（通过 `api.tasks.update` / `api.tasks.complete` 等），每次写都会刷新 `dateModified`；不要把它当业务字段或用户可编辑的“完成时间”来用。

## 6. 来源清单（均为 tag 4.15.0 / commit `9ead322`）

仓库：<https://github.com/callumalpass/tasknotes>
Release：<https://github.com/callumalpass/tasknotes/releases/tag/4.15.0>

| 内容 | 链接 |
|---|---|
| `TaskInfo` 类型（日期字段 L481–L486） | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/types.ts#L456-L502> |
| 运行时 API `tasks.list()` 类型/实现 | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L749-L752>、<https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L1847-L1853> |
| API 字段目录（datetime/date） | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/api/TaskNotesAPI.ts#L177-L295> |
| 运行时 API 官方文档 | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/docs/javascript-api.md#L202-L225> |
| 字段类型官方文档（ISO / YYYY-MM-DD） | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/docs/settings/property-types-reference.md#L69-L117> |
| 设置页“any task property changes”文案 | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/settings/tabs/taskPropertiesTab.ts#L214-L216> |
| `getCurrentTimestamp()` 生成格式 | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/dateUtils.ts#L760-L782> |
| `getCurrentDateString()`（YYYY-MM-DD） | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/dateUtils.ts#L784-L795> |
| 任务创建时写 `dateCreated`/`dateModified`/`completedDate` | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/task-service/TaskCreationService.ts#L147-L155> |
| 更新任务时写 `dateModified` | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/task-service/taskUpdatePlanning.ts#L301-L332> |
| Edit modal 有变化才写 `dateModified` | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/modals/taskEditChanges.ts#L184-L203> |
| 直接编辑只刷新缓存、不写 frontmatter | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/utils/TaskManager.ts#L166-L202> |
| `completedDate` 写入逻辑 | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/TaskService.ts#L2405-L2430> |
| 默认字段映射入口 | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/core/defaultFieldMapping.ts#L7-L10> |
| MDBASE schema：`dateCreated` required/generated，`dateModified` generated on write | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/services/MdbaseSpecService.ts#L238-L247> |
| mtime 的显示层回退（仅 Bases 日历） | <https://github.com/callumalpass/tasknotes/blob/9ead322c111c7811d843235532149fde134ea650/src/bases/calendarEventMount.ts#L154-L170> |

锁定依赖 `@tasknotes/model@0.3.0-rc.18`：

- npm 页面：<https://www.npmjs.com/package/@tasknotes/model/v/0.3.0-rc.18>
- tarball：<https://registry.npmjs.org/@tasknotes/model/-/model-0.3.0-rc.18.tgz>
- 本文件引用的映射实现位于包内 `dist/esm/mapping.js` L362–L367；默认映射位于 `dist/esm/config.js` L7–L40。
- 仓库声明：<https://github.com/callumalpass/tasknotes-model>

## 7. 未能核实/边界说明

- 本次全部结论均已通过上述 tag 源码与锁定 npm 包核实；没有出现网络不可达导致无法核实的关键项。
- 未对 Obsidian 各版本 YAML 解析器如何处理“未加引号的时间戳”做跨版本实测；若 YAML 把值解析成非字符串对象，`normalizeStringValue()` 会丢弃该值（返回 `undefined`）。因此建议在 frontmatter 中把时间写为带引号的字符串，避免解析器差异。
- “是否更新”描述的是 TaskNotes 自身的写入路径；第三方插件直接改文件、或 Obsidian Sync 覆盖文件，不在 TaskNotes 控制范围内。
