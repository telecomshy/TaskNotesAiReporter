# Sub-agent models

When a skill spawns a sub-agent (`subagent`), pin the model explicitly with the `model`
parameter, written `providerID/modelID`. **Never guess the ID** — look it up first with the
models tool (`opencode.models`), filtering by the provider column below.

Why pin: sub-agent output quality varies by model, and code review in particular needs the
same model run to run so findings stay comparable.

## The table

| Use case | `model` value | Notes |
| --- | --- | --- |
| `/code-review` (both axes: Standards and Spec) | `deepseek/deepseek-v4-flash` | The reviewer's independence is the point — keep the model constant across runs so a re-review is comparable. |

## Pitfalls

- **`deepseek-v4-flash` ≠ `deepseek-v4-flash-vision-exp`.** They are two different models on
  the same provider. The table above wants the non-`-vision-exp` one.
- If the provider blocks the response (`Provider blocked the response`), the prompt is
  probably too large — fetch inputs in smaller slices rather than switching models.
  This happened twice on `/code-review`'s Spec axis when one prompt asked for five issue
  bodies at once; splitting the fetches per issue fixed it.
- A sub-agent's failure is not a fallback licence: if an axis cannot be reviewed
  independently, say so in the report. A self-review by the implementing agent is a
  different, weaker thing and must be labelled as such.

## Changing this table

Edit it here; `AGENTS.md` points at this file. Record *why* a model is chosen, not just
which — the choice outlives the reasoning unless you write it down.
