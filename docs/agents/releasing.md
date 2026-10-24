# Releasing

Operational steps for shipping a version. The workflow lives in `.github/workflows/release.yml`; read it only when a step fails.

## Before tagging

1. Merge the PR to `main` with squash; delete the head branch.
2. `git switch main && git pull`
3. Build the next version in three places:
   - `npm version X.Y.Z --no-git-tag-version` — updates `package.json` and `package-lock.json`.
   - `manifest.json`: set `"version": "X.Y.Z"`.
   - `versions.json`: add `"X.Y.Z": "<minAppVersion>"`, using the same value as `manifest.json`'s `minAppVersion`.
4. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. `test/versions.test.ts` already fails on a package / manifest / versions mismatch.
5. Commit `chore: 发布 X.Y.Z`; push `main`.

## Publish

6. Write release notes to a temporary file. The annotated tag message becomes the GitHub release body.
7. `git tag -a X.Y.Z -F <notes-file>` — the tag must equal `manifest.json`'s `version` exactly, with no `v` prefix; use an annotated tag, not a lightweight one.
8. `git push origin X.Y.Z`
9. The `Release Obsidian plugin` workflow builds and publishes a **non-draft** release with `main.js`, `manifest.json`, and `styles.css`. Watch it:
   `gh run list --workflow release.yml`, then `gh run watch <run-id> --exit-status`.
10. Verify: `gh release view X.Y.Z --json tagName,isDraft,assets`.

## After publish

11. `npm run deploy` copies the artifacts into the local test vault; reload Obsidian.
12. The plugin is listed in the community directory. The directory scans new releases periodically; to force a check, sign in at [community.obsidian.md](https://community.obsidian.md), open the plugin, and use **Check for new releases** / **Request review**. No re-submission is needed.
13. To check the listing locally: the registry file is larger than 1 MB, so the GitHub contents API may return an empty `content`. Fetch the raw file instead:

    ```powershell
    curl.exe -sL https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json -o $env:TEMP\community-plugins.json
    Select-String -Path $env:TEMP\community-plugins.json -SimpleMatch tasknotes-aireporter
    ```

## Gotchas

- A tag that does not equal `manifest.version` is rejected by the release workflow; a `v` prefix or a typo creates an unusable release.
- A lightweight tag produces no hand-written release notes; use `git tag -a`.
- The workflow publishes directly. Do not look for a draft to publish.
- The community directory is the update surface: users see the new version in **Settings → Community plugins** after it scans, with no push notification. A one-time in-app notice is a plugin feature, not an Obsidian API.
- Do not rewrite a published tag or release; ship the next patch instead.
