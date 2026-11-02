# 代码审查子代理：模型差异 vs 运行随机性 对照实验

- 日期：2026-09-23
- 动机：`/code-review` 的子代理换用不同模型时审查结果互有增漏，需判断「双模型并集 + 主代理裁决」是否优于现状（单模型单跑 / 同模型双跑）。
- 实验与裁决执行者：主代理（`xiaomi-token-plan-cn/mimo-v2.6-pro`）。

## 固定输入

- 审查对象：`git diff b8d4911...6b058eb`（Obsidian Tasks 来源特性，26 文件 +681/−16，5 提交）。
- Spec 轴：`docs/specs/tasks-plugin-source.md` @ `6b058eb`（含 GitHub issue #27 语义）。
- Standards 轴：`CODING_STANDARDS.md` 全文 + `/code-review` 内置 Fowler 坏味基线（12 条）。
- 8 个子代理提示词除运行标签外逐字相同，互相不可见；每个子代理只做一轴，输出结构化 finding 表。

## 运行矩阵

| 标签 | 模型 | 轴 | 结果 |
| --- | --- | --- | --- |
| A1/A2 | `deepseek/deepseek-flash` | Standards / Spec ×2 | 4/4 成功 |
| B1/B2 | `xiaomi-token-plan-cn/mimo-v2.6-flash` | Standards / Spec ×2 | 4/4 成功（先通过 1 次连通性探测） |

备忘：OpenCode Zen（`opencode/mimo-v2.6-flash-free`）当时 8/8 `ConnectionRefused`，已弃用；模型目录查询需 `all: true` 才能看到
`xiaomi-token-plan-cn/mimo-v2.6-flash`（默认列表只显示 `mimo-v2.6-pro`，勿凭默认列表断言"模型不存在"）。

## 裁决规则

主代理逐条对照 `6b058eb` 时点代码（`git show`，工作树已是 HEAD）裁决：

- **成立**：引用事实为真且类别恰当，值得出现在审查报告（计入真值 V）。
- **弱成立**：事实为真但价值低或标签不精确（计入 V，单独标注）。
- **误报**：事实为假，或事实为真但不构成该类问题（规格明文允许 / 仓库先例背书 / 前置提交已满足）。

## 真值（V）：16 条（成立 7 + 弱成立 9），误报 4 条

### Spec 轴（V=6，误报 4）

| ID | 发现 | 裁决 | 报出者 |
| --- | --- | --- | --- |
| F1 | `@上下文` 输入未按规格「隐藏/禁用」，改为输入后静默剥离 `@` token | 成立 | A1 A2 B1 B2 |
| F2 | `title` 未剥 `🛫❌🔁🆔⛔🏁`，与 `readBody` 回填的 `details`（原始行）高度重复，削弱规格「详情带增量」的理由 | 成立 | A1 A2 B2 |
| F3 | 规格点名的测试对象 `createSourceRepository` 无直接测试，测的是另抽的 `selectSourceRepository` | 成立 | A1 A2 B1 B2 |
| F4 | 未新增 `generate.ts` 编排层测试 | 弱成立（既有 `test/generate.test.ts` 已用 fake repository 覆盖，`generate.ts` 本区间未改） | B1 B2 |
| F5 | `isInProgressStatus` 先排除 `isCompleted` 再判 `type`，与「type 优先」字面口径有出入 | 弱成立（仅矛盾配置下可见，且与「状态归类」四档互斥一致） | B1 |
| F7 | 新增 core 层导出 `stripContextTokens`，规格说机制落 UI 层、不改 `parseTitleQuery` | 弱成立（函数保持来源无关，放置位置可辩） | A2 |
| ~~F6~~ | 占位符 `searchPlaceholderNoContext` 越界 | **误报**：「提示『当前来源不支持上下文』」是规格要求，占位符即提示的一种 | B1 |
| ~~F8~~ | `setTaskSource` 静默归一非法值属越界 | **误报**：与既有 `setUiLanguage` 同款先例，且 ADR-0012 背书"变更处维护不变式" | B2 |
| ~~F9~~ | 区间未新增 ADR-0013 | **误报**：ADR-0013 在 `67a6a6d`（区间之前）已存在 | B2 |
| ~~F10~~ | 区间未更新 CONTEXT.md「任务」「来源」词条 | **误报**：`b8d4911`（区间之前）已更新；规格「已更新」是完成时 | B2 |

### Standards 轴（V=10，误报 0；均为坏味判断题，无硬违规）

| ID | 发现 | 裁决 | 报出者 |
| --- | --- | --- | --- |
| G1 | `"obsidian-tasks"` 来源判定字面量散落 5 处（appSettings/logic/source/ReportModal×2/generalTab） | 成立 | A1 A2 B1 B2 |
| G2 | 任务身份 `笔记#行号` 字符串往返（tasksLine 拼 ↔ tasksRepository `splitTaskPath` 拆） | 成立 | A1 A2 B1 |
| G5 | 状态形状重复：`StatusInfo` 复述 `StatusDefinition`、`"IN_PROGRESS"` 字面量未复用常量、`isInProgressStatus` 双重 `find` | 成立 | A1 A2 B1 |
| G8 | 插件查表断言 `(app as unknown as {plugins…}).plugins.plugins` 在 obsidian.ts 与 obsidianTasks.ts 重复 | 成立 | A2 |
| G3 | `createSourceRepository` 一行委托（Middle Man） | 弱成立（规格点名的接缝，接线薄是有意的） | A1 B1 B2 |
| G4 | `setTaskSource(value: string)` 门面边界丢 `TaskSource` 类型 | 弱成立（与 `setUiLanguage` 先例一致） | A2 B1 B2 |
| G6 | `stripContextTokens` 与 `parseTitleQuery` 构成第二套 @ 分词 / `core/filter` 混入来源相关变更缘由 | 弱成立 | A1 B2 |
| G7 | `content.split(/\r?\n/)` 按行拆分形状重复 | 弱成立 | B1 B2 |
| G9 | `TaskPickerModal` 构造器位置参数膨胀（9 个） | 弱成立 | A2 B2 |
| G10 | 通用 `readVaultNote` 放在 TaskNotes 适配器文件、被 Tasks 后端反向 import | 弱成立（Feature Envy 标签不准，属放置问题） | A1 |

## 指标

单跑召回（分母：轴内 V）：

| 运行 | Spec（V=6） | Standards（V=10） | 误报 |
| --- | --- | --- | --- |
| A1 | 3（强 3/3） | 6 | 0 |
| A2 | 4 | 6 | 0 |
| B1 | 4 | 6 | 1 |
| B2 | 4 | 6 | 3 |

两跑并集召回：

| 配对 | 类型 | Spec | Standards |
| --- | --- | --- | --- |
| A1∪A2 | 同模型 | 4/6（67%） | 9/10 |
| B1∪B2 | 同模型 | 5/6（83%） | 8/10 |
| A1∪B1 | 双模型 | 5/6 | 8/10 |
| A2∪B1 | 双模型 | **6/6（100%）** | 8/10 |
| A1∪B2 | 双模型 | 4/6 | 9/10 |
| A2∪B2 | 双模型 | 5/6 | 9/10 |
| 同模型均值 | | 75% | 85% |
| 双模型均值 | | **83%** | 85% |

- 4 跑全并集：Spec 6/6、Standards 10/10（两轴均 100%）。
- 共识与正确率：≥2 跑共识区 12 条全部成立（100%）；**独报区 8 条中仅 4 条成立（50%）**，4 条误报全部来自独报（B2 的 Spec 独报 3 条误报最重）。
- 同模型跑间 Jaccard（Spec：A 0.75 / B 0.33；Standards：A 0.33 / B 0.5）与跨模型（Spec ≈0.33–0.43）量级相当——**跑间波动大部分是采样随机性，不全是模型差异**。

## 结论

1. **「双模型并集 + 主代理裁决」在 Spec 轴确实更好**（83% vs 同模型 75%，最优对 100%），语义判断类发现受益于模型多样性；**Standards 轴与同模型双跑打平**（85%），机械扫描类发现跑两遍就够。
2. **收益的大头来自"跑两遍取并集"**（单跑 ≈58–60% → 双跑 75–85%），模型差异是 Spec 轴上的增量（+8pp）。
3. **裁决不可省**：裸并集误报率 25%。且裁决可以分层——共识区（≥2 跑）本样本 100% 可信，裁决火力集中在**独报区**（50% 可信），成本可控。
4. 独报区不能整批丢弃：G8/F5/F7/G10 真发现只被 1 跑报出（4/16 真值来自独报）。
5. 误报的典型成因：**只看 diff 不看仓库状态**（F9/F10），以及把"规格要求的提示"当越界（F6）。裁决时"回到仓库/规格语境"一步就能否掉。

## 局限

- n=1 个 diff、每格 n=2 跑；真值由主代理裁决，存在自证偏差（非独立裁判）。
- finding 粒度（如何合并为 G/F 编号）影响计数，规则已在上文固定。
- 提示词改进（强制逐 hunk 枚举）未在本实验变量内，收益未知。

## 建议的 /code-review 改造（待定）

每轴双跑（Spec 轴优先异模型，Standards 轴可同模型）→ 轴内并集 → 主代理按「共识免检、独报必检」逐条对照 diff 裁决 → 按轴分开报告，独报中的真发现标注来源稀有度。同步修订
`docs/agents/subagent-models.md`（`deepseek/deepseek-v4-flash` 这个 ID 已不存在；补 `all: true` 查询教训）。
