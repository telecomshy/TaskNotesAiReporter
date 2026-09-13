# TaskNotes AI Reporter

Generate weekly, monthly, yearly, or fully custom reports from [TaskNotes](https://github.com/callumalpass/tasknotes) tasks. Pick the tasks, choose a template, and let any OpenAI-compatible model write the report into a new note in your vault.

## Features

- Use any **OpenAI-compatible** model (DeepSeek, Qwen, Doubao, Kimi, OpenAI, …).
- Auto-select tasks by date, then add or remove tasks manually in the picker.
- Calendar range picker plus quick shortcuts (this week / month / year).
- Write each report to a new note; existing notes are never overwritten.
- Bilingual UI (English / Chinese) with a separate report output language.

## Requirements

- Obsidian **1.12.2** or newer.
- The **TaskNotes** plugin enabled (this plugin reads tasks through its public API and does not modify it).

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

1. **Model provider** — pick a preset (DeepSeek, Qwen, Kimi, MiniMax) or add a custom OpenAI-compatible provider with its base URL. For the API key, select an existing **secret** or create a new one; keys are kept in Obsidian's SecretStorage, not in the plugin's data.
2. **Current model** — choose the model used to generate reports.
3. **Report folder** — where reports are written (default `TaskNotes/Reports`).
4. **Date fields** — which date fields participate in auto-filtering (completed / due / scheduled / created).
5. **UI language** and **report language** — set independently.

## Usage

1. Click the ✨ ribbon icon or run **Generate task report** from the command palette.
2. Select tasks (by date or by title), or add them manually.
3. Optionally pick a report template, then click **Generate report** and save.

## Network use

This plugin talks only to the OpenAI-compatible endpoint(s) **you configure** (built-in presets such as DeepSeek, Qwen, Kimi, MiniMax, or a custom base URL). It sends the selected task data and the generated prompt to that endpoint to produce the report, and fetches the model list from it. No data is sent anywhere else, and the plugin collects **no telemetry**.

API keys are stored in Obsidian's **SecretStorage**; the plugin's own `data.json` stores only the secret's name.

## Development

```bash
npm install        # install dependencies
npm run dev        # watch build
npm run build      # production build (with type checking)
npm test           # run unit tests
```

Pure logic (date ranges, task filtering, filenames, prompts) lives in `src/core/` and is covered by unit tests.

## 中文说明

从 [TaskNotes](https://github.com/callumalpass/tasknotes) 任务生成 AI 报告：选择任务与模板，用任意 OpenAI 兼容模型生成周报 / 月报 / 年报或自定义报告，并写入 vault 新笔记。

- 按日期自动筛选任务，也可在界面中手动添加 / 删除。
- 日历区间选择 + 本周 / 本月 / 本年等快捷方式。
- API 密钥保存在 Obsidian 的 SecretStorage 中（设置里只保存密钥名），不在插件数据文件中明文保存。

**网络用途**：插件只会访问你自己配置的 OpenAI 兼容端点（内置 DeepSeek、通义千问、Kimi、MiniMax 预设，或自定义 Base URL），把所选任务数据与提示词发送过去以生成报告，并从该端点拉取模型列表；不会发送到其它地方，也不收集任何遥测。

安装：在「设置 → 第三方插件 → 浏览」中搜索 **TaskNotes AI Reporter** 安装并启用（需先启用 **TaskNotes** 插件）。
