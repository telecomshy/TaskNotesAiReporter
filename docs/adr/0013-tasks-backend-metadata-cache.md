# Obsidian Tasks 后端经 metadataCache 自扫，破例 0001 的「仅运行时公开 API」

> **状态：Superseded（2026-09-24）**——Obsidian Tasks（行内任务）来源已整体移除：行内清单能稳定提供的只有标题与勾选状态，日期/优先级是可选的书写约定，「详情」也仅是行原文，喂给模型的材料不足以产出本插件承诺的报告质量；且其「创建时间」是手写的 `➕` 而非系统创建时刻，与 TaskNotes 的同名口径语义分裂。本 ADR 仅作历史记录保留，代码中的自扫实现已删除。

本插件新增第二个「来源」——Obsidian Tasks。Tasks 插件没有公开的读取/枚举 API（`apiV1` 仅含任务行编辑，官方明确「通过 API 搜索尚不可用」，上游 issue #2459），唯一现成的 `getTasks()` 是未文档化、跨版本易变的内部方法。决定：Tasks 后端自己遍历 `app.vault.getMarkdownFiles()`，借助第一方稳定的 `app.metadataCache` 识别并解析清单行，映射为插件统一任务模型。由此对 ADR-0001 的「只走来源插件运行时公开 API」做了一次**有界破例**：仅限 Obsidian Tasks 这一后端，TaskNotes 后端仍严格走运行时 API；代价是自维护一份行解析逻辑，收益是稳定、不依赖 Tasks 内部实现。
