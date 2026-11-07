# 状态归类新增第五档「已取消」：isSkipped 进缝，报告与筛选如实区分

来自 #76（`/grill-with-docs` 收敛，2026-11-07，Q1–Q6 全按推荐落定）。`cancelled`/`isSkipped` 类状态（`isCompleted=false`）此前被归「待办」，并经 `filterTasksBySubset` 的 open 口径（进行中 + 待办 + 未知）喂进报告的未完成子集——已取消的任务被当成没做完的写进报告，口径失真。关键事实：TaskNotes 上游状态目录除 `isCompleted` 外还暴露 `isSkipped` 语义标志（`api.catalog.statuses()` 原样返回），我们的缝在 adapter 处把它丢了。决定：**状态归类四档→五档**，新增「已取消」；判定锚上游 `isSkipped` 标志（缝内补带，改值名不影响识别），优先级 `isCompleted` > `isSkipped` > 值名 `in-progress`；报告 open 子集排除取消项，状态筛选加第四 chip「已取消」，报告新增 `{{cancelledTasks}}` / `{{cancelledCount}}` 占位符。档名取用户心智（Cancelled），不跟标志名（Skipped）。

## Considered Options

- **只修报告口径、不新增档（#76 原案候选）**：报告不撒谎了，但筛选「待办」时取消项仍混入——#75 的 chips 行刚把归类变成看得见的东西，筛选侧失真更扎眼。
- **并入「已结束」**：两头体面但两头撒谎，违背 ADR-0015「绝不谎报」的立档原则（当年否决「未完成都算进行中」是同一理由）。
- **判定锚值名清单（cancelled / skipped / abandoned…）**：与 `in-progress` 同病，改名即失效；#75 已拒绝裸值名匹配扩张。
- **等 #77 映射配置再认**：本票成 #77 下游，无限期押后；#77 自己还在 deferred。
- **不设第四 chip（照「未知」先例）**：「未知」不设 chip 是因为认不出、无档可召回；「已取消」认得出，藏掉且无提示（或让提示条谎称「未知」）都更差。
- **不加报告占位符**：取消项从子集消失后，模板作者失去如实提及它们的唯一入口（占位符表只列「模型算不准或拿不到」的信息）。
- **档名「已跳过」（Skipped）**：与上游标志名对齐，但报告语感差——用户心智是「取消」。

## Consequences

- `StatusClass` 五档；归类判定 `taskNotesStatusClass(value, isCompleted, isSkipped?)` 三参，adapter 传入 `status.isSkipped`。来源词汇不出缝的原则不变（ADR-0015 根决定不动）。
- **open 子集口径变更**：open = 未完成且未取消（进行中 + 待办 + 未知）；既有不变式 `count = completed + open` 破除——已取消不在子集二分里（未知仍计入 open，口径未变），不变式重述为三段和，测试随之重述。`{{tasks}}` 全量占位符仍含取消项。
- 状态筛选 chips 四档（多选 OR、全不选不过滤的语义不变）；「未知」提示条口径不变——取消项有档可召回，不需要提示。ADR-0021 的「三档 chip 口径」由本 ADR 扩充。
- `{{cancelledTasks}}` / `{{cancelledCount}}` 新占位符；未识别占位符原样保留的既有机制保证存量模板不受影响。
- **识别限制（如实记录）**：用户自建的取消类状态若未在 TaskNotes 勾选 `isSkipped`，仍会漏进「待办」——文档给迁移指引（去 TaskNotes 勾标志）。上游 `isSkipped` 为可选标志，缺失按未勾选处理；上游 `StatusManager.getOpenStatuses()` 是否已排除 skipped 未取证，不影响本决定，实现时核实。
- #77 的映射配置目标集合相应扩为五档（未配置仍按现行规则折叠）。
- `CONTEXT.md`「状态归类」改五档、「状态筛选」改四档；「已取消」不设独立词条（「未知」先例：档名在词条内列出）。
