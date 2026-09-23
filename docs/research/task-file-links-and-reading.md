# 任务里的文件链接会不会被读取

> 调研固定于 **TaskNotes 4.12.5**（`tasknotes-main/manifest.json`、`package.json` 均为 `4.12.5`；本地 vendored 检出，随本仓库 commit `b8d4911`，2026-09-21）+ `@tasknotes/model@0.3.0-rc.9`（`tasknotes-main/package.json:93`）、
> **Obsidian Tasks 8.4.0**（`obsidian-tasks-group/obsidian-tasks`，`manifest.json`，本文引用的 `main` 源文件已下载核对）、
> **Obsidian 平台 API**（官方 `obsidianmd/obsidian-api` 的 `obsidian.d.ts`，`master`）、
> 以及本插件 **0.3.0**（`manifest.json`）。
> 调研日期 **2026-09-22**。上游升级后需复核本文件。
> 用途：回答「任务中包含别的文件链接时，生成报告会不会读取这些文件」，并为「要不要把链接目标解析后送给模型」给出决策依据。
> 适用边界：只讨论「任务 → 文件」的链接与读取；不展开日历/timeblock 附件的 UI 交互细节，也不覆盖未来可能新增的「Obsidian Tasks 来源」实现（其可行性另见本目录 `obsidian-tasks-plugin-support.md`）。

## TL;DR（四个子问题）

1. **TaskNotes 能通过链接加文件，但要分两套东西。** 任务笔记 frontmatter 有 `attachments` 字段（4.12.0 起，portable，值为「链接字符串数组」）；timeblock（日历块）另有一套 attachments（存在 timeblock 数据里的 wikilink）。`projects` / `blockedBy` 同样是链接字段。正文里的 `[[wikilink]]` / `![[embed]]` 只在编辑/阅读视图被解析用于 UI 预览，**没有公开 API 读取这些链接目标**；TaskNotes 明确不持有附件字节。
2. **Obsidian Tasks 行内任务的描述文本可以带文件链接。** Tasks 把描述里的 `[[...]]` / `[..](..)` 当普通文本保留（构成 `task.description`），同时把它们抽取成 `task.outlinks`（7.21.0 起）；Tasks 只暴露链接的**元数据**（目标、显示文本、解析后路径），**不读取**目标内容，且明确不支持 embeds。
3. **本插件现在完全不读这些文件。确定性结论：否。** 它只读任务笔记自身（`app.vault.read(任务文件)` → 去 frontmatter → 整段塞进提示词）；没有任何 wikilink/embed 解析、没有递归、没有 `metadataCache` 调用、正文**没有**长度截断。链接在提示词里只是字面文本。另外本插件当前**没有**「Obsidian Tasks 来源」。
4. **判断：对报告总结不必默认读取，应做成默认关闭的可选开关。** 若开启，只解析文本、限制深度与字节数、跳过二进制/embed、去重防环，并计入 token 预算。详见第 5 节。

---

## 1. TaskNotes 侧：任务能不能「通过链接添加文件」

**能，但方式与「正文里写链接」不同。** TaskNotes 里与「文件链接」相关的东西分四处，必须先区分：

| 形态 | 在哪 | 存成什么 | 谁解析它 | 是否可通过公开 API 拿到 |
|---|---|---|---|---|
| 任务 frontmatter 的 `attachments` | 任务笔记 frontmatter | 有序「链接字符串数组」（wikilink 或 markdown link） | TaskNotes model / FieldMapper | **能**：随 `TaskInfo` 字段返回 |
| `projects`（项目） | 任务笔记 frontmatter | 链接字符串数组（通常是 wikilink） | model / FieldMapper | **能**：`TaskInfo.projects` |
| `blockedBy`（依赖） | 任务笔记 frontmatter | 依赖对象（uid + 关系类型） | model / FieldMapper | **能**：`TaskInfo.blockedBy` |
| **正文** `[[wikilink]]` / `![[embed]]` | 任务笔记正文 | 原文 markdown 文本 | 仅编辑器/阅读视图装饰器 | **不能**：无非公开的正文链接 API |
| timeblock attachments | 日历 timeblock 数据（非任务笔记） | wikilink 字符串数组 | timeblock 弹窗 | 仅 timeblock 域 |

### 1.1 任务级 `attachments`（4.12.0 新增，portable）

- 字段定义：`attachments?: string[]; // Ordered links to files that belong to this task`（`tasknotes-main/src/types.ts:466`）。
- 来源说明：「Added portable task attachment references. Attachments now round-trip as an ordered `attachments` link list in task frontmatter and are exposed through the TaskNotes model and runtime API. These are collection-file references only; **attachment bytes and binary metadata remain owned by the host**.」（`tasknotes-main/docs/releases/4.12.0.md:22-25`）——即 TaskNotes 只存**引用**，不读字节。
- 读取路径：frontmatter → `FieldMapper.mapFromFrontmatter`（`src/core/FieldMapper.ts:63-81`）→ `mappedTask.attachments` 回填进 `TaskInfo`（`src/utils/helpers.ts:329,357`；`src/utils/taskInfoAssembly.ts:23-38` 以 `...mappedTask` 透传）。Bases 路径同字段（`src/bases/helpers.ts:248`）。
- frontmatter 键名：默认映射键为 `attachments`（`src/api/TaskNotesAPI.ts:346-356` 的 `FIELD_MAPPING_KEY_BY_FIELD_ID`；默认映射来自 `@tasknotes/model`，见 `src/core/defaultFieldMapping.ts:1-4`）。
- 写法：默认写成 **wikilink**（`useFrontmatterMarkdownLinks` 默认 `false`，`src/settings/defaults.ts:402`）；开启后写成 markdown link `[text](path)`（`docs/settings/general.md:57`）。
- 公开 API 暴露：
  - `api.tasks.list()` 返回整颗 `TaskInfo`（`src/api/TaskNotesAPI.ts:1847-1853`，经 `copyTaskInfo` 浅拷贝，`attachments` 随 `{ ...task }` 带出，`src/api/TaskNotesAPI.ts:3469-3510`）。
  - `api.catalog.fields()` 列出 `id: "attachments"`（`src/api/TaskNotesAPI.ts:272-277`），并支持事件 `task.attachments.changed`（`src/api/runtime-api.ts:96,204-206`）。
- **注意**：4.12.5 里任务级 `attachments` 没有独立的编辑弹窗；任务相关 modal（`src/modals/TaskModal.ts`、`taskModalDependencies.ts`）grep 无 `attachment` 命中，只有 timeblock 两个 modal 有。它是模型/API/frontmatter 层概念。

### 1.2 其它链接型字段与关系 API

- `projects?: string[]`（`src/types.ts:465`）、`blockedBy?: TaskDependency[]`（`:492`）、`recurrence_parent`（`:471`）、`occurrence_template`（`:475`）。
- 关系 API 只有四类：`parents` / `subtasks` / `dependencies` / `blocking`（`src/api/TaskNotesAPI.ts:683-692` 定义、`:815-821` 实现），分别对应 projects 与依赖，**不含 attachments**。也就是说：官方没有「按 attachments 取相关文件」的 API。

### 1.3 正文里的 wikilink / embed：只被 UI 解析

- 阅读模式处理器用正则 `/!?\[\[([^\]]+)\]\]/g` 扫正文链接，并明确 **跳过 embed**（`if (match[0].startsWith("!")) continue;`）（`src/editor/ReadingModeTaskLinkProcessor.ts:78-102`）。
- `TaskLinkOverlay` 在编辑视图把正文 wikilink 解析为任务卡片，解析用 `metadataCache.getFirstLinkpathDest`（`src/editor/TaskLinkOverlay.ts:266-336`，`:559-580`）。
- 结论：这是**编辑器/阅读视图的渲染装饰**，只对能解析成 TaskNotes 任务的链接生效，不会把链接目标正文交给任何数据 API。

### 1.4 timeblock 的 attachments（与任务区分）

- `TimeBlock.attachments?: string[]`（`src/types.ts:538`），弹窗把选中文件转成 wikilink 存进 timeblock（`src/modals/TimeblockCreationModal.ts:333-334,353-354`；读回时 `replace(/^\[\[|\]\]$/g, "")`，`src/modals/TimeblockInfoModal.ts:306-315`）。
- `TaskContextMenu.ts:433` 的 `prefilledAttachmentPaths: [task.path]` 是「基于任务创建 timeblock 时把该任务预填为附件」，**不是**给任务笔记加附件。

### 1.5 有没有公开 API 读链接目标？

**没有。** TaskNotes 运行时 API 覆盖任务/查询/时间/日历域，不提供读取任意文件内容的方法；附件字节归宿主机（Obsidian vault）所有（`docs/releases/4.12.0.md:22-25`）。配套插件要读文件只能用 Obsidian 自己的 `app.vault` API（见第 4.2 节）。

---

## 2. Obsidian Tasks 侧：行内任务描述里的文件链接

固定版本：**Obsidian Tasks 8.4.0**（`manifest.json`）。

- 行内任务**一行一任务**，`task.description` 就是复选框之后、被剥离的元数据（emoji/日期/优先级等）之外的剩余文本；`task.description` 会保留 tags（`docs/Scripting/Task Properties.md:140,156-157`，对应 `src/TaskSerializer/DefaultTaskSerializer.ts:293-407` 的逐词剥离解析）。因此描述里写 `[[某文件]]` 会作为普通文本留在 description 中。
- Tasks **额外识别**两种链接写法并按链接处理：`[[filename|optional alias]]` 与 `[alias](filename.md)`；标题/嵌套标题也支持（`docs/Getting Started/Links.md:25-28`）。
- 链接值（7.21.0 起）：
  - `task.outlinks` = 「任务行里的链接」，不含嵌套子任务/子项（`Links.md:35`，`docs/Scripting/Task Properties.md:260,269`）。
  - `task.file.outlinksInProperties` / `outlinksInBody` / `outlinks` 覆盖任务文件 Properties / 正文 / 全部（`Links.md:36-38`，`Task Properties.md:261-273`）。
- Tasks 只包一层 `Link` 对象暴露元数据：`originalMarkdown`（`src/Task/Link.ts:27-29`）、`destination`、`displayText`、`destinationPath`；`destinationPath` 委托给 Obsidian 的 `getFirstLinkpathDest`（`src/Task/Link.ts:80-82`；`src/Task/LinkResolver.ts:28-30`）。**没有任何读取链接目标内容的动作。**
- 明确限制：
  - 「Tasks does not yet treat **Embeds** as links.」（`Links.md:59`）
  - 「Tasks does not yet provide an `inlinks` concept」（`Links.md:60`）
  - 链接解析路径在文件读取时算好，会话中移动文件后可能不更新（`Links.md:61-64`）。
  - 多行清单项不支持：只取第一行（`docs/Getting Started/Getting Started.md` 的 "Multi-line checklist items" 一节）。

**小结**：Obsidian Tasks 侧「描述可带链接」成立，但 Tasks 本身既不读目标内容，也不把 embeds 当链接。它和 TaskNotes 一样只提供「链接存在」这一元数据。

---

## 3. 本插件当前行为（确定性「是 / 否」）

对照调用链核实（`src/report/generate.ts:88-110` → `src/tasks/repository.ts:75-80,39-59` → `src/tasks/obsidian.ts:36-44` → `src/core/prompt.ts:36-53`）：

| 问题 | 结论 | 证据 |
|---|---|---|
| 是否解析正文里的 wikilink / embed？ | **否** | 全 `src/` grep `wikilink|embed|\[\[|metadataCache|getFirstLinkpathDest` 无命中；`stripFrontmatter` 只做 YAML 头剥离与 trim（`src/tasks/repository.ts:50-59`） |
| 是否递归读取链接目标？ | **否** | 唯一的文件读取是 `app.vault.read(file)`，且 `file` = 任务自身路径（`src/tasks/obsidian.ts:36-44`）；无循环、无队列 |
| 正文是否截断 / 有长度限制？ | **否**（无截断） | `formatTaskLine` 仅把空白折叠成单空格 `.replace(/\s+/g, " ")` 后整段拼入 `详情：`（`src/core/prompt.ts:48-51`）；`src/` grep `slice|substring|truncat|maxLength` 仅命中错误信息与无关工具，无正文限额 |
| 链接会被怎样送进提示词？ | 仅**字面文本** | `task.projects` 原样 join（`src/core/prompt.ts:44`）；正文 `details` 原样（`:48-51`）。`[[X]]`、`![[X]]` 就是普通字符 |
| 会消费 TaskNotes 的 `attachments` 字段吗？ | **否** | 本插件自己的 `TaskInfo` 类型里**没有** `attachments`（`src/types.ts:11-31`），故即便上游 API 返回也被丢弃 |
| 「Obsidian Tasks 来源」下的正文来自哪里？ | **不存在该来源** | 唯一来源是 TaskNotes：`api.tasks.list()`（`src/tasks/obsidian.ts:27-35`），插件类型桩也只声明 TaskNotes API（`src/types.ts:46-56`）。本仓库对 Obsidian Tasks 的调研/可行性见 `docs/research/obsidian-tasks-plugin-support.md`、`obsidian-tasks-plugin-api.md`（尚未实现） |

补充：`hydrateTask` 用 `Promise.all` 并发 hydrate 每个任务（`src/report/generate.ts:90-92`），但读的只有任务文件本身。全插件的文件读取点仅有 `src/tasks/obsidian.ts:36-44`（任务正文）与 `src/ui/ReportModal.ts:245`（保存后定位报告文件），二者都不涉及链接目标。

**一句话**：链接在本插件里完全「不透明」——不解析、不展开、不截断，原样当文本喂给模型。

---

## 4. 判断：报告总结有必要读取被链接文件吗？

### 4.1 成本：token 与上下文窗口

- 现状已经把**整段任务正文无上限**拼进提示词（第 3 节）。再加链接目标会在此基础上**乘性放大**：例如每个任务平均 1 个附件、每个附件是一篇 5 KB 的笔记，10 个任务就多送约 50 KB 文本。
- 文本 token 的粗略经验值（**启发式估算，非一手规范**）：英文约 4 字符/token，中文约 1–2 字符/token。一篇 5 KB 中文笔记约 2.5k–5k token。附件多、篇幅长时很容易挤爆上下文或触发截断/报错。
- 因此是否读取，本质是「**用 token 预算换摘要质量**」的取舍，必须可配置、有上限。

### 4.2 Obsidian 平台提供了哪些正确工具（一手）

来自官方 `obsidian-api` 的 `obsidian.d.ts`：

- 元数据缓存：`app.metadataCache.getFileCache(file)` → `CachedMetadata`，其 `links?: LinkCache[]`、`embeds?: EmbedCache[]`、`frontmatterLinks?: FrontmatterLinkCache[]`（`obsidian.d.ts:1402-1464`；`Reference` 字段 `link/original/displayText` 见 `:5323-5344`；`FrontmatterLinkCache.key` 见 `:3266-3271`）。
- 链接 → 文件：`metadataCache.getFirstLinkpathDest(linkpath, sourcePath)`（`:4411`）；全库链接图 `resolvedLinks` / `unresolvedLinks`（`:4438-4444`）。
- 子路径（标题/块）解析：`resolveSubpath(cache, subpath)`（`:5500`）。
- 读文本：`vault.read(file)`（`:7428`，直接读盘）、`vault.cachedRead(file)`（`:7436`，性能更好）；读二进制：`vault.readBinary(file): Promise<ArrayBuffer>`（`:7442`）。

### 4.3 风险清单（据此设限）

| 维度 | 问题 | 应对 |
|---|---|---|
| 二进制附件 | 图片/PDF/音视频无法直接进文本模型；`readBinary` 只给 `ArrayBuffer` | 白名单扩展名；图片需 vision 才谈得上，PDF 需外部抽取，默认跳过 |
| 嵌套 / 循环链接 | A 链 B、B 链 A，或深度失控 | `visited` 去重 + 最大深度（建议 1）+ 跳自身 |
| 体积 | 单个巨型笔记 / 附带整个项目文档 | 每文件字节上限 + 总量上限，超限截断并标注 |
| 隐私 | 附件可能含敏感内容，一旦发送即离开本地、进入第三方 OpenAI 兼容端点 | **默认关闭**；开启时给出明确提示 |
| 性能 | 批量 vault 读取 + 元数据解析 | 复用 `cachedRead`、并发读、只读必要文件 |
| 语义噪声 | 「链接目标」不等于「本任务内容」，混入会污染摘要 | 在提示词里分区标注来源，或只取标题/摘要 |

### 4.4 可操作建议

1. **默认关闭，做成显式开关**（如设置项 `includeLinkedFiles`），并写清会向模型发送链接文件内容。
2. **优先只展开结构化字段**：frontmatter 的 `attachments` 与 `projects` 语义明确、数量可控，比正文里的任意 `[[...]]` 安全；正文链接可作为第二阶段能力。
3. **限额**：最大深度 1、每个文件 ≤ 8 KB、链接文件总量 ≤ 几十 KB；用 `metadataCache` 解析目标、`vault.cachedRead` 读取；`visited` 集合防环。
4. **过滤**：只接受可读文本（如 `.md` / `.txt` / `.csv`）；跳过图片/PDF/未知二进制与 embeds（或把 embed 降级为「存在此附件」的提示）。
5. **可解释性**：给每个展开块加来源标注（来自哪个文件），避免模型把附件内容误当任务本身。
6. **保守替代方案**：连内容都不加，仅把链接文本（现在其实已经随 `projects`/正文进入提示词）交给模型——对「周报/月报这种以任务为主线」的用途，往往已足够；确有需要再让用户按需开启全文展开。

---

## 5. 不确定 / 未核实

- **`@tasknotes/model@0.3.0-rc.9` 的默认字段映射未逐行核对**：本地 `tasknotes-main/node_modules` 未安装该包，无法打开其 `mapping.ts`。`attachments` 默认 frontmatter 键为 `attachments` 的结论依据是 release note 措辞（`docs/releases/4.12.0.md:22-25`）、`TaskNotesAPI.ts:356` 的映射表与 `helpers.ts:329,357` 的字段读取；若 model 包默认值不同，键名需复核。
- **`tasknotes-main` 的 commit 不是上游发布 commit**：它是 vendored 进本仓库的目录（无独立 `.git`，`git -C tasknotes-main rev-parse --show-toplevel` = 本仓库根），`b8d4911` 是本仓库 HEAD（2026-09-21）。TaskNotes 上游 4.12.5 对应的发布 commit 未核实。
- **与既有笔记的版本不一致**：`docs/research/tasknotes-plugin-fields-statuses-api.md` 记录为 TaskNotes 4.13.1 / commit `9f59d23`，与当前检出的 4.12.5 不符。本文一律以当前检出为准；两篇笔记的版本口径需后续统一。
- **Obsidian 官方文档站点抓取失败**：`docs.obsidian.md` 的 webfetch 返回空，故平台 API 结论改用官方 `obsidianmd/obsidian-api` 的 `obsidian.d.ts`（一手类型定义），已标注 `@since`。
- **`[[链接]]` 在 Tasks 查询结果里渲染为可点击链接**这一点未逐行核对 renderer，只确认 `task.description` 保留原文、且链接被抽为 `task.outlinks`（`Task Properties.md:140,260,269`）。
- **TaskNotes 4.12.5 是否存在任务级 attachments 编辑 UI**：结论「没有」基于 `src/modals/TaskModal.ts`、`taskModalDependencies.ts`、`src/components/TaskContextMenu.ts` 的 grep（仅见 timeblock 预填），未穷尽所有 UI 文件。
- **token 字符比**属启发式估算，非一手规范，仅用于量级判断。

## 6. 一手来源清单

- 本地插件（一手）：`src/tasks/repository.ts`、`src/tasks/obsidian.ts`、`src/core/prompt.ts`、`src/report/generate.ts`、`src/types.ts`、`manifest.json`。
- TaskNotes 检出（一手）：`src/types.ts`、`src/utils/helpers.ts`、`src/utils/taskInfoAssembly.ts`、`src/bases/helpers.ts`、`src/core/FieldMapper.ts`、`src/core/defaultFieldMapping.ts`、`src/api/TaskNotesAPI.ts`、`src/api/runtime-api.ts`、`src/settings/defaults.ts`、`src/editor/ReadingModeTaskLinkProcessor.ts`、`src/editor/TaskLinkOverlay.ts`、`src/modals/TimeblockCreationModal.ts`、`src/modals/TimeblockInfoModal.ts`、`src/components/TaskContextMenu.ts`、`docs/releases/4.12.0.md`、`docs/settings/general.md`、`manifest.json`、`package.json`。
- Obsidian 平台（一手）：官方 `obsidianmd/obsidian-api` 的 `obsidian.d.ts`（`MetadataCache`、`CachedMetadata`、`Reference`/`LinkCache`/`EmbedCache`/`FrontmatterLinkCache`、`Vault.read`/`cachedRead`/`readBinary`、`resolveSubpath`）。
- Obsidian Tasks（一手）：`obsidian-tasks-group/obsidian-tasks` @ `main`（manifest `8.4.0`）：`manifest.json`、`docs/Getting Started/Links.md`、`docs/Scripting/Task Properties.md`、`docs/Getting Started/Getting Started.md`、`src/TaskSerializer/DefaultTaskSerializer.ts`、`src/Task/Link.ts`、`src/Task/LinkResolver.ts`。
- 仓库内既有调研（二手，用于交叉引用其版本与本插件来源现状）：`docs/research/obsidian-tasks-plugin-support.md`、`docs/research/obsidian-tasks-plugin-api.md`。
