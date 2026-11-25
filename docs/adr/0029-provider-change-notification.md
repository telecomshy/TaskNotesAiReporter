# 供应商变更通知由门面发布，视图按类别失效

#107 让顶部「当前模型」卡在模型行 / 凭据变更后自动重绘，但把「变更后重绘」的义务以手工调用铺在 `src/settings/modelTab.ts` 的 10 处调用（由 7 条 `selectable` 命令覆盖）：新增一条改变「启用模型」的命令时，漏写一次重绘就静默回到旧 bug。本记录决定这条失效缝放在哪一层，以及视图如何消费它。

## Decision

- **通知归供应商门面**：`ProviderSettings.subscribe(listener: (kind) => void): () => void`；返回退订函数。沿用「视图只与门面对话」（[ADR-0012](./0012-settings-facade-mutation-time-invariants.md)）。`SettingsOwner` 仍是状态与落盘的唯一 owner（[ADR-0016](./0016-settings-owner-owns-state-and-persistence.md)），不新增全设置事件。
- **每条写命令声明类别**：`run(key, command)` 在命令执行后发布类别；`COMMAND_KINDS: Record<ProviderCommandKey, ProviderChangeKind>` 列全所有写方法，`ProviderCommandKey` 由 `ProviderSettings` 中返回 void 的方法派生。新增写方法而漏登记会编译失败。
- **三类类别**：
  - `selectable`：可能改变「启用模型」→ 设置页重绘顶部卡；
  - `layout`：卡片结构 / 当前模型 / 思考能力变了，既有调用方本来就走整页刷新 → 订阅忽略；
  - `quiet`：不影响顶卡（模型行参数、供应商改名）→ 订阅忽略。
- **发布时机与空转**：状态在 `owner.apply` 内同步改写后立即发布；空转命令（删不存在的行等）也发布，不做变更检测。
- **消费与生命周期**：`renderModelTab` 订阅并只对 `selectable` 重绘，返回退订函数；设置页在重画前、`hide()`、`display()` 开头退订并置空（旧顶卡被丢弃后不得再收到回调）。
- **既有整页刷新路径不变**：挑选确认、删除 / 新增供应商、切换当前模型、思考开关仍由调用方 `ctx.refresh()` 整页重建。

## Considered Options

- **SettingsOwner 发全设置事件**：所有 owner 消费方都能订阅，但 owner 不知道「启用模型」是什么，视图得自己筛；并会改动 ADR-0016 的 owner 契约。
- **视图内包装写命令**：不动领域层，但包装可被绕过，且没有可测的门面契约；新增命令仍可能漏接。
- **继续手工调用**：#107 的现状，正是本记录的起因。

## Consequences

- 新增一条 `selectable` 写命令只需登记类别即可获得顶卡重绘；漏登记是编译错误，不是运行期静默失效。
- 通知是粗粒度的（只带类别、不带 providerId），且不检测空转；订阅者不得据此假设「一定真的改了」。
- `layout` 命令仍依赖既有调用方整页刷新；若未来出现不整页刷新的调用方，需要重新评估该命令的类别。
- 只有设置页订阅；报告弹窗等其它门面消费方不受影响，也不被强制改动。
