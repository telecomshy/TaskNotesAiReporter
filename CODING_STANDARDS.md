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
- Line endings: `core.autocrlf = true`, so CRLF in the working tree is normal and
  normalises to LF in the repo. Don't flag it.

## Indentation

Tabs for `ts`/`js`/`mjs`/`json`, held by `.editorconfig`.
