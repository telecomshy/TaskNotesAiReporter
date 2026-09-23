## Agent skills

### Shy 技能路由

`implement` / `implement-spec` 等链路按名调用原版技能；本仓库一律改走对等的 **shy-** 技能（三跑 / 盲评协议见各 `shy-*` 的 SKILL.md）：

| 链路点名 | 实际调用 |
| --- | --- |
| `implement` | `shy-implement`（流程副本，收尾审查走 `shy-code-review`） |
| `implement-spec` | `shy-implement-spec`（同上） |
| `code-review` | `shy-code-review` |
| `to-spec` | `shy-to-spec` |
| `to-tickets` | `shy-to-tickets` |
| `improve-codebase-architecture` | `shy-improve-codebase-architecture` |

用户点名要原版时才直调原版。

### Issue tracker

Specs and issues live as GitHub issues (via `gh`). Read `docs/agents/issue-tracker.md` before you create, read, list, comment on, label, or close an issue — or when a change needs its originating spec.

### Triage labels

Read `docs/agents/triage-labels.md` when triaging an issue or applying or removing a label; it maps the five triage roles to this repo's label strings.

### Sub-agent models

Read `docs/agents/subagent-models.md` before spawning a sub-agent. It pins which model each kind of sub-agent must use (e.g. `/code-review` runs on `deepseek/deepseek-v4-flash`) and how to resolve `providerID/modelID` without guessing.

### Domain docs

Read `docs/agents/domain.md` before exploring the codebase or naming domain concepts, and when an ADR touches the area you are changing. The domain model is the root `CONTEXT.md` plus `docs/adr/`.

### Research notes

When you research a topic — web fetches, or research delegated to a sub-agent — save the findings under `docs/research/` (one Markdown file per topic), with sources cited and the upstream version pinned.
