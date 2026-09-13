# Bilingual (Chinese + English) for this Obsidian plugin — findings & plan

- **Question**: How should `tasknotes-aireporter` be made bilingual (Chinese + English)?
- **Scope**: Investigation only. No source, `main.ts`, `test/`, or config files were changed.
- **Chosen notes path**: there was no existing research-notes convention in this repo (`docs/` contained only `adr/` and `agents/`), so this file was created under `docs/research/` per the task instruction.
- **Method**: Obsidian first-party docs and API declarations, the official `obsidian-importer` and `obsidian-tasks` plugins, the `obsidian-translations` repo, and esbuild's own docs. Community libraries treated as secondary.

This document separates **Verified facts** (each with an owning source) from **Recommendations** (inference, explicitly marked).

---

## TL;DR recommendation

- **You are on your own**: Obsidian ships exactly one localization primitive for plugins — `getLanguage()` — and no string catalog, no `t()`, no locale file loader. Plugin i18n is entirely DIY. (Verified.)
- **Detection**: `getLanguage()` returns `zh` for Simplified Chinese, `zh-TW` for Traditional, and `en`/other ISO codes otherwise. Call it once in `onload()`. Since `minAppVersion` is `1.12.2` and `getLanguage()` exists since `1.8.7`, no feature-gating is needed. (Verified.)
- **Storage**: hand-rolled **typed TypeScript string maps** bundled by esbuild (`src/i18n/en.ts`, `src/i18n/zh.ts`), not runtime-loaded JSON files. esbuild can inline JSON, but this repo's `tsconfig.json` lacks `resolveJsonModule`, so JSON imports break the `tsc -noEmit` build step. TS maps also keep the i18n core Obsidian-free and unit-testable, matching the repo's existing seam style (ADR-0002). (Recommendation.)
- **API**: a pure `t(key, vars?)` with dotted keys, `{{name}}` interpolation, English fallback, and `_plural` handling, plus a pure `resolveLanguage()` mapping. `getLanguage()` is imported only in `main.ts`; UI modules receive `t` through the existing `plugin` / `SettingsTabContext` seams. (Recommendation.)
- **Setting**: add `uiLanguage: "auto" | "zh" | "en"` (default `"auto"`). Keep it strictly separate from the existing `settings.language`, which is the **report output language** fed to the AI prompt, not the UI locale. (Recommendation.)
- **Don't translate**: the AI prompt scaffolding, task-field labels inside the prompt, API field names, and stored user data (provider names, template names/contents). (Recommendation.)

---

## 1. Verified facts

### F1. Obsidian offers no first-party plugin-localization API

- The only localization-shaped symbol in the Obsidian type declarations is `getLanguage()`. A search of `node_modules/obsidian/obsidian.d.ts` for `locale`, `i18n`, `translat`, and `getLanguage` returns `getLanguage()` (`obsidian.d.ts:3365`) and two unrelated uses of the English word "translates" (event → pane type, modifier key translation at `obsidian.d.ts:3654` and `:5540`). There is no `t()`, no `loadLocale()`, no string catalog API.
- The developer-docs repo contains **no** internationalization/localization page. Its full Git tree has no path matching `Translat|Local|International|i18n|Plural` other than `getLanguage.md` and unrelated `LocalStorage`/`trash` API pages. (Source: `obsidianmd/obsidian-developer-docs` tree, `main` branch.)
- The **Plugin guidelines** page (the page that lists common review comments) never mentions language, translation, or localization. (Source: <https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md>.)
- The **Developer policies** and **Submission requirements for plugins** pages likewise contain no localization requirement (the only `Translat` hit is the example command `"Translate selected text into..."`). (Sources: `en/Community directory/Developer policies.md`, `en/Community directory/Submission requirements for plugins.md`.)
- The **official sample plugin** README describes ribbon icons, commands, settings, `registerEvent`, `setInterval` — and nothing about localization. (Source: <https://github.com/obsidianmd/obsidian-sample-plugin>.)

**Conclusion (verified): plugin i18n is 100% DIY.** Where Obsidian's own docs are thin, this is the thin part: the docs do not describe how a plugin *should* be localized at all. All conventions below are drawn from the official plugins that do it, not from a spec.

### F2. `getLanguage()` contract and Chinese return values

Local declaration:

```ts
/**
 * Get the ISO code for the currently configured app language. Defaults to 'en'.
 * See https://github.com/obsidianmd/obsidian-translations?tab=readme-ov-file#existing-languages for list of options.
 * @public
 * @since 1.8.7
 */
export function getLanguage(): string;
```

- Source: `node_modules/obsidian/obsidian.d.ts:3359-3365`; mirrored at <https://docs.obsidian.md/Reference/TypeScript+API/getLanguage> (raw file `en/Reference/TypeScript API/getLanguage.md`).
- The Chinese variants in the referenced list are `zh` (**Chinese (Simplified)**, 简体中文) and `zh-TW` (**Chinese (Traditional)**, 繁體中文). There is no `zh-CN` entry. (Source: `obsidianmd/obsidian-translations` README "Existing languages" table, <https://github.com/obsidianmd/obsidian-translations>.)
- Independent corroboration from the official Obsidian Importer plugin: the language keys in its generated `locales.ts` are exactly `zh` and `zh-TW` (alongside `pt`/`pt-BR`), and its `src/main.ts` calls `setLanguage(getLanguage())` inside `onload()`. (Sources: <https://github.com/obsidianmd/obsidian-importer/blob/main/src/i18n/locales.ts>, <https://github.com/obsidianmd/obsidian-importer/blob/main/src/main.ts>.)
- Obsidian's own code can deviate from ISO: the Importer maps Obsidian's `kh` to ISO `km` (Khmer) via an `ALIASES` table (`src/i18n/index.ts`). So don't assume the code is always a clean ISO-639-1 string.
- This repo's `manifest.json:5` sets `minAppVersion: "1.12.2"`, and the dev dependency is `obsidian: ^1.13.1` (`package.json:18`). Both are ≥ `1.8.7`, so `getLanguage()` is always available; no runtime guard is required.

### F3. How the Obsidian *app* localizes (not reusable by plugins)

- The app's translations are plain-text block files under `translations/*.txt`, one per language code, format:

  ```
  [setting.about.option-language]
  original=Language
  translation=
  ```

  Placeholders use `{{name}}` and must not be renamed/dropped; a `_plural` variant exists for counted strings. (Source: `obsidianmd/obsidian-translations` README.)
- It is **not** JSON. (The project's `website/` marketing translations are JSON, but that is a separate static-site pipeline, not the app catalog.)
- Developer test hooks: `selectLanguageFileLocation()` in the console, and `localStorage.removeItem('language')` to revert. (Source: same README.)
- The Chinese app translation is maintained by `Obsidian.zh`, not upstream. (Source: same README.)
- The official Importer borrows this exact format for its own locale files: its `util.ts` `stringifyLocale()`/`parseLocale()` write and read `[key] / original= / translation=` blocks, and its `en.ts` comments say "Conventions, borrowed from Obsidian's own string table". This confirms the block format is a *convention you may copy*, not an API you call. (Source: <https://github.com/obsidianmd/obsidian-importer/blob/main/src/i18n/util.ts>.)

### F4. Bundling vs. runtime loading of locale files

- esbuild has a built-in `json` loader enabled by default for `.json`: "It parses the JSON file into a JavaScript object at build time and exports the object as the default export." So `import zh from "./locales/zh.json"` is **inlined into `main.js`** — the shipped plugin does not read the `.json` at runtime. (Source: <https://esbuild.github.io/content-types/#json>.)
- `obsidian-tasks` does exactly this: `src/i18n/i18n.ts` statically imports `./locales/en.json`, `./locales/zh_cn.json`, etc., and maps Obsidian codes (`zh` → `zh_cn`, `pt-BR` → `pt_br`) inside `i18next.init`. It is bundled by esbuild (`esbuild.config.mjs`, `bundle: true`). (Sources: <https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/i18n/i18n.ts>, `esbuild.config.mjs`, `package.json`.)
- This repo **could** load a file from its own folder at runtime: `PluginManifest.dir` is declared as "Vault path to the plugin folder in the config directory" (`obsidian.d.ts:5094-5099`), and `app.vault.adapter` can read it. But this is async, needs error handling, and buys nothing once the bundler can inline the strings. No official docs recommend it.
- **Concrete blocker for the JSON option in *this* repo**: `tsconfig.json` does **not** set `resolveJsonModule` (see `tsconfig.json:1-21`), while `npm run build` runs `tsc -noEmit -skipLibCheck` (`package.json:7`). Importing `.json` would therefore fail type-checking until the config is changed. (Verified from repo files.)

### F5. Two real-world patterns, and the community options

- **Official `obsidian-importer` — hand-rolled, typed TS (recommended model).**
  - `src/i18n/en.ts` is the source of truth (`export const en = { ... }`), nested, camelCase keys; `typeof en` is the `Strings` type so every locale is checked against it.
  - `src/i18n/index.ts` exposes `setLanguage(getLanguage())`, a `translate()` with English fallback and `_plural`, and a Proxy-based `i18n` accessor so `i18n.modal.buttonImport()` is both typed and callable. Keys with no value fall back to English; a key missing from English returns the key itself (visible/traceable).
  - `util.ts` handles `camelToKebab`, `flatten`, `{{placeholder}}` interpolation (numbers use `toLocaleString(language)`), and CRLF-safe newline encoding.
  - Locale files are generated *from* `en.ts` (`locale/*.txt`), so translators work in Obsidian's block format while the runtime stays typed TS.
- **`obsidian-tasks` — i18next.**
  - `i18next` + JSON locale modules, plus `i18next-parser` to keep all catalogs in sync (`yarn extract-i18n`). Heavier (two extra dev/runtime deps and a parser config); justified there because it supports ~12 locales.
  - `i18next` default interpolation is `{{...}}`, matching Obsidian's convention. (Source: <https://www.i18next.com/translation-function/interpolation>.)
- **Community (secondary)**: `dragonish/obsidian-plugin-i18n` (npm `obsidian-plugin-i18n@0.2.0`, 0 stars) is a tiny `messages`-object + `t(key, vars)` class — the same idea, unmaintained. `eondrcode/obsidian-i18n` (802 stars) is a *different* thing: a runtime translation-overlay tool that AST-parses and machine-translates other plugins' already-built `main.js`, aimed at end users translating third-party plugins, not at authors shipping first-class bilingual support. (Sources: <https://github.com/dragonish/obsidian-plugin-i18n>, <https://github.com/eondrcode/obsidian-i18n>.)

### F6. This repo's current state (verified from source)

- All UI text is hard-coded Chinese. Files with Chinese UI strings include `main.ts`, `src/settings/{index,generalTab,modelTab,templateTab,logic}.ts`, and `src/ui/{ReportModal,TaskPickerModal,Calendar,taskMeta,generateButton}.ts`. `src/core`, `src/ai`, `src/report`, `src/tasks` mostly contain logic; the Chinese there is prompt/output text, not UI chrome.
- There is already a `language` setting: `TaskNotesAIHelperSettings.language` (`src/types.ts:147-148`, default `"中文"` at `src/types.ts:165`), edited via a free-text "报告语言" field (`src/settings/generalTab.ts:73-83`) and consumed only by `generateReport` → `buildReportPrompt` (`src/report/generate.ts:85-90`, `src/core/prompt.ts:65-85`). **This is the report output language, not a UI locale.** Any new UI-language setting must not reuse it.
- The i18n seams already exist: `SettingsTabContext` carries `plugin` into every settings tab (`src/settings/index.ts:16-21`); `ReportModal` holds `plugin` (`src/ui/ReportModal.ts:35-43`) and constructs `TaskPickerModal` (`:142-154`); `PluginSettingTab` constructs the main tab with `this.plugin` (`main.ts:18`). So `t` can be reached without new plumbing.
- Testing is `node --test` with `tsx` and `--experimental-test-module-mocks` (`package.json:9`). Existing tests assert Chinese output where it must stay (e.g. `test/prompt.test.ts:24,37`, `test/filename.test.ts:13`) and one asserts the button label (`test/generateButton.test.ts:6`).

---

## 2. Recommendations (inference)

### R1. Detection & setting

Add a **separate** UI-language setting to the settings schema:

```ts
// src/types.ts (near line 147)
uiLanguage: "auto" | "zh" | "en";
// DEFAULT_SETTINGS (near line 165)
uiLanguage: "auto",
```

- `"auto"` (default): resolve via `getLanguage()` at load. `zh` and `zh-TW` → Chinese; `en` and everything else → English. This mirrors the official Importer's fallback: exact code → base language → English (`src/i18n/index.ts` `setLanguage`).
- `"zh"` / `"en"`: manual override, for users whose Obsidian language differs from their preferred plugin language.
- Add the field to `normalizeSettings()` next to the existing `language` handling (`src/settings/logic.ts:46`), validating it is one of the three literals, else `"auto"`. `normalizeSettings({})` (tested at `test/settings.test.ts:6`) will then produce `"auto"` automatically.
- **Reality of "auto"**: Obsidian reads app language at startup and prompts a relaunch when it changes, so resolving once in `onload()` is consistent with the app. Changing `uiLanguage` manually also needs a settings-tab refresh/reload for already-open modals; simplest is to document "takes effect next launch" and re-render the settings tab immediately.

### R2. File layout for an esbuild-bundled plugin

```
src/i18n/
├── en.ts       # source of truth, `export const en = { ... } as const`
├── zh.ts       # `const zh: typeof en = { ... }`
└── index.ts    # pure runtime: resolveLanguage(), createTranslator()/setLanguage(), t()
```

- **TS string maps over JSON.** Rationale: (a) esbuild inlines either way, so runtime file loading is unnecessary (F4); (b) the repo's `tsconfig.json` has no `resolveJsonModule`, so JSON imports would break `npm run build` until the config is edited (F4); (c) `typeof en` gives compile-time completeness checking for `zh.ts` with no extraction tooling; (d) the core stays Obsidian-free and testable, like `src/ai/client.ts` vs `src/ai/transport.ts` (ADR-0002).
- If the team later wants translators to work in `.txt`/JSON without touching TS, adopt the Importer's pattern: keep `en.ts` as source of truth and *generate* locale data (`src/i18n/util.ts` in Importer shows the parser/serializer). That is a follow-up, not the first step.
- **Do not** load `.json` from the plugin folder at runtime. `manifest.dir` exists (`obsidian.d.ts:5099`), but it adds async failure modes and is not what the official plugins do.

### R3. Runtime helper API

Keep the Obsidian dependency at the very edge, exactly like the repo already does for HTTP:

```ts
// src/i18n/index.ts (pure — no `import ... from "obsidian"`)
export type Language = "en" | "zh";
export type Vars = Record<string, string | number>;

/** Map an Obsidian language code to a supported UI language. Pure. */
export function resolveLanguage(obsidianLang: string, override: "auto" | "zh" | "en"): Language {
  if (override !== "auto") return override;
  const code = obsidianLang.toLowerCase();
  return code === "zh" || code.startsWith("zh-") ? "zh" : "en";
}

export type Translator = (key: string, vars?: Vars) => string;

/** Build a translator over a bundle with English fallback + `{{var}}` + `_plural`. Pure. */
export function createTranslator(bundle: Partial<typeof en>): Translator { /* ... */ }
```

Wiring:

- `main.ts` imports `getLanguage` from `obsidian`, builds the translator in `onload()`, and stores it on the plugin (e.g. `this.t`).
- Settings tabs read `ctx.plugin.t` (already available via `SettingsTabContext.plugin`).
- `ReportModal` uses `this.plugin.t`; it passes `t` into `TaskPickerModal` and into the template-edit modal.
- `generateButton.ts:16,21-25` currently hard-codes `IDLE_LABEL`. Change `getGenerateButtonState(generating, idleLabel)` (or return a key and let `ReportModal` translate it). Update `test/generateButton.test.ts:5-11` accordingly.
- Fallback semantics: active-language miss → English → the key itself (traceable), matching Importer.
- Plural: support a `_plural` suffix selected when `vars.count !== 1` (Importer), rather than pulling in a plural-rules library for two languages.

### R4. What to translate vs. what to leave alone

**Translate (UI chrome, driven by UI locale):**

| Area | Concrete locations |
| --- | --- |
| Ribbon tooltip, command name | `main.ts:21`, `main.ts:29` |
| Settings tab bar | `src/settings/index.ts:42-44` |
| General tab | `src/settings/generalTab.ts:11-14,19,22-23,34-38,61-62,73-74,77,80` |
| Model tab (largest surface) | `src/settings/modelTab.ts:17,19,34,41,46,53-54,101,110,114-115,120,195,198,239,244,263,270,285,288,294,298,302,312,320,327,371,374,389,393,395,403,416,419,424,428,456,469,511,515,523,535,547,552,556,559,569,572,577` |
| Template tab + edit modal | `src/settings/templateTab.ts:13,15,21,29,47,49,63,112,114,118,120,122,129,132,136,148` |
| Report modal | `src/ui/ReportModal.ts:50,61,66,93-94,106,120,129,134,152,165,177,217,239-245` |
| Task picker modal | `src/ui/TaskPickerModal.ts:68,86-87,131-135,169,183,202,206,226,234,236,241,243,277-280,292-294,325` |
| Task meta labels | `src/ui/taskMeta.ts:45-48` |
| Calendar month/weekday words | `src/ui/Calendar.ts:9-14,129` |
| Generate button label | `src/ui/generateButton.ts:16` |

**Keep as-is / route by *report* language instead of UI locale:**

| Area | Locations | Why |
| --- | --- | --- |
| Prompt scaffolding ("标题：", "状态：", "优先级：", "请根据…") | `src/core/prompt.ts:9-14,36-49,68,79-85` | Machine-facing; should follow the report `language`, not the reader's UI locale. The report `language` setting already exists (`types.ts:147-148`). |
| Report type words used in prompts | `src/core/reportType.ts:10-15`, used at `prompt.ts:74,79` | Same as above. |
| Frontmatter `title:` in generated notes | `src/report/writer.ts:11-24` | Output artifact, not UI. **Decision needed**: localize to report language, or leave Chinese (current behavior). Flagged below. |
| Filename fallback `"报告"` | `src/core/filename.ts:12` | Output artifact; changing it changes filenames. Keep Chinese or localize to report language deliberately. |
| API field names, URLs, JSON keys | `src/ai/client.ts`, `src/core/aiUrl.ts`, `src/tasks/*` | Wire format. |
| Persisted user data: provider names, template names/contents | `src/types.ts:104-127,168-172`; `src/settings/logic.ts:133`; `src/settings/modelTab.ts:327,395` | Values in `data.json`. Never auto-translate stored state — that would rewrite user data and break migrations. |

Nuances worth an explicit decision:

- Preset provider display names in `src/types.ts:104-127` are brand-ish but partially Chinese (`"深度求索（DeepSeek）"`, `"阿里云百炼（通义千问）"`). Options: leave as-is (brand fidelity) or show a localized display name while keeping `id`/`baseUrl` unchanged. Keep `id` and persisted `name` stable regardless.
- The default template seeded on first run (`src/types.ts:168-172`, name `"周报（示例）"`, Chinese prompt body) is persisted data. Seeding it in the detected UI language at first load is possible but means first-run content depends on locale; simpler to keep as-is.
- `src/settings/logic.ts:133` creates a migrated legacy provider named `"自定义"`. That string becomes persisted. If you translate it, the translation must be applied at creation time only, never on load.

### R5. Migration plan for this repo

1. **Add the core** (no Obsidian import): `src/i18n/en.ts` (move every UI string here, nested under `settings.*`, `modal.*`, `notice.*`, `calendar.*`, `taskMeta.*`, `command.*`), `src/i18n/zh.ts` (same shape, `satisfies typeof en`), `src/i18n/index.ts` (`resolveLanguage`, `createTranslator`, `LANGUAGES` list).
2. **Add the setting**: `uiLanguage` to `TaskNotesAIHelperSettings` and `DEFAULT_SETTINGS` (`src/types.ts`), and to `normalizeSettings` (`src/settings/logic.ts:46` area). Add a dropdown in `src/settings/generalTab.ts` (new `Setting` with `.addDropdown`).
3. **Wire `main.ts`**: in `onload()`, after `loadSettings()`, compute `const lang = resolveLanguage(getLanguage(), this.settings.uiLanguage)` and set `this.t`. This is the *only* place `getLanguage` is imported (keeps the core testable without mocks).
4. **Migrate leaf modules first** (easy to verify, no dependency on the translator being threaded anywhere): `src/ui/Calendar.ts` → `src/ui/taskMeta.ts` → `src/ui/generateButton.ts`.
5. **Migrate modals**: `src/ui/TaskPickerModal.ts` (constructor takes `t`), then `src/ui/ReportModal.ts` (uses `this.plugin.t`, passes it down, translates `failureMessage` at `:236-246`).
6. **Migrate settings, tab by tab**: `src/settings/index.ts` labels → `generalTab.ts` → `templateTab.ts` (including `TemplateEditModal`) → `modelTab.ts` (notices and labels) → the migrated-provider name at `src/settings/logic.ts:133`.
7. **Re-render on change**: when the user changes `uiLanguage`, call `this.refresh()` on the settings tab so the tab labels update live; modals opened afterwards pick up the new `t`.
8. **(Optional, repo-consistent) record the decision** as `docs/adr/0005-plugin-ui-localization.md`, and note the UI-locale vs report-language distinction in `CONTEXT.md`. The repo's domain-docs convention says ADRs are written when a decision is actually resolved (`docs/agents/domain.md:11`).

### R6. Testing

- Add `test/i18n.test.ts` using the existing `node --test` setup (`package.json:9`):
  - `resolveLanguage("zh", "auto") === "zh"`, `resolveLanguage("zh-TW", "auto") === "zh"`, `resolveLanguage("en-US", "auto") === "en"`, override wins.
  - `createTranslator(zh)` returns Chinese for a known key; falls back to English for a key missing in `zh`; falls back to the key for an unknown key.
  - `{{count}}`-style interpolation and `_plural` selection at `count === 1` vs `count !== 1`.
  - The compiler already checks `zh.ts` against `typeof en`, but a test that both bundles export the same key set catches dynamic-map drift.
- **No `obsidian` mock needed** because `src/i18n/index.ts` never imports `obsidian`. If instead you import `getLanguage` inside the i18n module, you must add a `mock.module` shim like `test/client.test.ts:50-65`, which is avoidable friction.
- **Pitfalls:**
  - `test/generateButton.test.ts:5-11` asserts `label: "生成报告"`; update it when the label is injected.
  - Avoid global mutable language state that leaks across tests. Prefer `createTranslator(bundle)` per test, or export `setLanguage()` and reset it in each test.
  - Tests that assert Chinese prompt/filename output should keep passing — those strings must **not** move into the UI catalog (`test/prompt.test.ts`, `test/filename.test.ts`). If they break, the migration accidentally localised prompt/output text.
  - `isolatedModules: true` (`tsconfig.json:14`) + esbuild's per-file compilation means type-only re-exports need `export type`; declare bundle shapes with `as const`/`satisfies`.
  - If any locale data uses `toLocaleString`, pass the active language through so number/date grouping follows the chosen UI locale (Importer's `interpolate` does this).

---

## 3. Open questions / uncertainties

1. **Traditional Chinese (`zh-TW`)**: Obsidian returns both `zh` and `zh-TW`. This plan collapses both to one Simplified Chinese catalog. If Traditional users matter, you need a third catalog (`zh-TW`) and should not silently serve Simplified. (Verified that the codes exist; the product decision is open.)
2. **Report output language vs UI locale**: `REPORT_TYPE_LABEL` (`src/core/reportType.ts:10-15`) is used both in prompts and in the generated note's frontmatter title (`src/report/writer.ts:15`). Should the note title follow the UI locale, the report `language` setting, or stay Chinese? Current behavior is Chinese; changing it alters generated notes. Needs a product decision.
3. **Filename fallback** `"报告"` (`src/core/filename.ts:12`) has the same ambiguity and is asserted by `test/filename.test.ts:13`.
4. **Default template seeding** in the detected UI language (`src/types.ts:168-172`): first-run content would vary by locale and would need to be created before the settings/UI is even shown.
5. **When to apply the language**: docs don't state whether Obsidian's app language can change without a relaunch. The official Importer resolves it once in `onload()`, which is the safe assumption; a manual `uiLanguage` override mitigates the edge case.
6. **No first-party guidance exists** for plugin i18n (F1), so this plan is necessarily a convention borrowed from official plugins (`obsidian-importer`, `obsidian-tasks`), not a spec. It should be treated as a repo-level decision worth recording as an ADR.

---

## 4. Source index

**First-party Obsidian**

- `getLanguage()` declaration: `node_modules/obsidian/obsidian.d.ts:3359-3365` (`@since 1.8.7`).
- `PluginManifest.dir`: `node_modules/obsidian/obsidian.d.ts:5094-5099`.
- API docs: <https://docs.obsidian.md/Reference/TypeScript+API/getLanguage>.
- Language codes: <https://github.com/obsidianmd/obsidian-translations> (README, "Existing languages": `zh`, `zh-TW`).
- App translation format & dev hooks: same README (`[key]/original/translation`, `{{name}}`, `_plural`, `selectLanguageFileLocation()`, `localStorage.removeItem('language')`).
- Plugin guidelines (no i18n section): <https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md>.
- Developer policies / Submission requirements (no i18n): `en/Community directory/Developer policies.md`, `en/Community directory/Submission requirements for plugins.md`.
- Sample plugin (no i18n): <https://github.com/obsidianmd/obsidian-sample-plugin>.
- Official Importer i18n implementation: `src/i18n/index.ts`, `src/i18n/en.ts`, `src/i18n/util.ts`, `src/i18n/locales.ts`, `src/main.ts` under <https://github.com/obsidianmd/obsidian-importer>.

**Community (secondary, verified against their sources)**

- `obsidian-tasks` i18next + JSON modules: <https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/src/i18n/i18n.ts>; setup docs `contributing/Translation/Overview of the translation setup.md`.
- i18next interpolation: <https://www.i18next.com/translation-function/interpolation>.
- `obsidian-plugin-i18n` package: <https://github.com/dragonish/obsidian-plugin-i18n> (npm `obsidian-plugin-i18n@0.2.0`).
- `obsidian-i18n` runtime overlay tool: <https://github.com/eondrcode/obsidian-i18n>.

**Bundler**

- esbuild JSON loader (build-time inlining): <https://esbuild.github.io/content-types/#json>.

**This repo**

- `main.ts:15-34`, `manifest.json:5`, `package.json:7,9,18`, `tsconfig.json:1-21`.
- `src/types.ts:104-127,147-148,155-175`; `src/settings/logic.ts:31-66,133`; `src/settings/index.ts:16-21,42-44`; `src/settings/generalTab.ts:10-84`; `src/settings/modelTab.ts`; `src/settings/templateTab.ts`; `src/ui/ReportModal.ts`; `src/ui/TaskPickerModal.ts`; `src/ui/Calendar.ts:9-14,129`; `src/ui/taskMeta.ts:45-48`; `src/ui/generateButton.ts:16-25`; `src/core/prompt.ts`; `src/core/reportType.ts`; `src/core/filename.ts:12`; `src/report/writer.ts:11-24`.
- Tests: `test/generateButton.test.ts:5-11`, `test/prompt.test.ts:18-60`, `test/filename.test.ts:5-19`, `test/settings.test.ts:6-15`, `test/client.test.ts:50-65`.
