# 「选择任务」视图的第二个 adapter：真实视图跑 FakeEl 的特征测试，重绘决策不抽函数

> 规格见 issue #115；起源：`/improve-codebase-architecture` 候选 5（2026-11-26 巡览，2026-11-27 grilling 两轮 11 问定案）。
> **重开 [ADR-0023](0023-selection-session-frame-interface.md) 明确接受的「仍无 DOM 测试」风险**：本记录只给视图补第二个 adapter，
> 不改该记录的「frame + 七转移」裁决，也不把重绘规则从 `render` 里搬走。
> 与 [ADR-0019](0019-inline-task-selection.md) / [ADR-0020](0020-preserve-filter-results.md)（左右分栏、已加入留在筛选结果原位）方向一致。

## Context

「选择任务」会话一侧已深且测全：`frame()` 是唯一读入口（`src/ui/selectionSession.ts:144-195`），七个具名转移冻结，`test/selectionSession.test.ts` 23.8KB 覆盖组合规则。视图 `src/ui/TaskSelectionView.ts`（561 行、二十余个私有字段）里真正的行为决策却零测试：

- **哪块重画**：`render(f, prev)`（L250-269）只决定三件事——切页签整块重跑 `renderFilter`；时间页区间 / `rangeSource` 变化刷新区间控件与文字；标题页 `query` 变化刷新解析提示。chips / 动作区 / 两栏列表 / 未知提示每帧无条件重建。
- **日历何时收起 / 重建 / 清选择**：`applyRangePick`（L507-523）按 `calendarEffect` 分派；`calendarOpen` 是视图私有状态，任何整块重建都会静默归零（L431-446）。
- **焦点落到哪一行**：`focusRowAt`（L413-418）键盘触发后移到下一可操作行，越界钳到最后一条。
- **移动端 pane**：`mobilePane`（L234-240）与右栏 `tah-selection-pane-hidden`。

其余可核验事实：时间页四个快捷周期在**渲染时**用 `new Date()` 现算（L452-459）；`CalendarWidget` 的初始显示月与「今天」标记也读真实时钟；`toDateString` 取本地时区（`src/core/dates.ts:10-15`）；`test/fakes/dom.ts` 的 FakeEl 缺 `setAttr` / `toggleAttribute` / `id` / `focus`，但其余视图与日历用到的 DOM 面已具备；先例 `test/fakes/modelTabHarness.ts` 是「真实渲染函数 + FakeEl + 不给产品代码加钩子」。

ADR-0023 成文时接受「仍无 DOM 测试」，判据是「当时视图的 seam 未扩大」。此后视图接入了 `calendarEffect`、私有交互状态增至三个（`calendarOpen` / `mobilePane` / `lastFrame`），面变大而 adapter 仍只有一个——按「一个 adapter＝假想缝、两个才算真」，这是最大的一块无自动化回归面。

## Decision

1. **第二 adapter 是「真实视图 + FakeEl」**：用 `new TaskSelectionView({ container: fakeEl as unknown as HTMLElement, … })` 构造生产类，真实 `CalendarWidget` 一并渲染进 FakeEl；交互只经 FakeEl 记录的 `click` / `keydown` 等事件驱动（点按钮、点日历格）。**不新增构造参数、不公开私有成员、不加 `forTest` 分支、不加时钟 / 焦点注入口**。若某行为不开后门就观察不到，把它当发现报回，不加钩子。
2. **FakeEl 只做加法**：在共享的 `test/fakes/dom.ts` 上补 `setAttr`（`setAttribute` 别名）、`toggleAttribute`、`id`、`focus`（记录 `focused`），语义对齐 Obsidian 扩展；现有使用 FakeEl 的测试文件零改动。另造子类会让假 DOM 分裂，换 jsdom 为几个方法引入整套运行时。
3. **`src/` 零改动**：本票只动 `test/` 与 `docs/adr/`。实施中发现真 bug → 另开 issue，本票测试按**当前行为**写并留注释指向新票。
4. **重绘决策不抽纯函数**：现状只有三条判断、一处消费者；抽 `diffFrames(prev, next)` 等于为一处调用发明一套小语义，还会把「重绘规则只有一处」拆成规则与执行两地。触发条件（任一命中再抽）：出现第三个筛选页签、出现第二处帧消费者、`render` 的 diff 分支长出第四类判断。
5. **覆盖「视图自己决定的事」全清单**：初值、七个转移的界面路径、重绘决策（元素身份）、日历生命周期、焦点恢复、空态与未知提示；**不重复** session 已有测试的计数口径、加入全部的集合语义、三维筛选叠加与 `rangeSource ⟺ range` 不变式。
6. **时钟在测试进程内钉死**：用例构造视图前 `mock.timers.enable({ apis: ["Date"] })` 到 2024-03-15 12:00 本地，结束 `mock.timers.reset()`；因此快捷周期（2024-03-11~03-17 / 03-01~03-31 / Q1 / 全年）与日历月份可精确断言。不动产品签名，正午固定避开日界与 DST 抖动。
7. **焦点证据只断正向**：`focus()` 只在自己身上记 `focused = true`；每用例新建整棵假 DOM；断言期望行 `focused === true`（含越界钳制用例），不断兄弟行、不引全局 activeElement。接受「视图请求了这一行聚焦」，不主张浏览器焦点语义。
8. **反向验证是完成条件，不是工具链**：实施时做三次手工改坏——`focusRowAt` 去掉 `Math.min`、`keep` + `complete` 不再收起日历、切页签跳过 `renderFilter`——各确认对应用例变红后还原，结果写进 PR。特征测试一写就绿，不反向验证等于没证明它守得住东西；为六组用例上变异测试工具不划算。
9. **产物**：`test/fakes/taskSelectionHarness.ts`（真视图 + FakeEl，暴露 `root` / `view` / `t` 与 `joinedIds()`）+ 单个 `test/taskSelectionView.test.ts`（按覆盖清单分组、扁平 `test("…")`、中文名、`node:test` + `assert/strict`）。

## Considered Options

- **给视图注入 `CalendarPort` / `now()` / `focusPort`**：测试需求写进产品依赖，且与「adapter 换替身、生产路径不变」的语义相反——否。
- **把 `render` / `applyRangePick` 改 public 供直调**：测试绕过用户路径，测的是调用顺序的自证——否。
- **现在抽 `diffFrames(prev, next)` 纯函数**：为一处调用造小型语义；用元素身份已能钉死三条判断——否（保留触发条件）。
- **本地子类 `SelectionFakeEl`**：假 DOM 分裂成两套语义，日后互不认——否。
- **换 jsdom**：为四个缺失方法引入整套 DOM 与布局语义，且与 Obsidian 扩展不同构——否。
- **不钉时钟、只断生命周期**：区间文字与「哪些行出现」全部让掉，留下「按钮亮了」的空断言——否。
- **FakeEl 维护全局 activeElement**：跨用例共享可变状态，收益不抵风险——否。
- **引入变异测试工具**：新依赖、分钟级全量跑，为六组用例过重——否。

## Consequences

- 视图的重绘决策、日历生命周期、焦点钳制与移动端 pane 获得回归锁；`CalendarWidget` 经真实路径覆盖，不为测试引入 port。
- **ADR-0023 的「仍无 DOM 测试」自此为假**，该记录 Consequences 补改订注记指向本记录（循 ADR-0019 → ADR-0020 的注记先例）。
- 共享 FakeEl 的 API 面扩大（`setAttr` / `toggleAttribute` / `id` / `focus`），后续视图类测试可直接复用；现有用例零改动。
- 重绘规则仍只在 `render` 一处；「何时该抽纯函数」写成可判定的触发条件，而不是模糊的「继续长大」。
- 时钟钉死只作用于测试进程全局 `Date`，不影响其它测试文件（各自用例内启用 / 重置）。
- **无运行时行为变化、无产品代码改动**；`frame` / 七转移 / `calendarEffect` 的归属不动。
- **词汇不进 `CONTEXT.md`**：adapter / harness / 特征测试属架构与测试词汇，循 ADR-0023 / 0032「架构词汇不进词表」先例。
