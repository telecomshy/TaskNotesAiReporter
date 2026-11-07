# 「选择任务」session 收敛为 frame + 七个转移，不变式内化

「选择任务」session 原有 22 个导出（17 个函数 + 5 类型；其中查询函数 9 个）近乎与其状态同宽，`TaskSelectionView` 每帧重算筛选 3–5 次，而「哪个计数进哪个标签、哪些行惰性、空态说什么」这些组合规则只活在无测试的 view 里。决定：读侧收敛为**唯一入口 `frame(session)`**——一帧一问，每次现算返回整帧（左栏行 + `state: "addable" | "joined"` 标记、计数、空态原因、右栏行、筛选摘要）；转移面冻结为 7 个具名转移（原名原签名）；9 个旧查询函数删除，其答案各归帧字段；`rangeSource ⟺ range` 不变式与 `open-custom`/`clear` 细节全部内化，`SelectionSession` 以 `unique symbol` 不透明。此决定来自 `/improve-codebase-architecture` 候选 1 的 design-it-twice 三跑裁决（最小 interface 方案为骨，借灵活性方案的行标记形状与硬封装）。

## Considered Options

- **帧内预留扩展槽（灵活性方案）**：`left.omitted[]`、`filter.status: StatusFilterSummary` 等为「状态筛选」预置形状——形状纯属猜测，YAGNI 拒绝；只留 `counts.unknownHidden` 计数位与 filter 块加字段的位置。
- **保留旧 selector 作"测试缝/特殊路径"（默认路径方案）**：读面不收敛，规则会经第二条读路再散；且「状态筛选经投影入参承载」使筛选状态分裂在 session 内外两处，归属不一致。
- **维持 17 selector 现状**：每帧 3–5 次重算与 view 里的组合规则原地不动，「状态筛选」落地时要碰第四处。

## Consequences

- `TaskSelectionView` 每帧只调一次 `frame()`（重算 3–5 → 1），render 流程不动、仅改读数来源；`getJoinedTasks()` 保留在 view 上，读 `frame.right.rows`。
- 组合规则（计数口径、惰性行、空态语义含「全部已加入不算空态」）进入投影并被测试覆盖；`test/selectionSession.test.ts` 以帧为 seam 重写，不变式用例改为断言 `filter` 回显等价式；仍无 DOM 测试。
- **无操作转移返回同一引用**成为契约（view 以 `next === session` 跳过重绘）；`switchTab` / `setQuery` 从"总是新建对象"改为此行为。
- 「状态筛选」（ADR-0021）落地时启用 `counts.unknownHidden`、在 filter 块加字段、新增转移，帧的既有形状不变。
- 与 ADR-0011 / 0019 / 0020 兼容：可加入由 session 派生、筛选只改呈现、「已加入」留在筛选结果原位。「帧 / frame」属架构词汇，不进 `CONTEXT.md`。
- **2026-11-06（#103）**：`open-custom`/`clear` 的**视图指令**经 `calendarEffect`（calendarSelection 模块）收敛为 `applyRangePick` 单一入口；状态内化归 session、控件处置归日历侧，「全部内化」的边界以此划清。
