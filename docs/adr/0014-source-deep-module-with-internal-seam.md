# 「来源」收成一块深 module，能力与缺失在打开时表达

「来源」的三块切片（选取、能力、仓库协议语义）决定收成**一块**深 module：interface 只有「打开来源」（判别式 已打开 | 来源缺失）与 来源能力 集合；任务身份编码、正文语义、状态判定、Tasks 行解析全部沉进实现，TaskNotes / Obsidian Tasks 两个 adapter 挂在**内部缝**后（只供该 module 自己的测试，不进 interface）。理由：来源能力（是否提供 上下文）今天靠调用方对 TaskSource 字符串比对、散在三处（`ReportModal` 两处、`filter` 一处），缝只统一了类型却没统一语义；一块深 module 使 选择任务、已加入 列表、生成 三条流程跨同一个 interface。

## Considered Options

- **三块相邻 module（选取 / 仓库协议 / 状态归一）**：各自可测，但能力与缺失仍要调用方拼装，interface 总宽度不变。
- **维持浅工厂 + 调用方判断能力**：已证明会散（三处字符串比对 + 一个位置参数）。

## Consequences

- 「来源不可用」从方法级三约定上移到打开时判别式：`list()` 不再以 `null` 表不可用，`statuses(): []` 保留为合法值（真的没有状态）。
- 任务标识：`path` 更名 `id`，缝外一律不透明；`笔记#行号` 编码与 `splitTaskPath` 留在 Tasks adapter 内部，格式断言改为唯一性断言。
- 「详情」语义统一为「喂给模型的补充材料」（见 `CONTEXT.md`）：补详情一次一批、折进仓库 module，缺详情即空串，不另设缺失形状。
- 打开后中途失效（如生成期间插件被停用、任务笔记被删）按读取失败处理，不重判 来源缺失——每次读取前重判的成本不值。
- `src/tasks/source.ts` 与 `src/tasks/obsidianSource.ts` 消失，`test/source.test.ts` 的三元测试随之删除。
- 与 ADR-0013 兼容：破例仅限 Tasks 后端的内部实现方式（metadataCache 自扫），不改 interface。
- 「可加入」等调用方不再感知来源差异；来源差异只在 来源能力 一处陈述。
