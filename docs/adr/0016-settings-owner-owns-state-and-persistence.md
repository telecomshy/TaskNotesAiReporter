# 设置 owner 自持状态与落盘

供应商与非供应商两块 设置 都由各自 owner **自持状态与落盘**：`plugin.settings` 退化为 `loadData`/`saveData` 的持久化形状，`main.ts` 的 `getState`/`commit` 逐字段镜像消失，读写只经 owner 的命令与查询。理由：[ADR-0012](./0012-settings-facade-mutation-time-invariants.md) 承诺「视图只与门面对话」，但现状四个视图（三个设置页签与生成弹窗）十余处直读 `plugin.settings`，且载入归一与变更命令各写一遍值域规则、已经漂移（`dateFields` 可被清空为空数组，重启才静默复原）。

## Considered Options

- **只抽公共值域规则、保留 main.ts 字段镜像**：漂移可修，但读写仍有三条路径，加一项设置仍要改多处。
- **按关切拆多个 owner**：接口更小但缝更多；沿用 ADR-0012「一个切片一个 owner」。

## Consequences

- 载入与变更共用同一套值域规则，「何为合法值」只有一个 owner。其中 日期口径 为空是**合法值**（= 自动筛选 关闭），载入不再把空值静默改写为默认——空是用户的正常状态，不是待修复的数据。
- `temperature` / `maxTokens` / `timeoutSeconds` 一并归口（值域与持久化），暂不加 UI——需要调参界面时另立需求。
- `main.ts` 只做接线，不再逐字段搬运；改动时不变式在变更命令处维护（沿用 ADR-0010）。
