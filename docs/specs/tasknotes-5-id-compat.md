# 规格：TaskNotes 5 兼容——任务标识以笔记路径归一

> **状态：已实现（2026-11-24）。** 按仓库约定本规格应落 GitHub issue；本机到 `api.github.com` 网络不可达（curl / gh 均连接超时），先以本文件作为规格副本，恢复网络后补建 issue 并回填编号。
>
> 决策背景：ADR-0001（只经 TaskNotes 运行时公开 API 读取）；跨版本事实见 `docs/research/tasknotes-plugin-fields-statuses-api.md` §7。

## Problem Statement

TaskNotes 5.0 起，运行时 API 返回的任务记录不再保证 `id` 恒为笔记路径：

- **4.x**：`buildTaskInfoFromMappedTask` 显式写 `id: path`，`path` 同时存在。
- **5.x**：该赋值被删除；`id` 只在 frontmatter 写了 `id` 属性时才有值，而且只由**新任务 / 已迁移任务**写入 UUID。存量任务不补该属性 → `id === undefined`，`path` 仍在。

本插件旧的 `createTaskRepository.list()` 过滤 `task.id`，于是升级到 TaskNotes 5 后**整库存量任务被丢弃**：选择任务列表与标题搜索全空。

实测证据（TaskNotes 5.0.3，本机 vault `D:\study\我的笔记`）：

- `TaskNotes/Tasks/*.md` 的 frontmatter 没有 `id`（`data.json` 的 `fieldMapping.id = "id"`，任务识别方式为 tag）。
- `api.tasks.list()` 返回记录的 `id` 为 `undefined`、`path` 正常。
- 上游 5.0.3 `main.js`：`listTasks()` → `getAllTasks()` → `IC()`（原 `buildTaskInfoFromMappedTask`）不再写 `id: path`；`mapFromFrontmatter` 只映射 frontmatter 中存在的 `id`。

## Solution

在 `TaskRepository` seam 内归一任务标识：**`path` 优先**（「详情」按路径读取），缺失时回退 `id`，两者皆无则跳过该记录。不做运行时版本判断；同一形状规则同时覆盖 4.8+ 与 5.x。

## Implementation Decisions

1. **兼容下限**：TaskNotes 4.8+（公开运行时 API 起点，`api.tasks.list()` 存在）与 5.x。不读 `apiVersion` / `specVersion` 做分支——版本判断会把插件与上游版本号绑死。
2. **标识优先级**：`path` > `id`。5.x 的 UUID 不能用于按路径读取详情。
3. **两者皆缺**：跳过，不合成假标识（与修复前过滤 `task.id` 的行为一致）；空白串 `trim` 后视为缺失。仅 `id`（UUID）而 `path` 缺失的记录仍进入集合，但「详情」为空——4.x / 5.x 实际不会出现该形状，回退只为不丢任务。
4. **类型**：新增 `TaskNotesTaskRecord`（`id?` / `path?`）描述 API 的原始返回；`TaskInfo.id` 仍是归一后的不透明标识，缝外不解释。
5. **记录**：不新增 ADR；跨版本事实写入 `docs/research/tasknotes-plugin-fields-statuses-api.md` §7。
6. **发布**：0.9.1 补丁版（版本号 + 发布说明 + 部署本地 vault）。

## Acceptance

- v5 形状（`path` 有、`id` 缺）：任务出现在选择列表与标题搜索中，标识为笔记路径。
- v5 形状（`path` 有、`id` 为 UUID）：标识仍为路径；「详情」不为空。
- v4 形状（`id` 与 `path` 同为路径）：行为与修复前一致（回归安全）。
- 两者皆缺：该记录不进入任务集合。
- 仅 UUID、无 `path`：仍进入集合；「详情」为空，不报错。
- `npm test` / `npm run lint` / `npm run typecheck` 全绿；对应回归测试落在 `TaskRepository` seam（不测 adapter 内部）。

## Out of Scope

- TaskNotes 3.x 及更早（无运行时公开 API）。
- 使用 5.x 新增的 `getByPath()` / `getById()` 做其它查询或改写。
- 改写报告生成、选择会话等下游语义。
