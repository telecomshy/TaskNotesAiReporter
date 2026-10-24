# Coding standards

Read at review time, not during implementation. Conventions that tooling already
enforces — `tsc -noEmit`, `eslint` with `eslint-plugin-obsidianmd`, `.editorconfig` —
are deliberately absent from this file: skip them and review what tooling cannot see.

## Encoding

Root cause and the operational `gh` / `git` recipes live in
`docs/agents/issue-tracker.md` § *Windows encoding*. Short version: this machine
runs codepage 936 (GBK), while repo text is UTF-8.

Rules a reviewer applies to the diff:

- **Repo text is UTF-8 without BOM.** `scripts/check-encoding.mjs` blocks commits
  that break this, so a BOM reaching review means the hook was bypassed — say so.
- **Non-ASCII reaches an external tool through a file or an argv string, never a
  pipeline.** Hard violation when a script in the diff pipes Chinese into `gh` or
  `git`; cite the issue-tracker section.
- **A committed `.ps1` is either pure ASCII or UTF-8 *with* BOM.** The BOM is
  required there, not forbidden: Windows PowerShell 5.1 reads a BOM-less `.ps1` as
  ANSI, so its own Chinese literals arrive mis-decoded at run time. The checker
  enforces this, and it is the one place a BOM is correct.

## Documented exceptions

- `src/ai/request.ts` deliberately uses global timers — ADR-0002. Don't flag the
  pattern, and don't "fix" the `obsidianmd/prefer-window-timers` exemption in
  `eslint.config.mjs`.
- `src/settings/index.ts` opts out of
  `obsidianmd/settings-tab/prefer-setting-definitions`: the settings UI is fully
  custom (tab bar, provider cards, secret controls, template modal), so the
  declarative settings API doesn't apply yet. The `eslint.config.mjs` exemption
  holds until that UI is redesigned.
- Line endings: `core.autocrlf = true`, so CRLF in the working tree is normal and
  normalises to LF in the repo. Don't flag it.

## UI and CSS

- Reset native Obsidian controls with `button.<class>` (or a doubled class), and
  set `appearance`, `background`, `border`, and `box-shadow` explicitly; theme
  selectors outrank a bare class. This is a judgement call: check the control in
  the app.
- There are no DOM or visual tests. A UI change is done only after manual
  acceptance of hover, focus-visible, selected/expanded, disabled, and the state
  after a filter or tab re-render.

## Decision records

- When a new ADR partially supersedes an existing one, add a short blockquote
  banner at the top of every superseded ADR pointing to the new record (see
  ADR-0011, 0018, 0019, 0020). Keep the superseded body as historical text.

## Indentation

Tabs for `ts`/`js`/`mjs`/`json`, held by `.editorconfig`.
