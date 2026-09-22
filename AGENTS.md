## Agent skills

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
