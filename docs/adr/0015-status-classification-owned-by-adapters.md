# 状态判定归各 来源 adapter，来源词汇不出缝

任务 状态归类（待办 / 进行中 / 已结束 / 未知）由各 adapter 在实现内判定，缝外只出归一取值；`StatusDefinition.type`（Tasks 的 StatusType 口径）从统一模型移除，退回 Tasks adapter 内部。同理，Tasks 行的 emoji 日期映射留在其行解析内部，不进「日期口径」的共享表。理由：今天 `status.ts` 硬编码两套来源侧字符串（`"in-progress"` 与 `"IN_PROGRESS"`）靠手工对齐，TaskNotes adapter 还丢弃 `type` 回退到状态值名判定。

> **状态**：本文收编 [ADR-0009](./0009-report-template-placeholders.md) 结尾的后果——判定规则归各 adapter，Tasks 侧用其 `status.type`（在其 adapter 内部）。但该后果记录的限制**仍然成立**：TaskNotes 的状态目录只暴露 value / 显示名 / `isCompleted`，没有状态类型字段，「进行中」在 TaskNotes 侧只能按状态值名（默认 `in-progress`）判定，用户自定义状态名后会失效。ADR-0009 其余决定不变。

## Considered Options

- **统一模型携带来源词汇（保留 `StatusDefinition.type`）**：第三来源的作者要学习 Tasks 的 StatusType 口径才能接上。
- **把「未完成」都算 进行中（借此消除值名限制）**：TaskNotes 侧改名不怕，但「待办」会混进「进行中」子集，报告口径失真。
- **用 `icon` 等启发式判 进行中**：字段可选、语义是 UI 装饰，不可靠。
- **共享的 日期口径 表携带 Tasks emoji 列**：把一个来源的存储形态焊进域表，域表不再只讲域。

## Consequences

- 状态归类 为四档：待办 / 进行中 / 已结束 / 未知——「待办」不再掉进「未知」。
- TaskNotes 侧判定：`isCompleted` → 已结束；状态值名 `in-progress` → 进行中；其余未完成 → 待办。值名限制如实保留，记录在本 ADR。
- Obsidian Tasks 侧判定：按其状态类型映射四档，类型缺失/不认识 → 未知。
- 新来源只需写一个 adapter，不必对齐任何魔法字符串。
