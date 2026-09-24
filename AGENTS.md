## Agent skills

### Issue tracker

Specs and issues live as GitHub issues (via `gh`). Read `docs/agents/issue-tracker.md` before you create, read, list, comment on, label, or close an issue — or when a change needs its originating spec.

### Triage labels

Read `docs/agents/triage-labels.md` when triaging an issue or applying or removing a label; it maps the five triage roles to this repo's label strings.

### Sub-agent models

Before spawning a sub-agent, pin its `model` (`providerID/modelID`) from the matrix in `~/.config/opencode/shy-models.md` (user-level; `/shy-setup-models` generates and probes it). Name IDs only from the model catalog (`opencode.models`, add `all: true` when a model seems missing) — IDs drift.

On failure: retry a connection failure once, then degrade — fill the planned run count with reachable models and label the actual matrix in the report (a self-review by the implementing agent is a weaker substitute and must be labelled as such). When the provider blocks a response (`Provider blocked the response`), the prompt is too large: fetch inputs in smaller slices rather than switching models.

### Domain docs

Read `docs/agents/domain.md` before exploring the codebase or naming domain concepts, and when an ADR touches the area you are changing. The domain model is the root `CONTEXT.md` plus `docs/adr/`.

### Research notes

When you research a topic — web fetches, or research delegated to a sub-agent — save the findings under `docs/research/` (one Markdown file per topic), with sources cited and the upstream version pinned.
