# 规格：支持 Obsidian Tasks 插件作为任务来源

> 权威出处：GitHub issue [#27](https://github.com/telecomshy/TaskNotesAiReporter/issues/27)（`ready-for-agent`）。本文件是仓库内可被 `/code-review` 直接发现的副本。
>
> _来源：`/grill-with-docs` 逼问定形。本规格**取代** #27 早先的「Deferred」版本——旧版本采用「改 `TaskRepository` seam + `key` 字段重构 + 借 `getTasks()` + 富详情」的重方案，本版本改为更轻的「新增来源工厂 seam + `path` 承载唯一性 + metadataCache 自扫 + 行描述详情」，同时吸收旧版本优秀的字段映射语义。_

## Problem Statement

本插件目前只能从 **TaskNotes** 读取任务：TaskNotes 通过其运行时 API 把任务暴露为「一篇笔记 = 一个任务」。使用 **Tasks**（obsidian-tasks-group/obsidian-tasks）的用户把任务写成**任意笔记里的行内清单项**，数据模型与 TaskNotes 完全不同，因此无法用本插件从自己已有的 Tasks 任务生成周报 / 月报 / 年报。

## Solution

新增一个「**来源**」设置，取值 **TaskNotes**（默认）或 **Obsidian Tasks**，一次只选一个。来源通过一个**来源工厂**接到既有的 `TaskRepository` seam 之后；报告生成、选择任务、模板、报告语言等核心流程完全不感知来源。Tasks 来源下，插件自扫 vault 中的 checklist 行、解析为插件统一的任务模型，复用现有的「选择任务 → 生成报告」全流程；TaskNotes 用户的默认行为完全不变。

## User Stories

1. 作为使用 Tasks 插件的 Obsidian 用户，我想在设置里把「来源」切换为 Obsidian Tasks，这样不装 TaskNotes 也能生成报告。
2. 作为已有 TaskNotes 用户，我希望升级后默认仍是 TaskNotes，这样现有报告流程零变化。
3. 作为用户，我想按日期范围自动筛选 Tasks 任务，以便快速得到本周 / 本月候选。
4. 作为用户，我想用标题关键字搜索 Tasks 任务，以便从大量任务中定位要写进报告的那些。
5. 作为用户，我想用 `#标签` 搜索 Tasks 任务（匹配行内标签），以便按主题筛选。
6. 作为 Tasks 用户，当我在「选择任务」里看到来源为 Tasks 时，我希望 `@上下文` 输入被隐藏 / 禁用并提示「当前来源不支持」，避免输入了却永远筛不到。
7. 作为用户，我想在任务条目上看到 Tasks 的状态（Todo / Done / In Progress 等）与优先级（Highest…Lowest），以便判断取舍。
8. 作为用户，我想看到任务的完成日期与到期日，以便写进报告。
9. 作为用户，我想把**同一篇笔记里的多个** Tasks 任务分别加入报告，互不覆盖。
10. 作为用户，我从报告列表移除一个任务时，不应连带移除同一文件里的其他任务。
11. 作为用户，我希望任务的「详情」是这条任务本身的文字描述，这样报告有实质内容而不过度冗余。
12. 作为用户，当我选了 Obsidian Tasks 来源却没启用该插件时，我想看到明确的「未检测到 Obsidian Tasks 插件」提示。
13. 作为用户，我希望切换来源后，日期口径、报告目录、报告语言等既有设置继续可用。
14. 作为用户，我希望任务在候选集合里稳定去重，同一任务不会重复出现。
15. 作为用户，我希望报告生成、模板、报告语言等流程不受来源影响。
16. 作为用户，Tasks 任务没有「归档」概念时，我不应看到归档相关的行为或提示。
17. 作为用户，当我选回 TaskNotes 时，一切与现状一致（回归安全）。
18. 作为用户，Tasks 权限不显示无对应字段（时间跟踪 / 项目）时，我希望报告少一个维度而不是报错。
19. 作为开发者，我希望来源差异被收敛到**一个来源工厂 + 一个行为 seam**，核心报告逻辑完全不感知来源。
20. 作为开发者，我希望沿用 ADR-0001「最小类型桩 + 运行时访问」精神，不引入对 Tasks 源码的编译期依赖。
21. 作为维护者，我希望有 ADR 记录「Tasks 后端经 metadataCache 自扫」这一对 ADR-0001 的破例及其理由。
22. 作为维护者，我希望领域词汇（任务 / 来源）反映多来源现实。

## Implementation Decisions

### 领域模型与术语

- 「**任务（Task）**」的定义改为**来源无关**：报告所纳入的工作项，来自某个「来源」（TaskNotes 或 Obsidian Tasks）。两者存储形态不同：TaskNotes 一任务即一笔记；Obsidian Tasks 一笔记含多任务行。
- 新增术语「**来源（Task Source）**」：报告任务数据的提供方，取值 TaskNotes / Obsidian Tasks；同一份报告只从一个来源读取，用户在设置中选择。
- 已更新 `CONTEXT.md`（「任务」「来源」条目）。新增 `docs/adr/0013` 记录「Tasks 后端经 metadataCache 自扫、破例 0001」这一不可逆取舍。

### 设置与迁移

- 设置新增 `taskSource: "tasknotes" | "obsidian-tasks"`，默认 `"tasknotes"`。
- `normalizeSettings` 为旧数据补默认值，保证既有用户行为不变。
- 设置页「常规配置」Tab 顶部新增「来源」下拉（TaskNotes / Obsidian Tasks）。
- 来源与 AI「供应商（Provider）」完全正交：来源决定从哪个任务插件读数据，供应商决定用哪个模型生成。

### 读取 seam（已与用户确认，共 2 个接缝）

1. **既有最高接缝 `TaskRepository`**（`list() / readBody(path) / statuses()`）不变——作为各来源后端的**行为契约**。Tasks 后端整体行为经此契约驱动，与 TaskNotes 后端测试同构（fake 先例 `test/fakes/taskRepository.ts`）。
2. **新增小接缝：来源 → 适配器工厂**，纯函数 `createTaskRepository(app, source): TaskRepository | null`。来源不可用（插件未启用）返回 `null`，由 UI 提示。挂在 `main.ts` 构造处（当前 `obsidianTaskRepository(this.app)` 所在）。这是「来源切换 / 检测」的**唯一关心点**。

> 刻意**不**改 `TaskRepository` seam 的形态（旧规格提议的 `list()+hydrate`），以避免波及报告生成等全部调用方——本方案把来源差异全部收进适配器。

### 任务身份（相对旧规格的轻量化选择）

- **唯一性由适配器塞进 `path` 字段**，而非新引入 `key` 字段或重构掉 path 唯一性（与 Q7 方案 A 一致）：
  - TaskNotes 后端：`path` 保持为笔记绝对路径（现状不变）。
  - Tasks 后端：`path` 设为 `"笔记路径#行号"`（行号 0 基），全库唯一。
- `filter.ts` / `pickerSession` / `ReportModal` 里所有以 `path` 为键的逻辑（候选 map、勾选集合、去重、可加入排除）**零改动**。
- `id` 字段保持可空、不改。
- 明确不采用旧规格的 `key` + `taskKey()` 全链路重构——那会波及核心多处、收益低于成本。

### Tasks 枚举方式（metadataCache 自扫，破例 0001）

- Tasks 后端**自己**遍历 `app.vault.getMarkdownFiles()`，借助 `app.metadataCache` 识别带复选框的清单行，按行号读取原文并解析成插件统一任务模型。
- 不依赖 Tasks 插件的内部 `getTasks()`——它是非公开、跨版本易变的（官方 `apiV1` 也没有 `list`/搜索 API，见上游 issue #2459）。
- 不使用 Tasks 的 `apiV1`（创建 / 编辑 / 切换任务），插件只读。
- 插件未启用：来源工厂返回 `null` → UI 提示「未检测到 Obsidian Tasks 插件」。
- 因采用自扫，不存在 Tasks 冷启动「未 Warm 时暂空」问题（metadataCache 始终可用），故不沿用旧规格的有界轮询逻辑。

### 字段映射（吸收旧规格语义，调合到自扫路径）

Tasks 后端解析行时转为统一任务模型（自建 symbol → 可读名映射，复现旧规格 `status.name` / `priorityName` 的用户可见值）：

- `title` = 该行去字段后的描述，**不含标签**（剥掉行尾 `#tag`，对齐 `descriptionWithoutTags` 语义）。
- `tags` = 行内 `#tag`，**去 `#` 前缀**后存储（与 TaskNotes 存储口径一致）。
- `status` = 由复选框符号映射为**可读名**：`[ ]`→Todo、`[x]`/`[X]`→Done、`/`→In Progress、`-`→Cancelled（内置默认映射）。
- `statuses()`（`StatusDefinition[]`）：内置符号 → `{ value: 可读名, isCompleted }`。
- `priority` ＝ 由箭号映射为 `Highest/High/Medium/Normal/Low/Lowest`：`🔺→Highest`、`⏫→High`、`🔼→Medium`、`🔽→Low`、`⏬→Lowest`、缺省→Normal。
- 日期均格式化 `YYYY-MM-DD`：`completedDate ← ✅`、`due ← 📅`、`scheduled ← ⏳`、`dateCreated ← ➕`。
- `archived` 恒为 `false`；`contexts`、`projects` 为空数组（Tasks 无对应概念）。
- 无时间跟踪（`timeEstimate` / `timeEntries` / `totalTrackedTime`）、`dateModified`、`details` 正文文件——这些字段 Tasks 后端不提供（置空），下游自然降级。

### 「已完成」语义（isCompleted 口径）

- Tasks 的 `done` 语义采 `Task.isDone()` 口径：`DONE ∪ CANCELLED ∪ NON_TASK` 都视为"已结束 / 已完成"。
- 即映射表中 `isCompleted=true` 的符号：`[x]`、`[X]`、`-`（Cancelled）及相关 NON_TASK 符号。
- 注：Tasks 的 `Status.isCompleted()` 仅对 `DONE` 为真；我们选 `isDone` 口径是与 Tasks 自身 `done` 过滤一致、对用户更直观的选择（grilling Q3 已定）。

### 自定义状态（首版范围）

- 第一版**只内置**上述默认符号映射。
- 读 Tasks `data.json` 里的自定义状态配置，**留作后续增强**（避免首版就吃进 Tasks 的设置格式耦合）。自定义符号未知时按未完成（TODO 兜底）处理。

### 详情（readBody 语义）

- Tasks 后端的 `readBody(path)` 直接返回该行解析出的**描述文本**（去字段后的任务文字），不再"按路径读整篇笔记"。
- `hydrateTask` 会把该描述回填成 `details`（现有 `src/tasks/repository.ts` 的 `hydrateTask` 机制，无需改动）。
- 明确**不**采用旧规格的"嵌套子项 + 所在小节正文切片"富详情——自扫路径拿不到 `children` / `precedingHeader` 对象，且整篇/小节掏语义复杂、易把非任务文本灌入；本版本以"行描述"为详情，简单、去重安全。

### 搜索语义（@上下文）

- **必须在 Tasks 来源下处理**，否则是静默坑：TaskNotes 有「上下文（Contexts）」，Tasks 没有。
- 方案（grilling Q6 已定）：Tasks 来源下，「选择任务-按标题」的 `@上下文` 输入**隐藏 / 禁用**，并提示「当前来源不支持上下文」。
- `#标签` 与关键字语义保持不变。
- 明确**不**采用旧规格的"`@x` 退回普通关键字"——那会让用户误以为上下文筛选生效，静默返回错误结果。

### 归档 / 缺失能力降级

- `filter.ts` 的 `task.archived` 过滤对 Tasks 恒 `false`（全放行），不需要额外逻辑。
- 时间跟踪维度下的报告占位（如 `{{totaltrackedtime}}`）在 Tasks 来源下输出 0 / 空，可接受，不报错。
- 不把 Tasks 的 `heading`（所在小节标题）映射为"项目"——避免引入"假的项目"语义（grilling Q6 已定）。

### 配置消费点

- `main.ts` 构造报告弹窗处，以 `createTaskRepository(app, settings.taskSource)` 取代对 `obsidianTaskRepository(app)` 的直接调用。

## Testing Decisions

- **什么算好测试**：只断言**外部行为**——来源工厂返回的 `TaskRepository` 经 `list()` / `readBody()` / `statuses()` 产出的任务内容、去重身份、状态归类，以及来源不可用返回 `null` 的提示路径；不测适配器内部实现细节。
- **主 seam**：`TaskRepository`（`list` / `readBody` / `statuses`），沿用 `test/fakes/taskRepository.ts` 的 in-process fake 注入方式（先例：`test/repository.test.ts`、`test/generate.test.ts`）。
- **新 seam 测试**：`createTaskRepository(app, source)` 用注入的假「行解析器 + vault 扫描」驱动，验证来源=tasknotes/obsidian-tasks 时返回正确后端、来源插件缺失时返回 `null`。
- **纯函数单测**（先例：`test/filter.test.ts`、`test/prompt.test.ts`，逻辑抽到 `src/core` 层、无 Obsidian 依赖）：
  - Tasks 行 → 统一任务模型的映射（标题去标签、标签去 `#`、状态 / 优先级可读名、日期格式化、archived 恒 false、contexts/projects 空）。
  - 内置状态表的 `isCompleted`（isDone 口径：`[x]`/`-` true，`[]`/`/` false）。
  - 基于 `path="路径#行号"` 的去重 / 候选计算。
  - 来源感知的查询解析（Tasks 下 `@` 被禁用而非当作普通关键字）。
- **编排测试**：`generate.ts` 用 fake repository 覆盖（先例 `test/generate.test.ts`），确保换来源后报告生成仍通过。
- **回归**：TaskNotes 路径的既有测试全程保持通过、预期不变。

## Out of Scope

- 使用 Tasks 的 `apiV1` 创建 / 编辑 / 切换任务（本插件只读）。
- 同时合并两个来源（一次只用一种）。
- 接入 Tasks 的原生查询语言。
- 读 Tasks `data.json` 自定义状态（首版只内置映射，后续增强）。
- 把重复规则、依赖（`dependsOn` / `id`）、原始符号（🆔 / ⛔ / 🔁）提升为结构化字段（最多作为描述原文的一部分）。
- 新增 `startDate`、`cancelledDate` 作为可选日期口径。
- 「一行多子项 / 小节正文」的富详情语义。
- 重命名插件，或改动 TaskNotes 现有的任何语义。
- 报告输出/导出格式（本插件只产 MD 笔记）。

## Further Notes

### 上游事实（实现时无需重新调研）

- **无官方读取 API**：Tasks `apiV1` 仅含 `createTaskLineModal` / `editTaskLineModal` / `executeToggleTaskDoneCommand`；官方文档明确「通过 API 运行 Tasks 搜索尚不可用」（上游 issue #2459）。
- **存储与身份**：任务是任意 Markdown 笔记中的行内清单项，身份 = 笔记路径 + 行号（0 基）。行格式 `<indent><marker> [<symbol>] <body> ➕🛫⏳📅✅❌🔁⏫🏁🆔⛔ #tags`。
- **字段符号**：优先级 `🔺⏫🔼🔽⏬`；日期 `➕`(created) `🛫`(start) `⏳`(scheduled) `📅`(due) `✅`(done) `❌`(cancelled)；标签行内 `#tag`。
- **状态语义**：`Status.isCompleted()` 仅 `DONE` 为真；`Task.isDone()` = `DONE|CANCELLED|NON_TASK`。内置状态：`[ ]`→TODO、`[x]`→DONE、`/`→IN_PROGRESS、`-`→CANCELLED。
- **版本固定**：Obsidian Tasks `8.4.0`（release `9173205`，`main` HEAD `61ce07a9`），调研日期 2026-09-21。更详细资料见 `docs/research/obsidian-tasks-plugin-support.md`。

### 风险

- `metadataCache` 是 Obsidian 第一方公开 API，稳定；解析逻辑由我们自维护，不随 Tasks 内部 T Read析版本漂移。风险低于依赖 `getTasks()`。
- 自扫需自己实现行解析（缩进 / 复选框 / emoji 字段），工作量在解析纯函数及其测试上，均已列出覆盖。

### 参考资料

- 上游仓库：https://github.com/obsidian-tasks-group/obsidian-tasks
- 官方 Tasks API 文档：https://publish.obsidian.md/tasks/Advanced/Tasks+Api
- 任务属性文档：https://publish.obsidian.md/tasks/Scripting/Task+Properties
- 本仓库调研：`docs/research/obsidian-tasks-plugin-support.md`
