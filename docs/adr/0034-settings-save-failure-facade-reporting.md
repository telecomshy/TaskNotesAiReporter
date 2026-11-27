# 设置落盘失败由门面统一上报（命令返回 void）

> 规格见 issue #113；起源：`/improve-codebase-architecture` 候选 3（2026-11-26 巡览，拷问收口）。
> 与 [ADR-0016](0016-settings-owner-owns-state-and-persistence.md)（owner 自持状态与落盘，`apply` 把落盘 Promise 交回调用方——门面作为调用方决定统一上报，契约不动）、
> [ADR-0029](0029-provider-change-notification.md)（发布先于落盘完成，失败不回滚刷新——时序不动）衔接，不推翻任何一条。

## Context

供应商门面 17 条写命令在 `run` 内 `void owner.apply(...)` 把落盘 Promise 丢弃（`src/settings/providerSettings.ts` L579）：
保存失败时界面照常显示已生效、重启后改动消失、以 unhandled rejection 收场。姊妹门面 appSettings 的 9 条命令虽返回 Promise，
但全部 9 处视图调用点（`generalTab.ts` ×5、`templateTab.ts` ×3、`ReportModal.ts` ×1）无一例外 `void` 丢弃——
「返回 Promise」是零消费者的假能力，用户可见的静默丢数据在两个门面对称存在。owner 契约「落盘失败不被吞掉」
（`src/settings/owner.ts` L12 / L55–57）在两个门面都没有走到用户面前。

## Decision

- **门面命令一律返回 void，落盘失败由门面统一上报**：`ProviderSettings` 17 条写命令保持 void；
  `AppSettings` 9 条命令 `Promise<void>` → `void`（**与巡览票原建议方向相反**，见 Considered Options）。
  两个门面工厂各收必填依赖 `onSaveError(error: unknown)`，`run` 内 `owner.apply(...).catch(onSaveError)`。
- **接线层决定呈现**：`main.ts` 把 `onSaveError` 接成 `console.error`（留底）+ `new Notice`（用户可见，
  i18n 新键 en + zh 齐备，纯文案不带错误串）。设置模块保持无 obsidian 纯核，上报行为可单测钉住。
- **不回滚**：失败时内存状态保留已生效显示——内存与磁盘短暂分叉，用户已被告知，重启对齐磁盘。
  不做「命令前深拷贝 + 失败重发布」的回滚机制。
- **发布时序不动**（ADR-0029）：落盘失败也照常发布通知，不回滚界面刷新。
- **owner 契约不动**：`apply` 照旧交回落盘 Promise，门面作为调用方决定统一上报，正是契约允许的决定。
  owner.ts L12 注释随手修正（原「#51 会消费它」指向报告落盘失败，非设置落盘）。

## Considered Options

- **巡览票原案：`run` 返回落盘 Promise，对齐 appSettings**：类型面对齐，但视图仍是语句式调用（17 处不 await），
  失败时 unhandled rejection 原样保留、用户仍什么都看不到；换来的 Promise 能力无任何现实消费者
  （appSettings 的 9 处调用点全丢弃即证据）；且 `ProviderCommandKey` 派生（`ReturnType extends void`）要连带改型。
  对齐方向应反过来：让 appSettings 向下对齐，不是 provider 向上——否。
- **main.ts 落盘适配器内 Notice**：一处覆盖所有落盘，但 Notice 埋进接线层后「落盘拒绝测试」测不到用户真正得到的东西；
  吞错则 owner 契约死（`apply` 永远成功）、重抛则 unhandled rejection 留在每个调用点——否。
- **视图逐点处理**：30+ 处调用点各自 `.catch`，ADR-0029 的立票理由正是把这类义务从视图撤走——否。
- **失败回滚**：落盘失败是罕见事件（磁盘满 / 权限），不值得深拷贝 + 重发布的复杂度与风险，
  Obsidian 插件生态亦无此先例——否。

## Consequences

- 两个门面的每条写命令（含未来新增的）自动获得统一失败上报；漏接 `onSaveError` 是编译错误（必填依赖），
  不是运行期静默失效（循 `ProviderCommandKey` 派生的既有哲学）。
- 未来若有消费方需要「等落盘完成」（如关闭弹窗前确认已保存），须重开此案——void 签名不提供该能力。
- 落盘是整份快照：后一次成功落盘会治愈前一次失败，但失败那次的 Notice 仍会响（诚实但可能略噪）。
- 载入期落盘（`loadSettings.ts` L38 `await io.save`）失败走 `onload()` 显性报错，不在此缝；
  密钥写入（`secretStorage.setSecret` 的 void）是另一条缝，均不在本记录。
- 「落盘失败」为接线层行为，不入 `CONTEXT.md` 词表（循 ADR-0032 架构词汇不进词表先例）。
