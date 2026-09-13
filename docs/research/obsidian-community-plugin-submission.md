# Publishing a third-party plugin to the Obsidian Community Plugin directory — exact process (primary sources)

- **Question**: What is the exact, current end-to-end process for publishing a third-party plugin to the Obsidian Community Plugin directory (the in-app "Community plugins" browser), and what does `telecomshy/TaskNotesAiReporter` still need to satisfy it?
- **Scope**: Investigation only. No source, config, test, build, or manifest file was changed. Only this Markdown file was created.
- **Chosen notes path**: `docs/research/obsidian-community-plugin-submission.md`, matching the existing `docs/research/obsidian-plugin-i18n.md` convention (that sibling file already established `docs/research/` as the notes location).
- **Method** (primary sources only; no blog posts or third-party write-ups). Note: `docs.obsidian.md` renders client-side, so the owning Markdown was read from the source repo `obsidianmd/obsidian-developer-docs@main` via the GitHub API; the canonical `docs.obsidian.md/...` URL is cited alongside each page.
  - `obsidianmd/obsidian-developer-docs@main`: `en/Plugins/Releasing/Submit your plugin.md`, `en/Plugins/Releasing/Release your plugin with GitHub Actions.md`, `en/Plugins/Releasing/Plugin guidelines.md`, `en/Plugins/Releasing/Beta-testing plugins.md`, `en/Community directory/Developer policies.md`, `en/Community directory/Submission requirements for plugins.md`, `en/Community directory/Set up and claim.md`, `en/Community directory/Manage your plugin or theme.md`, `en/Community directory/Frequently asked questions.md`, `en/Reference/Manifest.md`, `en/Plugins/Guides/Store secrets.md`, `en/Plugins/Getting started/Anatomy of a plugin.md`.
  - `obsidianmd/obsidian-releases@master`: `README.md`, `community-plugins.json`, `.github/pull_request_template.md`, `.github/workflows/mirror-community-json.yml`, `plugin-review.md`.
  - `obsidianmd/obsidian-sample-plugin@master`: `manifest.json`, `versions.json`, `package.json`, `README.md`, `.github/workflows/release.yml`, `version-bump.mjs`, `esbuild.config.mjs`, `.gitignore`.
  - `obsidianmd/eslint-plugin@master`: `README.md`.
  - This repo: `manifest.json`, `versions.json`, `package.json`, `README.md`, `.gitignore`, `esbuild.config.mjs`, `main.ts`, `src/**/*.ts`.
  - Live GitHub state of `telecomshy/TaskNotesAiReporter` via `gh api` (default branch, detected license, tags, releases, root contents).

This document separates **Verified facts** (each with an owning source) from **Recommendations** (inference, explicitly marked).

---

## TL;DR

- **The flow you may have read about — fork `obsidianmd/obsidian-releases`, add a line to `community-plugins.json`, open a PR — is no longer the documented process.** Submissions now go through the web directory at `community.obsidian.md`, and `community-plugins.json` is machine-mirrored into `obsidian-releases` every hour by a GitHub Action. (Verified; see F1/F7.)
- **What still matters is identical**: a public repo with `README.md`, a `LICENSE`, and a valid `manifest.json`; a GitHub release whose tag equals the manifest `version`, carrying `main.js`, `manifest.json`, and (optional) `styles.css`. (Verified; F2–F4.)
- **This repo is close but not submittable as-is.** The concrete blockers are: **no `LICENSE` file** (GitHub reports the license as `null`), **no git tag and no GitHub release at all**, a **release workflow is not set up**, and **`versions.json` contradicts `manifest.json`** (`"0.1.0": "0.12.0"` vs `minAppVersion: "1.12.2"`). (Verified; F14 + Gaps.)

---

## 1. Verified facts

### F1. The submission channel is now the web directory, not a PR

- "If you want to share your plugin with the Obsidian community, the best way is to submit it to the Obsidian Community directory at [community.obsidian.md](https://community.obsidian.md)." (Source: `obsidianmd/obsidian-developer-docs@main:en/Plugins/Releasing/Submit your plugin.md:8`; canonical <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>.)
- Step 3 of the walkthrough is: sign in at `community.obsidian.md` with an Obsidian account → link your GitHub account → "Add your plugin" via the submission form. There is **no fork/PR step**. (Source: same file, lines 49–57; `en/Community directory/Set up and claim.md:82-98`.)
- The directory "processes the `manifest.json` at the HEAD of your repository's default branch"; the `id` must be unique across all published plugins and "can't contain `obsidian`". (Source: `Submit your plugin.md:57`.)
- There is no `CONTRIBUTING.md` in `obsidian-releases`, and its README explicitly says the repo "does not accept issues" and points to `docs.obsidian.md` for submissions. (Source: `obsidianmd/obsidian-releases@master:README.md:7-11`.)

### F2. Exact end-to-end submission flow (current)

Owning sources: `en/Plugins/Releasing/Submit your plugin.md:12-72`, `en/Plugins/Releasing/Release your plugin with GitHub Actions.md`, `en/Community directory/Set up and claim.md:82-98`, `en/Community directory/Manage your plugin or theme.md:19-29`, `obsidian-releases/README.md:17-25`.

1. **Prerequisites**: a GitHub account and an Obsidian account. (`Submit your plugin.md:12-17`)
2. **Prepare the repo root**: a `README.md` describing purpose/usage, a `LICENSE`, and a `manifest.json`. (`Submit your plugin.md:19-27`)
3. **Comply** with the Developer policies and the Submission requirements. (`Submit your plugin.md:27`)
4. **Publish the source** to a public GitHub repo (skip if you used a template repo). (`Submit your plugin.md:29-34`)
5. **Create the release**: set `version` in `manifest.json` to a SemVer `x.y.z`; create a GitHub release whose tag **exactly equals** that version (no `v` prefix); upload `main.js`, `manifest.json`, and `styles.css` (optional) as binary assets. (`Submit your plugin.md:36-48`; `obsidian-sample-plugin@master:README.md:32-36`)
6. **Submit through the directory**: `community.obsidian.md` → sign in → connect GitHub (read-only, required) → **Plugins → New plugin** → enter the repository URL and owner → agree to the Developer policies → **Submit**. (`Set up and claim.md:34-38,82-98`)
7. **Automated review**: after submission/each release the directory scans manifest, release assets, source, and build; errors block installability, warnings do not. (`Manage your plugin or theme.md:19-29`; `Frequently asked questions.md:64-66`)
8. **Publish**: once errors are resolved, users install from within Obsidian, which reads the directory list and downloads assets from the matching GitHub release. (`Submit your plugin.md:59-65`; `obsidian-releases/README.md:17-25`)
9. **Announce** (optional): forum "Share & showcase", Discord `#updates`. (`Submit your plugin.md:67-72`)

### F3. What must be true of the FIRST release before submitting

- Public GitHub repo the reviewer can access. (`Submit your plugin.md:29-34`)
- Root `README.md`, `LICENSE`, `manifest.json`. (`Submit your plugin.md:21-25`; `Developer policies.md:44-48` requires a LICENSE file)
- A GitHub release exists whose tag equals `manifest.version`. (`Submit your plugin.md:41`; `obsidian-sample-plugin/README.md:34`)
- Required assets attached to that release (see F4).
- Manifest and release are consistent: the directory processes manifest at HEAD; the installer "downloads `main.js`, `manifest.json`, and `styles.css` from the GitHub release whose tag matches the `version` in your manifest". (`Submit your plugin.md:57-59`)
- `versions.json` maps the released plugin version to its minimum app version so older apps can be served a compatible older build. (`obsidian-releases/README.md:23`; `obsidian-sample-plugin/README.md:32-33`)
- Follow the policies/guidelines (F8/F9). BRAT is **not** a prerequisite; it is an optional pre-submission beta channel (F11).

### F4. Required release assets and filenames

- "Upload the following plugin assets to the release as binary attachments: `main.js`, `manifest.json`, `styles.css` (optional)." (Source: `Submit your plugin.md:43-47`.)
- Filenames are literal and unprefixed; there is no version in the filenames. The release automation uploads exactly these names. (Source: `Release your plugin with GitHub Actions.md:41-51`; `obsidian-sample-plugin/.github/workflows/release.yml:47-50`.)
- `manifest.json` must exist in **two** places: repo root and the release assets. (Source: `obsidian-sample-plugin/README.md:35`.)

### F5. `manifest.json` rules

Owning source: `en/Reference/Manifest.md` (<https://docs.obsidian.md/Reference/Manifest>).

- Required for plugins: `author`, `minAppVersion`, `name`, `version`, `description`, `id`, `isDesktopOnly`. `authorUrl` and `fundingUrl` are optional. (`Manifest.md:11-28`)
- `version`: SemVer in the format `x.y.z`. (`Manifest.md:16`; `Submit your plugin.md:40`)
- `id`: "must contain only lowercase letters and hyphens, can't end with `plugin`, and can't contain `obsidian`." It must be unique across all published plugins, and for local development it should match the plugin folder name. (`Manifest.md:27,31`; `Submit your plugin.md:57`)
- `minAppVersion`: "the minimum required version of the Obsidian app that your plugin is compatible with. If you don't know … use the latest stable build number." (`Submission requirements for plugins.md:17-20`)
- `name`: unique; prefer English/Basic Latin; no punctuation except hyphens/plus/parentheses, no emoji; must not use Obsidian core feature names or contain "Obsidian"/"Plugin". (`Manifest.md:40-45`)
- `description`: start with an action statement, follow the style guide, ≤250 characters, end with a period, avoid emoji/special characters. (`Submission requirements for plugins.md:22-40`)
- Don't put the plugin id inside your command ids — Obsidian prefixes them automatically. (`Submission requirements for plugins.md:54-57`)
- `isDesktopOnly` must be `true` if any Node.js/Electron API is used. (`Submission requirements for plugins.md:42-52`)

### F6. `versions.json` rules

- It maps **plugin version → minimum Obsidian version**: "Obsidian will consult `versions.json` to find the latest version of your plugin that is compatible" when the repo `manifest.json` requires an app newer than the user's. (Source: `obsidian-releases/README.md:23`.)
- The official sample documents the exact shape as `"new-plugin-version": "minimum-obsidian-version"` so "older versions of Obsidian can download an older version of your plugin that's compatible." (Source: `obsidian-sample-plugin/README.md:33`.)
- The first-party `version-bump.mjs` writes it as `versions[targetVersion] = minAppVersion`, and only adds the key if it is not already present. (Source: `obsidian-sample-plugin@master:version-bump.mjs:11-16`.)
- Sample shape: `{ "1.0.0": "1.0.0" }`. (Source: `obsidian-sample-plugin@master:versions.json`.)

### F7. `community-plugins.json` and the legacy PR flow (superseded)

- The file still exists and Obsidian still reads it: "Obsidian will read the list of plugins in `community-plugins.json`" (fields used: `name`, `author`, `description`; plus `id` and `repo`). (Source: `obsidian-releases/README.md:17-25`.)
- **But it is now machine-generated.** `.github/workflows/mirror-community-json.yml` runs hourly (`cron: "17 * * * *"`), fetches `https://community.obsidian.md/assets/community-plugins.json`, validates it (top-level array; required string fields `id`, `name`, `repo`, `author`, `description`; `repo` must match `owner/name`; no duplicate `id`s), and commits it to `community-plugins.json` as "Obsidian Bot". (Source: `obsidianmd/obsidian-releases@master:.github/workflows/mirror-community-json.yml`.)
  - **Consequence (verified)**: a manually edited `community-plugins.json` PR would be overwritten by the mirror on its next run. The current owning docs never instruct you to edit this file.
- The old review doc in that repo is now a redirect: "Its content has moved to [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)". (Source: `obsidian-releases@master:plugin-review.md`.)
- The `obsidian-releases` `pull_request_template.md` only offers legacy `.github` templates pointing at `?template=plugin.md` / `?template=theme.md`, and neither file exists at the default branch (`gh api … .github/PULL_REQUEST_TEMPLATE/plugin.md` → HTTP 404). This is dead/legacy plumbing, not the submission path.
- The sample plugin README still says "Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin" — **this line is stale** and contradicts the canonical `Submit your plugin.md`. Treat the developer docs (and the mirror workflow) as owning the current process. (Source: `obsidian-sample-plugin@master:README.md:41-46`.)

### F8. Developer policies — the hard must/must-not list

Owning source: `en/Community directory/Developer policies.md` (<https://docs.obsidian.md/Community+directory/Developer+policies>).

Must **not**:
- Obfuscate code to hide its purpose. (`:21-23`)
- Insert dynamic ads loaded over the internet. (`:24`)
- Insert static ads outside the plugin's own interface. (`:25`)
- Include client-side telemetry. (`:26`)
- Install or update themselves or their dependencies (no self-update code). (`:27`)
- (Themes) load assets from the network. (`:28`)

Only allowed **if clearly indicated in the README** (disclosures):
- Payment required for full access; account required for full access. (`:30-40`)
- **Network use** — "Clearly explain which remote services are used and why they're needed." (`:36`)
- Accessing files outside Obsidian vaults. (`:37`)
- Static ads within the plugin's own interface. (`:38`)
- Server-side telemetry with a linked privacy policy. (`:39`)
- Close-sourced code (case-by-case). (`:40`)

Copyright/licensing:
- "Include a [LICENSE file] and clearly indicate the license." (`:44-46`)
- Comply with licenses of code you use; attribute as required. (`:47`)
- Respect Obsidian's trademark policy; don't imply first-party. (`:48`)
- Forks are restricted (not relevant here: this is a companion plugin, not a fork). (`:50-61`)

### F9. Plugin guidelines — concrete things reviewers flag

Owning source: `en/Plugins/Releasing/Plugin guidelines.md` (<https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>). These are "recommendations" but "depending on their severity, we may still require you to address any violations" (`:3`).

- Avoid the **global `app` object** (`app` / `window.app`); use `this.app`. (`:10-14`)
- Avoid unnecessary `console.log`; debug messages shouldn't ship. (`:16-19`)
- Organize multi-file code into folders. (`:21-23`)
- Rename sample placeholders (`MyPlugin`, `MyPluginSettings`, `SampleSettingTab`). (`:25-27`)
- UI text: only add settings headings when >1 section; no "settings" in headings; use Sentence case; use `Setting.setHeading()` instead of `<h1>/<h2>`. (`:33-75`)
- Security: avoid `innerHTML`/`outerHTML`/`insertAdjacentHTML`; build DOM with `createEl`/`createDiv`/`createSpan`. (`:76-94`)
- Resource management: clean up listeners via `registerEvent`/`addCommand`; don't detach leaves in `onunload`. (`:96-121`)
- Commands: avoid default hotkeys; use `callback`/`checkCallback`/`editorCallback` appropriately. (`:123-138`)
- Workspace: avoid `workspace.activeLeaf`; use `getActiveViewOfType`/`activeEditor`. (`:140-163`) Don't store custom-view references. (`:165-190`)
- Vault: prefer Editor API over `Vault.modify` for the active file; prefer `Vault.process` for background edits; prefer `FileManager.processFrontMatter`; **prefer the Vault API over the Adapter API**; don't iterate all files to find one by path; use `normalizePath()` for user paths. (`:192-275`)
- Styling: no hardcoded inline styling; use CSS classes + Obsidian CSS variables. (`:309-339`)
- TypeScript: prefer `const`/`let`; prefer `async/await` over `.then()`. (`:341-378`)

### F10. Automated review / first-party linter

- Review sections are **Manifest**, **Releases**, **Source code**, **Build verification**; each result is **Error**, **Warning**, **Recommendation**, or **Pass**. (Source: `en/Community directory/Frequently asked questions.md:64-66`; mirrored in `Manage your plugin or theme.md:19-29`.)
- The scanner runs the first build script it finds, in this order: **`build`, `build:plugin`, `compile`**, and "that's what gets evaluated". (Source: `FAQ.md:68-70`.)
- The scanner ignores a fixed list of paths/globs, including `node_modules, dist, build, pkg, test-vault, .pnpm-store, .obsidian, esbuild.config.mjs, version-bump.mjs, automation, *.test.*, *.tests.*, *.spec.*, test, tests, __tests__, testUtils, e2e-tests, mocks, __mocks__, *.cjs, *.mjs, *.cts, *.mts, vite, scripts, docs, i18n, i18next, locale, locales, translations, l10n`. (Source: `FAQ.md:72-84`.)
- License detection is via GitHub: a "repository does not have a recognized license" warning appears if GitHub reports **Custom license** or the file couldn't be matched. (Source: `FAQ.md:86-90`.)
- Local pre-check: install the official linter `obsidianmd/eslint-plugin`; the FAQ says "Install the official ESLint plugin. Its README covers how to install and set it up." (Source: `FAQ.md:104-106`; rules list: `obsidianmd/eslint-plugin@master:README.md:63-119`.) Relevant rules include `validate-license`, `validate-manifest`, `no-unsupported-api` (keyed to `minAppVersion`), `no-nodejs-modules`, `no-sample-code`, `sample-names`, `no-global-this`, `no-static-styles-assignment`, `prefer-window-timers`, `prefer-create-el`, `vault/iterate`, `settings-tab/*`, `ui/sentence-case`.
- You can preview a scan before releasing via **Review branch** (branch/tag/SHA), and force a recheck with **Request review**. (Sources: `Manage your plugin or theme.md:23,27`; `FAQ.md:96-102`.)

### F11. Review timing, rejection, and the BRAT path

- The primary docs specify **no fixed review duration or SLA**. The review is presented as automated and recurring: it "checks for new releases periodically", and you can force it with **Check for new releases** / **Request review**. (Sources: `FAQ.md:96-98`; `Manage your plugin or theme.md:15,23`.)
- On failure: "Address any items in your repository, then publish a new release to trigger a fresh review." Warnings don't block. (Source: `Manage your plugin or theme.md:19-25`.)
- If rejected, the fix loop is: correct the repo → bump version → publish a new GitHub release. (`Submit your plugin.md:61-65`)
- **BRAT is optional and pre-submission only**: "Before you submit your plugin, you may want to let users try it out first. While Obsidian doesn't officially support beta releases, we recommend … BRAT." (Source: `en/Plugins/Releasing/Beta-testing plugins.md:1-3`; also `obsidian-releases/README.md:31-32`.)

### F12. Ongoing release process going forward

- Bump `manifest.json` version and `minAppVersion`; add the new `versions.json` mapping (`"new-plugin-version": "minimum-obsidian-version"`); create a GitHub release with the exact version as the tag; attach `manifest.json`, `main.js`, `styles.css`; publish. (Source: `obsidian-sample-plugin/README.md:30-39`.)
- The sample recommends automating the bump with `npm version patch|minor|major` wired to `version-bump.mjs`, which updates `manifest.json` and `versions.json` (and `package.json` via npm). (Sources: `obsidian-sample-plugin/README.md:38-39`; `version-bump.mjs:1-17`.)
- The documented automation is a tag-triggered GitHub Action (`.github/workflows/release.yml`) that installs, runs `npm run build`, attests provenance, and creates a **draft** release with `main.js manifest.json styles.css`. (Source: `en/Plugins/Releasing/Release your plugin with GitHub Actions.md:3-53,63-83`; current first-party template: `obsidian-sample-plugin/.github/workflows/release.yml`.)
- Updating an already-published plugin requires **no re-submission** — a new release is enough. (Source: `FAQ.md:17-19`; `Submit your plugin.md:10`.)

### F13. Plugins that call external APIs (this plugin's case)

- **Network use must be disclosed in the README**, naming which remote services are used and why. (`Developer policies.md:36`)
- **No client-side telemetry**, and **no self-update/dependency-update code**. (`Developer policies.md:26-27`)
- API keys must not be committed. Storing keys in `data.json` is plaintext; the first-party guidance is to use `SecretStorage`/`SecretComponent` so secrets live in a vault-keyed central store and the plugin stores only the secret's *name*. (`en/Plugins/Guides/Store secrets.md:22-32,81,96`.)
- Use `requestUrl` (Obsidian's HTTP helper, shown in the guidelines) rather than Node `http`/`fs`; if you use Node/Electron APIs you **must** set `isDesktopOnly: true`. (`Plugin guidelines.md:355,369`; `Submission requirements for plugins.md:42-52`.) `requestUrl` is the mobile-safe choice and does not force desktop-only.
- Service-specific: Obsidian does not host or proxy your endpoint; the plugin talks to whatever base URL the user configures. This falls under the README network disclosure above.

### F14. This repo's current state (verified from files and live GitHub)

- `manifest.json`: `id` `tasknotes-aireporter` (lowercase/hyphens, no `obsidian`, doesn't end `plugin`); `version` `0.1.0` (SemVer `x.y.z`); `minAppVersion` `1.12.2`; `isDesktopOnly` `false`; `author`/`authorUrl` present; `description` is 132 chars, starts with "Generate reports…" and ends with a period, but contains **two em dashes** (`manifest.json:3-9`).
- `versions.json`: `{ "0.1.0": "0.12.0" }` (`versions.json:1-3`) — **does not match** `manifest.json` `minAppVersion` of `1.12.2`. The sample contract is `pluginVersion → minAppVersion`, so this should be `"1.12.2"` (or the manifest changed) (`versions.json` vs `sample-plugin/version-bump.mjs:11-16`).
- `package.json`: `license` `MIT`; build script `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`; test uses `node --test` + `tsx` (`package.json:6-21`).
- Root outputs present: `main.js`, `manifest.json`, `styles.css`, `versions.json`, `README.md`. **No `LICENSE`**, **no `.github/`**.
- `.gitignore` deliberately **keeps `main.js` committed** ("保留 main.js 便于直接部署"); the official sample does the opposite (`.gitignore`: "Don't include the compiled main.js file in the repo … uploaded to GitHub releases instead") (`this repo .gitignore:10-11`; `sample-plugin/.gitignore`).
- `esbuild.config.mjs` sets `minify: prod` (`esbuild.config.mjs:40`) — matches the official sample (`sample-plugin/esbuild.config.mjs:41`), so minification is the norm, not a violation.
- No Node/Electron APIs: HTTP goes through `requestUrl` (`src/ai/transport.ts:6,10-11`); vault access uses `app.vault` with `app` passed explicitly as a parameter (`src/report/writer.ts:32-64`, `src/tasks/obsidian.ts:25-46`); no global `app`. `isDesktopOnly: false` is consistent.
- It reads tasks via another plugin's runtime object: `app.plugins.plugins["tasknotes"].api` (`src/tasks/obsidian.ts:12-22`), and the README declares the TaskNotes dependency (`README.md:21-23`).
- API keys are stored in plugin settings / `data.json` in plaintext (`src/types.ts:77,94,160`; `src/settings/modelTab.ts:121-124`); no `SecretStorage` usage.
- Lint-relevant patterns: `document.createElement` for `<optgroup>/<option>` (`src/settings/modelTab.ts:65,68`); direct `.style.display` assignments (`src/settings/modelTab.ts:117,132,137,142,172-173,407,462,510-511`, `src/ui/TaskPickerModal.ts:304`); bare `setTimeout` (`src/ai/client.ts:205-207`); `read(file as TFile)` cast (`src/tasks/obsidian.ts:41`); `app.vault.adapter.exists(...)` (`src/report/writer.ts:44,53`).
- `README.md` is Chinese, opens with an AIGC YAML frontmatter block, and has no explicit "Network use" disclosure section (`README.md:1-14`).
- Live GitHub (`telecomshy/TaskNotesAiReporter`): `visibility: public`, `default_branch: main`, `license: null` (GitHub detects no license), **no tags**, **no releases** (`gh api repos/telecomshy/TaskNotesAiReporter`, `gh release list`, `gh api .../tags`).

---

## 2. Recommendations (inference)

- **R1. Do not open a PR to `obsidian-releases`.** The current owning docs route you through `community.obsidian.md`, and the hourly mirror would overwrite any `community-plugins.json` edit. Use the web submission form. (Inference from F1/F7.)
- **R2. Add a real `LICENSE` file.** `package.json` says MIT, but no file exists and GitHub reports no license. Add `LICENSE` with the MIT text and a correct copyright line so both the policy requirement and the scanner's `validate-license` check pass. (From F8/F10/F14.)
- **R3. Fix `versions.json` before submitting.** Make `versions.json["0.1.0"]` equal `manifest.json`'s `minAppVersion` (`1.12.2`), matching the first-party contract. (From F6/F14.)
- **R4. Add the tag-triggered release workflow** so the first release can be produced reproducibly, and so the scanner's "Build verification" has a committed build script to evaluate. Use the current first-party template (below).
- **R5. Make the first release** at tag `0.1.0` with assets `main.js`, `manifest.json`, `styles.css`.
- **R6. Add an explicit Network use disclosure** to the README: state that the plugin sends the selected task data and prompt to the user-configured, OpenAI-compatible endpoint (and fetches the model list from it), and that no telemetry is collected. Consider an English section since the directory reviewers/listing are English. (From F8/F13.)
- **R7. Move the API key to `SecretStorage`** (store the secret name, resolve with `app.secretStorage.getSecret`). Not a documented hard policy, but it is the first-party recommendation and removes a plaintext-secret finding. (From F13.)
- **R8. Stop committing `main.js`.** Build outputs belong to the GitHub release; committing them risks a build-verification mismatch and is contrary to the sample's `.gitignore`. Add `main.js` to `.gitignore`. (From F14.)
- **R9. Pre-run `obsidianmd/eslint-plugin`** and address its warnings (the DOM/style/timer/cast/Adapter patterns in F14) before submitting. (From F10.)
- **R10. Drop the em dashes from the manifest description** and re-check the ≤250-char, sentence-case, no-special-character rules; the description is otherwise compliant. (From F5.)
- **R11. Optional**: publish a beta via BRAT first; nothing about BRAT is required for submission. (From F11.)

---

## 3. Submission checklist specific to THIS plugin

Legend: **[OK]** satisfied today · **[TODO]** missing / must happen · **[FIX]** present but not compliant.

1. **[OK] Public GitHub repo** — `telecomshy/TaskNotesAiReporter`, `visibility: public`, default branch `main`.
2. **[OK] Root `manifest.json`** with all required plugin fields (`manifest.json:1-10`).
3. **[OK] `id` rules** — `tasknotes-aireporter`: lowercase + hyphens, no `obsidian`, doesn't end in `plugin`.
4. **[OK] `version` semver** — `0.1.0`.
5. **[FIX] `versions.json` matches manifest** — change `{"0.1.0": "0.12.0"}` → `{"0.1.0": "1.12.2"}`.
6. **[OK] `description`** starts with an action, ≤250 chars, ends with a period.
7. **[FIX] `description` special chars** — remove the two em dashes.
8. **[OK] `author` + `authorUrl`** present.
9. **[OK] `isDesktopOnly: false`** is correct (no Node/Electron; HTTP via `requestUrl`).
10. **[OK] `README.md`** exists at root.
11. **[FIX] `README.md` network disclosure** — add explicit "Network use" section (endpoint + purpose, no telemetry).
12. **[TODO] `LICENSE` file** — absent; GitHub reports `license: null`.
13. **[TODO] Add `.github/workflows/release.yml`** (tag-triggered build + draft release).
14. **[TODO] Create git tag `0.1.0`** (no tags exist).
15. **[TODO] Create GitHub release `0.1.0`** with binary assets `main.js`, `manifest.json`, `styles.css`.
16. **[OK] Build script** — `package.json` `build` is the first name the scanner looks for (`FAQ.md:68-70`).
17. **[OK] `styles.css`** present at root and attachable.
18. **[FIX] `.gitignore`** — add `main.js` (stop committing build output).
19. **[TODO] Sign in to `community.obsidian.md`** with an Obsidian account.
20. **[TODO] Connect GitHub** (read-only) in the directory profile.
21. **[TODO] Submit** the plugin: **Plugins → New plugin** → repo URL `https://github.com/telecomshy/TaskNotesAiReporter` → owner yourself → agree to policies → **Submit**.
22. **[TODO] Resolve all scanner Errors**, re-run **Request review** / **Review branch**; publish the listing.
23. **[REC] Run `obsidianmd/eslint-plugin`** locally before submitting.
24. **[REC] Optionally beta-test via BRAT** before the public listing.

---

## 4. Gaps / risks

- **Missing `LICENSE` (blocker).** Required by policy; also triggers the scanner's license/license-structure checks. MIT is claimed only in `package.json`.
- **No release exists (blocker).** Submission requires a GitHub release whose tag equals `manifest.version`; there are currently no tags and no releases.
- **`versions.json` contradicts `manifest.json` (correctness).** `0.12.0` vs `1.12.2`; the documented mapping is plugin version → minimum app version. Inconsistent entries undermine the backward-compat lookup in `obsidian-releases/README.md:23` and can confuse the `no-unsupported-api` check.
- **No `.github/workflows/release.yml`.** Not strictly required, but without it the release is manual and the scanner has no reproducible production build path.
- **Network use not clearly disclosed.** The plugin calls arbitrary OpenAI-compatible endpoints; Developer policies require naming the remote services and why. The Chinese README describes AI configuration but has no explicit disclosure section.
- **Secrets in `data.json`.** API keys are stored plaintext in settings; first-party guidance is `SecretStorage`.
- **`main.js` committed to the repo.** Contrary to the sample and a build-verification hazard.
- **Lint warnings likely** (non-blocking but review-visible): `document.createElement` vs `createEl`, direct `.style` assignment, bare `setTimeout`, `as TFile` cast, Adapter API `adapter.exists`, and reading `app.plugins.plugins["tasknotes"]` internals.
- **README hygiene.** The AIGC YAML frontmatter and trailing `> AI生成` may leak into the listing excerpt; README is Chinese-only.
- **Manifest description contains em dashes** (special characters).
- **Naming/affiliation soft risk.** The plugin and id incorporate another community plugin's name ("TaskNotes"). It is a companion plugin, not a fork, and the README declares the dependency, so the policies in F8 are not obviously violated — but there is no primary-source rule that explicitly blesses or forbids this, so treat it as an unverified risk.
- **Cross-plugin dependency has no primary-source rule.** Depending on the TaskNotes runtime API via `app.plugins.plugins` is undocumented; the README discloses the dependency, which is the best available mitigation.
- **No documented review SLA.** Do not plan around a fixed turnaround; drive it with **Review branch** / **Request review**.

---

## 5. Exact commands / snippets

### 5.1 `LICENSE` (create at repo root; keeps `package.json` MIT truthful)

Use the standard MIT text from <https://choosealicense.com/licenses/mit/> with:
`Copyright (c) 2026 telecomshy`. (The scanner validates copyright-notice structure, so keep the line in the recognized `Copyright (c) <year> <holder>` form.)

### 5.2 `.github/workflows/release.yml` (current first-party template)

Source: `obsidianmd/obsidian-sample-plugin@master:.github/workflows/release.yml`. This repo's `npm run build` matches the required `build` script.

```yml
name: Release Obsidian plugin

on:
    push:
        tags:
            - '*'

jobs:
    build:
        runs-on: ubuntu-latest
        permissions:
            contents: write
            id-token: write
            attestations: write
        steps:
            - uses: actions/checkout@v6

            - name: Use Node.js
              uses: actions/setup-node@v6
              with:
                  node-version: 24
                  cache: 'npm'

            - name: Build plugin
              run: |
                  npm ci
                  npm run build

            - name: Check for optional styles
              id: styles
              run: |
                  [ -f styles.css ] && echo "exists=true" >> "$GITHUB_OUTPUT" || echo "exists=false" >> "$GITHUB_OUTPUT"

            - name: Attest build provenance
              uses: actions/attest@v4
              with:
                  subject-path: |
                      main.js
                      ${{ steps.styles.outputs.exists == 'true' && 'styles.css' || '' }}

            - name: Create release
              env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
              run: |
                  tag="${GITHUB_REF#refs/tags/}"

                  gh release create "$tag" \
                    --title="$tag" \
                    --draft \
                    main.js manifest.json ${{ steps.styles.outputs.exists == 'true' && 'styles.css' || '' }}
```

The docs note the attestation step "is recommended when you submit a plugin to the community directory"; drop the `styles.css` line only if you don't ship one. (`Release your plugin with GitHub Actions.md:53`.) After the workflow runs, open the draft release, add notes, and **Publish release** (`:79-81`). Also ensure **Settings → Actions → General → Workflow permissions = Read and write** (`:63`).

### 5.3 `versions.json` (corrected for this plugin)

```json
{
	"0.1.0": "1.12.2"
}
```

### 5.4 First release commands

```bash
git add .github/workflows/release.yml LICENSE
git commit -m "Add license and release workflow"
git push origin main

git tag -a 0.1.0 -m "0.1.0"     # tag MUST equal manifest.json version; no "v" prefix
git push origin 0.1.0
```

Then publish the draft release the Action created.

### 5.5 Submission form values (current process — no PR body)

- GitHub repository URL: `https://github.com/telecomshy/TaskNotesAiReporter`
- Owner: yourself (`telecomshy`) or an organization you belong to.
- Agree to the Developer policies → **Submit**.

### 5.6 Legacy PR body (SUPERSEDED — do not use)

The old flow was to fork `obsidianmd/obsidian-releases`, append one object to `community-plugins.json`, and open a PR. The shape validated by today's mirror workflow is:

```json
{
  "id": "tasknotes-aireporter",
  "name": "TaskNotes AI Reporter",
  "author": "telecomshy",
  "description": "Generate reports from TaskNotes tasks using custom templates and any OpenAI-compatible model.",
  "repo": "telecomshy/TaskNotesAiReporter"
}
```

Required strings: `id`, `name`, `repo` non-empty, `author`/`description` present as strings; `repo` must match `owner/name`; `id` must be unique. (Source: `obsidian-releases/.github/workflows/mirror-community-json.yml`.) **This is documented only to explain what the mirror validates; the current owning docs do not use PRs, and the mirror regenerates the file hourly.**

---

## 6. Source index

**Obsidian developer docs (canonical URLs)**

- Submit your plugin — <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin> · raw `obsidianmd/obsidian-developer-docs@main:en/Plugins/Releasing/Submit your plugin.md`
- Release your plugin with GitHub Actions — <https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions> · raw `…:en/Plugins/Releasing/Release your plugin with GitHub Actions.md`
- Plugin guidelines — <https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines> · raw `…:en/Plugins/Releasing/Plugin guidelines.md`
- Developer policies — <https://docs.obsidian.md/Community+directory/Developer+policies> · raw `…:en/Community directory/Developer policies.md`
- Submission requirements for plugins — <https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins> · raw `…:en/Community directory/Submission requirements for plugins.md`
- Set up and claim — <https://docs.obsidian.md/Community+directory/Set+up+and+claim> · raw `…:en/Community directory/Set up and claim.md`
- Manage your plugin or theme — <https://docs.obsidian.md/Community+directory/Manage+your+plugin+or+theme> · raw `…:en/Community directory/Manage your plugin or theme.md`
- Community directory FAQ — <https://docs.obsidian.md/Community+directory/Frequently+asked+questions> · raw `…:en/Community directory/Frequently asked questions.md`
- Manifest reference — <https://docs.obsidian.md/Reference/Manifest> · raw `…:en/Reference/Manifest.md`
- Beta-testing plugins — <https://docs.obsidian.md/Plugins/Releasing/Beta-testing+plugins> · raw `…:en/Plugins/Releasing/Beta-testing plugins.md`
- Store secrets — <https://docs.obsidian.md/Plugins/Guides/Store+secrets> · raw `…:en/Plugins/Guides/Store secrets.md`
- Anatomy of a plugin — <https://docs.obsidian.md/Plugins/Getting+started/Anatomy+of+a+plugin> · raw `…:en/Plugins/Getting started/Anatomy of a plugin.md`

**Obsidian first-party repos**

- `obsidianmd/obsidian-releases@master`: `README.md`; `community-plugins.json`; `.github/pull_request_template.md`; `.github/workflows/mirror-community-json.yml`; `plugin-review.md` (now a redirect).
- `obsidianmd/obsidian-sample-plugin@master`: `manifest.json`; `versions.json`; `package.json`; `README.md`; `.github/workflows/release.yml`; `version-bump.mjs`; `esbuild.config.mjs`; `.gitignore`.
- `obsidianmd/eslint-plugin@master`: `README.md` (rules `validate-license`, `validate-manifest`, `no-unsupported-api`, etc.).

**This repo**

- `manifest.json:1-10`; `versions.json:1-3`; `package.json:1-21`; `README.md:1-14`; `.gitignore:10-11`; `esbuild.config.mjs:40`; `main.ts:19-78`; `src/ai/transport.ts:6,10-11`; `src/ai/client.ts:205-207`; `src/report/writer.ts:32-64`; `src/tasks/obsidian.ts:12-46`; `src/settings/modelTab.ts:65,68,117,121-124,132-173,407,448-462,510-511`; `src/ui/TaskPickerModal.ts:304`; `src/types.ts:77,94,160`.
- Live GitHub state of `telecomshy/TaskNotesAiReporter` (default branch `main`, public, `license: null`, no tags, no releases) via `gh api` / `gh release list`.

**Tooling used**

- `gh api` (GitHub CLI 2.100.0) with `Accept: application/vnd.github.raw` to read raw Markdown from the source repos (the rendered `docs.obsidian.md` pages are client-side and return only a title to a plain fetch).
