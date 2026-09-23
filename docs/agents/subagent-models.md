# Sub-agent models

When a skill spawns a sub-agent (`subagent`), pin the model explicitly with the `model`
parameter, written `providerID/modelID`. **Never guess the ID** — look it up first with the
models tool (`opencode.models`).

Why pin: sub-agent output quality varies by model. A single review run must stay comparable
run to run; where we deliberately run a **pair** (`shy-code-review` 的双跑对拍), the pairing
itself is fixed below so a re-review pairs the same reviewers.

## The table

| Use case | `model` value | Notes |
| --- | --- | --- |
| `/code-review` 运行 1（两轴：Standards 和 Spec） | `deepseek/deepseek-flash` | 对拍的 A 侧。 |
| `/code-review` 运行 2（同两轴） | `xiaomi-token-plan-cn/mimo-v2.6-flash` | 对拍的 B 侧。 |
| `/code-review` 运行 3（同两轴） | `hubei-science/deepseek-v4-flash` | 对拍的 C 侧：三跑三个不同模型互查。 |
| `/code-review` 降级（某模型不可用时） | 用可用模型凑满 3 跑 | 一模型 2 跑 + 另一模型 1 跑，报告标注实际矩阵；仅剩 1 个可用模型才同模型 3 跑。 |

对拍的合并与裁决协议在 `shy-code-review` 技能里（单一事实源）；本表只管模型选择。

## Pitfalls

- **ID 会漂移，用前查证。** `deepseek/deepseek-v4-flash` 曾是正选，现在目录里已无此 ID
 （现名 `deepseek/deepseek-flash`）。此外 `deepseek-v4-flash` ≠ `deepseek-v4-flash-vision-exp`：
 带 `-vision-exp` 的是另一个模型。
- **查目录要加 `all: true`。** `xiaomi-token-plan-cn/mimo-v2.6-flash` 在默认列表里
 不显示（只见 `mimo-v2.6-pro`），差点被误判为「模型不存在」。
- If the provider blocks the response (`Provider blocked the response`), the prompt is
  probably too large — fetch inputs in smaller slices rather than switching models.
  This happened twice on `/code-review`'s Spec axis when one prompt asked for five issue
  bodies at once; splitting the fetches per issue fixed it.
- **连接失败重试一次，仍败则降级并标注**（2026-09-23 OpenCode Zen 侧 8/8
  `ConnectionRefused`，换渠道是显式决策）。A sub-agent's failure is not a fallback
  licence: if an axis cannot be reviewed independently, say so in the report. A
  self-review by the implementing agent is a different, weaker thing and must be
  labelled as such.

## Changing this table

Edit it here; `AGENTS.md` points at this file. Record *why* a model is chosen, not just
which — the choice outlives the reasoning unless you write it down.
