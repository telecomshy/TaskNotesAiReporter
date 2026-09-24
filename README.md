# TaskNotes AI Reporter

Turn a set of tasks into an AI-written report note. Pick tasks from [TaskNotes](https://github.com/callumalpass/tasknotes) or the **Obsidian Tasks** plugin, choose a template, and let any OpenAI-compatible model write the report into a new note in your vault.

Weekly, monthly, and yearly are just ways to *filter* tasks. The plugin's job is to shape whatever set you pick into a report — the period label is one input, not the product.

## Features

- **Two task sources** — read tasks from **TaskNotes** or **Obsidian Tasks**, selected in settings. One source feeds a given report. TaskNotes has contexts; the Tasks source has no `@context`, so that input is disabled there.
- **Many ways to filter tasks** — the week/month/year presets are just date-range shortcuts, not the product:
  - **Date range** — a calendar range plus This week / This month / This quarter / This year shortcuts, auto-filtered by the date fields you enable (completed / due / scheduled / created).
  - **Title keyword** — bare words matched against task titles.
  - **Tag** — `#tag`, with hierarchical matching (`#work` also matches `work/…`). Available from **both** sources.
  - **Context** — `@context`. **TaskNotes only**: the Tasks source has no contexts, so this input is disabled there.
  - **Manually** — add or remove tasks in the report list.
- **Report types** — weekly, monthly, yearly, or custom. The type labels the period; the actual date range is derived from the tasks you picked.
- **Reusable templates** with placeholders (`{{tasks}}`, `{{completedTasks}}`, `{{count}}`, `{{range}}`, `{{today}}`, …), or no template at all.
- **Extra requirements** — one-off instructions for a single report; not saved.
- **Any OpenAI-compatible model** — built-in presets for DeepSeek, Qwen, Kimi, and MiniMax, or a custom base URL.
- **Secrets stay out of plugin data** — API keys live in Obsidian's SecretStorage; the plugin stores only the secret's name.
- **Never overwrites** — every report is a new note.
- **Bilingual UI** (English / Chinese) with the report language set independently.

## Requirements

- Obsidian **1.12.2** or newer.
- **Either** the **TaskNotes** plugin **or** the **Obsidian Tasks** plugin enabled, matching whichever **Task source** you select. The plugin reads tasks through those plugins' runtime APIs and does not modify them.

## Installation

### From the community plugins directory

1. Open **Settings → Community plugins → Browse**.
2. Search for **TaskNotes AI Reporter** and install it.
3. Enable the plugin.

### Manual

1. Build (or use the built artifacts):

   ```bash
   npm install
   npm run build
   ```

2. Copy `main.js`, `manifest.json`, and `styles.css` into `<your vault>/.obsidian/plugins/tasknotes-aireporter/`.
3. Enable **TaskNotes AI Reporter** in **Settings → Community plugins**.

## Setup

Open **Settings → Community plugins → TaskNotes AI Reporter**:

1. **Task source** — `TaskNotes` or `Obsidian Tasks`.
2. **Model provider** — pick a preset (DeepSeek, Qwen, Kimi, MiniMax) or add a custom OpenAI-compatible provider with its base URL. For the API key, select an existing **secret** or create a new one; keys are kept in Obsidian's SecretStorage, not in the plugin's data.
3. **Current model** — choose the model used to generate reports.
4. **Report output folder** — where reports are written (default `TaskNotes/Reports`).
5. **Date fields** — which date fields participate in auto-filtering: completed, due, scheduled, created.
6. **Report templates** — add, edit, and delete templates; the editor lists the available placeholders.
7. **Interface language** and **Report language** — set independently, plus **Monday as week start**.

## Usage

1. Click the ✨ ribbon icon or run **Generate task report** from the command palette.
2. Select tasks — **By date** or **By title** — or add them manually. The list shows exactly what will be reported.
3. Optionally pick a template and fill in extra requirements.
4. Click **Generate report**; it is saved as a new note in the report folder.

## Network use

This plugin talks only to the OpenAI-compatible endpoint(s) **you configure** (built-in presets such as DeepSeek, Qwen, Kimi, MiniMax, or a custom base URL). It sends the selected task data and the generated prompt to that endpoint to produce the report, and fetches the model list from it. No data is sent anywhere else, and the plugin collects **no telemetry**.

API keys are stored in Obsidian's **SecretStorage**; the plugin's own `data.json` stores only the secret's name.

## Development

```bash
npm install        # install dependencies
npm run dev        # watch build
npm run build      # production build (with type checking)
npm run deploy     # build, then copy the artifacts into your local test vault
npm run lint       # ESLint (fails on warnings)
npm run typecheck  # tsc -noEmit
npm test           # run unit tests
```

`npm run deploy` copies `main.js` / `manifest.json` / `styles.css` into the vault's plugin folder (never `data.json`). It finds your vault via `$OBSIDIAN_VAULT`, or the open vault in Obsidian's `obsidian.json`.

Pure logic (date ranges, task filtering, filenames, prompts) lives in `src/core/` and is covered by unit tests. Reading tasks is source-agnostic behind a `TaskRepository` seam, with one adapter per source under `src/tasks/`.

## 中文说明

把选中的任务变成一份 AI 报告笔记：任务可来自 [TaskNotes](https://github.com/callumalpass/tasknotes) 或 **Obsidian Tasks**，选好任务与模板，用任意 OpenAI 兼容模型生成报告并写入 vault 新笔记。

周报 / 月报 / 年报只是**筛选任务**的方式之一——插件的核心动作是把选中的任务集合塑造成一份报告，周期只是其中一个输入。

- **两种任务来源**：在设置中选择 TaskNotes 或 Obsidian Tasks，一份报告只读一个来源。TaskNotes 有「上下文」，Tasks 来源没有 `@上下文`，该输入会被禁用。
- **多种筛选任务方式**——周 / 月 / 年只是日期区间的快捷方式，不是产品本身：
  - **按日期**：日历区间 + 本周 / 本月 / 本季度 / 本年快捷方式，并按所选日期口径（完成 / 到期 / 计划 / 创建）自动筛选；
  - **按标题关键字**：裸词匹配任务标题；
  - **按标签**：`#标签`，支持层级前缀匹配（`#work` 也命中 `work/…`）；**两种来源都可用**；
  - **按上下文**：`@上下文`，**仅 TaskNotes**——Tasks 来源没有上下文，该输入会被禁用；
  - **手动**：在报告列表中增删任务。
- **报告类型**：周报 / 月报 / 年报 / 自定义——类型只标注周期口径，实际日期范围由所选任务推导。
- **模板**支持占位符（`{{tasks}}`、`{{completedTasks}}`、`{{count}}`、`{{range}}`、`{{today}}` 等），也可不选模板。
- **附加要求**：只作用于本次报告，不保存。
- **密钥**保存在 Obsidian 的 SecretStorage 中（设置里只存密钥名），不在插件数据文件中明文保存。
- 每份报告写入新笔记，**不覆盖**已有笔记。
- 界面语言与报告语言相互独立，另有「周一为一周起点」开关。

**网络用途**：插件只会访问你自己配置的 OpenAI 兼容端点（内置 DeepSeek、通义千问、Kimi、MiniMax 预设，或自定义 Base URL），把所选任务数据与提示词发送过去以生成报告，并从该端点拉取模型列表；不会发送到其它地方，也不收集任何遥测。

**安装**：在「设置 → 第三方插件 → 浏览」中搜索 **TaskNotes AI Reporter** 安装并启用，并按所选来源启用 **TaskNotes** 或 **Obsidian Tasks**。
