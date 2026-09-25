# Obsidian declarative settings API (`getSettingDefinitions`) — feasibility boundaries

- **Question**: What are the real limits of Obsidian's declarative settings API (`getSettingDefinitions()` / `SettingDefinition`)? Can `TaskNotesAIHelperSettingTab` (`src/settings/index.ts`) adopt it to become visible in Obsidian 1.13+ settings search, and what does that cost this repo?
- **Scope**: Investigation only. No source, config, `manifest.json`, `versions.json`, or test file was changed; this Markdown file is the only addition.
- **Pinned upstream** (re-check when any of these move):
  - `obsidian` npm package **1.13.1** — the repo's devDependency `^1.13.1` (`package.json:24`) resolves to 1.13.1, and 1.13.1 is also the latest version on npm as of the access date. All `.d.ts` line citations below are from `node_modules/obsidian/obsidian.d.ts` at this version.
  - Obsidian **app** 1.13.0 introduced the API; 1.13.1 added the 1.13.1-tagged fields; 1.13.4 is the current public desktop release.
  - `eslint-plugin-obsidianmd` **0.4.2** (repo devDependency `^0.4.2`, `package.json:22`).
  - `obsidianmd/obsidian-developer-docs@main` — read via `cdn.jsdelivr.net/gh/...` raw Markdown, because `docs.obsidian.md` renders client-side and direct fetches fail on this machine.
- **Method**: primary sources only. The `obsidian` npm `obsidian.d.ts` (installed + jsDelivr mirror), `obsidianmd/obsidian-developer-docs` (Settings guide + migration guide), the official Obsidian changelog, the `obsidianmd/obsidian-api` commit that introduced the API, and the rule sources of `eslint-plugin-obsidianmd`. One claim (the `no-unsupported-api` interaction) was additionally verified empirically with a throwaway probe file that was removed immediately afterwards. No blog posts are relied on.
- **Language**: written in English to match the sibling Obsidian API notes in this folder (`obsidian-plugin-i18n.md`, `obsidian-community-plugin-submission.md`, `obsidian-plugin-post-publication-metadata.md`).

This document separates **Verified facts** (each with an owning source) from **Recommendations** (inference, explicitly marked).

---

## TL;DR

Obsidian 1.13.0 shipped a genuine declarative settings API. The API is expressive enough to reproduce this repo's tabbed settings UI **only if** the bespoke parts are re-expressed as `render` callbacks / imperative `SettingPage`s — which is a rewrite, and hand-built controls inside such pages are **not** search-indexed. The verdict is **partially feasible**:

- **Search visibility — solved by the API.** Only definitions returned from `getSettingDefinitions()` are indexed. Hand-built `new Setting(container)` rows in `display()` are invisible to search. (Verified.)
- **Simple settings — cleanly expressible.** `generalTab.ts`'s text/toggle/dropdown rows map 1:1 to `control` definitions. (Verified.)
- **Bespoke UI — expressible but reworked.** Provider cards, the `SecretComponent` control, and the template list/modal have no first-class declarative control; they must move into `render` callbacks, `type: 'list'`, and/or an imperative `SettingPage`. (Verified.)
- **Mixed mode on 1.13+ — not possible at tab level.** `display()` is bypassed whenever `getSettingDefinitions()` returns a non-empty array; you cannot have declarations *and* `display()`-drawn leftovers in one tab on one version. Custom UI must live **inside** a definition (`render` / `page`), not in `display()`. (Verified.)
- **Binding conflict — this repo must override the value hooks.** The default `control` binding reads/writes `this.plugin.settings[key]` and auto-calls `saveData()`, but this repo exposes `settings` as a readonly snapshot whose only writer is `settingsOwner` / the `appSettings` & `providers` facades. Default binding does not fit; `getControlValue` / `setControlValue` must be overridden (or every row must use `render`). (Verified against repo source.)
- **Version + lint — two paths.** Path A (bump `minAppVersion` to `1.13.0`) is clean. Path B (keep `1.12.2`, implement both) silences `prefer-setting-definitions` without a bump, but `no-unsupported-api` (error level) then flags any *call* to `this.update()` / `this.refreshDomState()` / `this.getControlValue(...)` unless guarded with `requireApiVersion("1.13.0")`. This was confirmed by running ESLint on a probe. (Verified by experiment.)

---

## 1. Exact API shape and version (answers Q1)

Verified declarations in `obsidian` 1.13.1 `obsidian.d.ts`:

```ts
export abstract class PluginSettingTab extends SettingTab {
  /** @since 1.13.0 */
  getSettingDefinitions(): SettingDefinitionItem[];
  /** Reads from `this.plugin.settings`. Override to read from a different data source.
   *  @since 1.13.0 */
  getControlValue(key: string): unknown;
  /** Mutates and persists `this.plugin.settings`. Override to write elsewhere.
   *  @since 1.13.0 */
  setControlValue(key: string, value: unknown): void | Promise<void>;
}
```

- Source: `obsidian.d.ts:5149-5174`.
- `SettingDefinitionItem` is the return element: a single definition, a group, a list, or a page. Type union at `obsidian.d.ts:6147`; `SettingDefinition` at `:5932`.
- **Binding** (verified from the docs and the type docs): a `control` definition carries a `key`; Obsidian reads the current value with `getControlValue(key)` when rendering, writes user changes with `setControlValue(key, value)`, and persists for you. `PluginSettingTab`'s defaults read/write `this.plugin.settings[key]` and call `this.plugin.saveData()`. (Sources: `obsidian.d.ts:5160-5173, 5884-5926, 6592-6614`; Settings guide "Create a settings definition" and "Custom settings storage"; migration guide.)
- **Lifecycle**: `getSettingDefinitions()` is called on every `update()` / display **and once when the tab is registered, to build the search index**. Keep it cheap — no I/O or network. (Source: `SettingTab.getSettingDefinitions` doc comment `obsidian.d.ts:6577-6584`; Settings guide "Keep `getSettingDefinitions()` cheap".)
- `SettingTab.update()` (1.13.0) rebuilds stored definitions + search index; `SettingTab.refreshDomState()` (1.13.0) re-evaluates `visible`/`disabled` predicates in place without a re-render. (Sources: `obsidian.d.ts:6585-6591, 6616-6628`; Settings guide "Conditional visibility".)
- `SettingTab.display()` is `@deprecated Since 1.13.0. Use getSettingDefinitions() instead` and is **not called when `getSettingDefinitions()` returns a non-empty array**. It is explicitly documented as the fallback for plugins supporting Obsidian older than 1.13.0. (Source: `obsidian.d.ts:6629-6641`.)
- **Minimum app version: 1.13.0.** Every declarative type carries `@since 1.13.0`; the migration guide opens with "Requires Obsidian 1.13.0+". The lint plugin hard-codes the same constant (`DECLARATIVE_MIN_VERSION = "1.13.0"` in `eslint-plugin-obsidianmd/dist/lib/rules/settingsTab/shared.js:8`).

## 2. Control types, custom UI, escape hatches (answers Q2)

The `control` union has **nine** types (source `obsidian.d.ts:5878`, individual interfaces at the noted lines):

| `type` | Stored value | Interface |
| --- | --- | --- |
| `toggle` | `boolean` | `:6696` |
| `text` | `string` (+ `placeholder`) | `:6679` |
| `textarea` | `string` (+ `placeholder`, `rows`) | `:6656` |
| `number` | `number` (+ `min`, `max`, `step`, `placeholder`) | `:6422` |
| `slider` | `number` (`min`/`max`/`step` required; `displayFormat` @since 1.13.1) | `:6514` |
| `dropdown` | `string` (`options: Record<string,string>`) | `:6291` |
| `file` | `string` path (+ vault suggester, `filter`) | `:6311` |
| `folder` | `string` path (+ suggester, `filter`, `includeRoot`) | `:6336` |
| `color` | hex string | `:5866` |

All controls also accept `defaultValue`, `validate`, and `disabled`. (Source: `SettingControlBase` `obsidian.d.ts:5884-5926`.)

**There is no "custom control" member of the union, and no `secret` control.** The escape hatches are definition kinds, not control kinds:

- **`render`** (`SettingDefinitionRender`, `obsidian.d.ts:6265-6285`): `render: (setting: Setting, group: SettingGroup) => void | (() => void)` gives full imperative control of one `Setting` row, and may return a cleanup function. The docs list exactly this as the answer for moment-format inputs, progress bars, custom suggesters, multi-button rows, and standalone buttons ("What's not yet a first-class control"). **`render` does not auto-save.**
- **`SettingPage`** (`obsidian.d.ts:6461-6508`), reached via `page: () => SettingPage` on a `SettingDefinitionPage`: a full imperative sub-page with `containerEl`, `titlebarEl`, `display()`, `hide()`. This is the hook for "embed arbitrary DOM".
- **`action`** (`SettingDefinitionAction`, `obsidian.d.ts:5938-5963`): a clickable row (`action: (el, index) => void`).
- **`DocumentFragment`** is accepted for `desc` (rich text/links) on any definition. (Source: `obsidian.d.ts:5998-6003`.)
- `control`, `render`, `action` are **mutually exclusive** on one definition. (Source: `obsidian.d.ts:6031-6069`; Settings guide "Mutual exclusion".)

## 3. Grouping, lists, and multi-tab (answers Q3)

There is **no native top-level tab strip**, but there are three grouping shapes plus sub-pages (sources: `obsidian.d.ts:6079-6259`; Settings guide "Groups", "Lists", "Sub-pages"):

- **`type: 'group'`** — a `heading` + nested `items`, plus `cls`, `extraButtons`, a per-group `search` callback (@since 1.13.1), and a `visible` predicate. This is the declarative equivalent of a section heading.
- **`type: 'list'`** — a denser group for user-managed collections, unlocking `emptyState`, `onReorder`, `onDelete`, and an `addItem` affordance (desktop `+` button / mobile add row).
- **`type: 'page'`** — a navigable entry that slides in a sub-page with a back button; pages can nest, and names must be unique among siblings or path-based navigation breaks. Content is either declarative `items` or an imperative `page: () => SettingPage`.

So this repo's current three-way custom tab bar (模型 / 模板 / 常规, `src/settings/index.ts:42-93`) maps most naturally to **three `SettingDefinitionPage`s** (or to groups if the content is short). The official style guide actually discourages top-level tabs/headings for small sections and recommends groups first, sub-pages only for self-contained scopes. (Source: Settings guide "Sub-pages", "Style guide".)

## 4. How settings search works, and why `display()` is not searchable (answers Q4)

Verified mechanism:

1. Search is built from the definitions array. `getSettingDefinitions()` is called "once when the tab is added to the setting modal for search indexing"; `update()` "refreshes the tab's stored definitions and the search index". (Sources: `obsidian.d.ts:6577-6591`; Settings guide "Reacting to changes".)
2. The indexed text is `name` ("used for rendering and search"), the `textContent` of a `desc` `DocumentFragment`, and any `aliases`. `searchable: false` (or `() => false`) excludes an item; `visible: false` also excludes it "from search for that render cycle". (Sources: `obsidian.d.ts:5990-6025`; migration guide Verification step 3.)
3. For manual UI there is no definition, so there is nothing to index. The Settings guide states this explicitly for hand-built controls: "Controls you build by hand in `display()` are invisible to `getSettingDefinitions()`. They aren't indexed for global settings search…". The 1.13.0 changelog says the same from the user side: settings search "currently supports core settings and core plugins. Community plugins can migrate to the new settings API to appear in search results." (Sources: Settings guide "Imperative pages"; changelog 1.13.0.)
4. On 1.13+, if `getSettingDefinitions()` returns a non-empty array, `display()` is bypassed outright, so there is no path by which `new Setting(containerEl)` rows written in `display()` are indexed. (Source: `obsidian.d.ts:6629-6641`; migration guide "Common pitfalls".)

**Consequence for search coverage of custom UI**: if a bespoke row is represented as a `render` definition with a `name`, that name *is* part of the definition tree and is indexed; but the individual hand-built inputs inside an imperative `SettingPage.display()` are not. So the provider cards / secret pickers / model rows can contribute at most their row/page `name` to search, not their inner labels. (Verified from the type shape + guide warnings.)

Post-1.13.1 note: a later changelog entry adds optional `SettingDefinitionItem#id` ("like `key` in React"). It is **not** present in the 1.13.1 `obsidian.d.ts`, so do not design against it at this repo's pinned version.

## 5. Mixed mode: declarations + hand-drawn UI (answers Q5)

- **Same app version, same tab — no.** The d.ts is explicit: `display()` "is not called when `getSettingDefinitions()` returns a non-empty array; the tab is rendered declaratively from those definitions instead." The docs repeat that "`display()` is bypassed entirely on 1.13.0+ when `getSettingDefinitions()` returns a non-empty array, so calling `display()` won't refresh anything declarative." (Sources: `obsidian.d.ts:6629-6641`; migration guide "Common pitfalls"; Settings guide "Render callback".)
- **Custom UI is still possible — inside definitions.** Arbitrary DOM goes into a `render` callback or an imperative `SettingPage`; those are definitions, so they sit in the same tree as declarative rows. This is the correct way to keep custom UI, **not** keeping `display()`.
- **Across app versions — yes, officially ("Path B: dual support").** Keep `display()` for `< 1.13` and add `getSettingDefinitions()`; Obsidian 1.13+ calls definitions and skips `display()`, older versions call `display()`. The guides warn the two implementations must be kept in sync manually. (Source: migration guide "Path B".)
- A **misconception** worth flagging: keeping `display()` around to render "dynamic sections" on 1.13+ does not work — `display()` is skipped, not merged. (Seen in a third-party migration issue during research; the first-party d.ts/docs above are the authority.)

## 6. What this means for this repo (answers Q6)

### 6.1 The specific lint warning is silenced by implementing the method (any minAppVersion)

`prefer-setting-definitions` reports a class that extends `PluginSettingTab` (bare identifier superclass) and has no member named `getSettingDefinitions`, with **no `minAppVersion` gate**. Adding the method (even Path B) clears it. The repo's blanket override in `eslint.config.mjs:27-32` could then be removed. (Source: `dist/lib/rules/settingsTab/preferSettingDefinitions.js:16-33`; `dist/lib/index.js:135`.)

### 6.2 `minAppVersion` is `1.12.2`; the API needs `1.13.0`

`manifest.json:5` is `"1.12.2"` and `versions.json` maps every released version to `1.12.2`. The API is `@since 1.13.0`, so:

- **Path A (recommended by the guide):** bump `manifest.json` `minAppVersion` to `"1.13.0"` and add a `versions.json` entry for the new plugin version. Cost: users still on 1.12.x cannot update. Benefit: one implementation, `display()` deletion is lint-enforced (`no-deprecated-display`), and the full declarative feature set is guaranteed.
- **Path B (keep `1.12.2`):** implement `getSettingDefinitions()` **and** keep `display()`. This silences `prefer-setting-definitions` and keeps `require-display` satisfied. `no-deprecated-display` and `prefer-update-over-display` are no-ops below 1.13.0. (Sources: `requireDisplay.js:21-23`, `noDeprecatedDisplay.js:21-37`, `preferUpdateOverDisplay.js:23-27`.)

**Path B's hidden trap (verified empirically):** `noUnsupportedApi` is error-level (`dist/lib/index.js:120`) and builds a since-map from `obsidian.d.ts`. It does **not** flag the *declaration* of a `getSettingDefinitions` override, but it **does** flag member *calls* introduced by a 1.13 migration. Probe result on a throwaway `src/settings/__probe.ts` (since deleted) with `minAppVersion` 1.12.2:

```
'SettingTab.update' requires Obsidian v1.13.0, but minAppVersion is 1.12.2          obsidianmd/no-unsupported-api
'SettingTab.refreshDomState' requires Obsidian v1.13.0, but minAppVersion is 1.12.2 obsidianmd/no-unsupported-api
'PluginSettingTab.getControlValue' requires Obsidian v1.13.0, but minAppVersion is 1.12.2 obsidianmd/no-unsupported-api
```

So Path B can compile and lint, but any dynamic-refresh path using `this.update()` / `this.refreshDomState()` / `this.getControlValue(...)` needs `requireApiVersion("1.13.0")` guarding (the rule understands `if (requireApiVersion(...))` / `&&` guards — `noUnsupportedApi.js:135-181`). `npm run lint` currently passes on `src/settings/index.ts` (verified: `exit=0`), so no new errors exist today.

### 6.3 Binding does not fit the repo's settings architecture without overrides

This is the largest structural implication.

- Repo: `plugin.settings` is a **deep-readonly snapshot** (`SettingsSnapshot`, `src/settings/owner.ts:30-36`); the sole mutable copy is `settingsOwner`, and all writes go through `owner.apply` via `appSettings` (`src/settings/appSettings.ts:155-171`) and `providers` (`src/settings/providerSettings.ts:326-356`). `main.ts:83-88` wires them.
- Framework default: `control: { key: 'x' }` reads `this.plugin.settings.x` and, on change, mutates `this.plugin.settings.x` then calls `saveData()` — which would (a) fail to type-check against `readonly` fields, and (b) bypass `settingsOwner`'s single-writer invariant and its value-domain rules (`coerce*` in `src/settings/values.ts`, consumed by both load and change paths, per `logic.ts` / `appSettings.ts`).
- Therefore the tab **must** override `getControlValue` / `setControlValue` to route through the owner/facades, or express every row as `render` and keep calling the existing facades. Either way the "free" auto-binding and auto-save do not apply. (Verified against `obsidian.d.ts:5160-5173` + repo sources.)

### 6.4 Concrete UI inventory and its declarative mapping

| Current UI | File | Declarative route |
| --- | --- | --- |
| Report folder (text) | `generalTab.ts:16-26` | `control: { type: 'folder' }` or `text` + `setControlValue` |
| Date-field toggles (loop over `DATE_FIELD_TABLE`) | `generalTab.ts:34-45` | `control: { type: 'toggle' }` per field; dynamic array state needs `update()` or an override |
| Week-starts-Monday toggle | `generalTab.ts:47-56` | `control toggle` |
| Report language (text) | `generalTab.ts:58-68` | `control text` |
| UI language (dropdown) | `generalTab.ts:70-85` | `control dropdown`; `render` if it must call `applyLanguage()` + refresh as a side effect |
| Active-model dropdown with `optgroup`s | `modelTab.ts:55-` | no `optgroup` support in `dropdown`; needs `render` or an imperative page |
| Provider cards (add/remove, base URL, auth toggle, fetch models) | `modelTab.ts` (~434-660) | `type: 'list'` for the collection + `render` per card, or an imperative `SettingPage` |
| `SecretComponent` key control | `modelTab.ts:6,155,174-176` | no `secret` control; `render` with `SecretComponent` (the component exists since 1.11.1, `obsidian.d.ts:5613-5629`) |
| Template list / view / edit / delete + modal | `templateTab.ts:15-160` | `type: 'list'` + `render`/`action`; the editor stays a `Modal` (modals are always imperative) |
| Custom tab bar | `index.ts:42-93` | three `SettingDefinitionPage`s, or groups |
| `secretStorage.on("changed")` refresh subscription | `index.ts:95-97,102-107` | must move out of `display()`: register in the constructor via `plugin.registerEvent`, then `this.update()` on 1.13+ (guarded under Path B); `hide()` cleanup no longer runs for a bypassed `display()` |

`no-manual-html-headings` / `no-problematic-settings-headings` are **not currently triggered**: the tab-rendering code lives in free functions outside the `PluginSettingTab` class body, and `index.ts` only builds a tab bar (`createDiv`/`createEl`), not `h1`–`h6`. Replacing headings with group `heading`s keeps it that way. (Source: `noManualHtmlHeadings.js:18-65`.)

## 7. The lint rule, exactly (answers Q7)

`obsidianmd/settings-tab/prefer-setting-definitions` — source `eslint-plugin-obsidianmd/dist/lib/rules/settingsTab/preferSettingDefinitions.js`:

- **Fires when**: a `ClassDeclaration` or `ClassExpression` (a) is not `abstract`, (b) has a **bare `Identifier` superclass** named exactly `PluginSettingTab` (so `obsidian.PluginSettingTab` is out of scope — `shared.js:16-19`), and (c) has no class-body member named `getSettingDefinitions` — matched as either a method (`getSettingDefinitions() {}`) or a class field (`getSettingDefinitions = () => []`), computed keys excluded (`shared.js:25-45`). It reports on the class `id` (or the superclass / node fallback).
- **No `minAppVersion` gate** — the rule has `schema: []` and no version option, so it warns even at `1.12.2`. Message: "…will not appear in Obsidian's settings search for users on 1.13.0 or later. Consider adopting the declarative settings API." (Sources: `preferSettingDefinitions.js:3-34`; enabled at `dist/lib/index.js:135` as `warn`.)
- **Neighbours in the same family** (all `warn` unless noted, `dist/lib/index.js:132-137`):
  - `require-display` — fires only when `minAppVersion < 1.13.0` and a `PluginSettingTab` lacks `display()`.
  - `no-deprecated-display` — fires only when `minAppVersion >= 1.13.0` **and** `getSettingDefinitions` exists **and** `display()` still exists; fixable (removes `display()`).
  - `prefer-update-over-display` — fires only when `minAppVersion >= 1.13.0` and the tab calls `this.display()`; fixable → `this.update()`.
  - `no-unsupported-api` — `error`; gates every member call against the `@since` tags in `obsidian.d.ts` and the plugin's `minAppVersion`.
  - `no-manual-html-headings` — `error`; only inside a `PluginSettingTab` class body.

---

## 8. Conclusion: partially feasible

**What is clearly feasible**

- Adding `getSettingDefinitions()` to `TaskNotesAIHelperSettingTab` makes the tab and its declared settings appear in Obsidian 1.13+ settings search, and clears the `prefer-setting-definitions` warning.
- The six simple rows in `generalTab.ts` translate cleanly to `control` definitions (folder/text/toggle/dropdown), with `validate` for value-shape rules and `visible`/`disabled` for dependencies.
- Grouping via `group` / `list` / `page` is richer than the current hand-rolled tab bar; sub-pages are the closest analog to tabs.

**What makes it only partial**

- The tab-level `display()` cannot coexist with a non-empty definition array on the same app version; every custom surface (provider cards, secret control, template management, active-model optgroups) must be re-expressed as `render` / `type: 'list'` / an imperative `SettingPage`. That is a real UI rewrite, not an annotation.
- Custom controls rendered inside an imperative page contribute only the surrounding row/page `name` to search; their inner labels are not indexed. So search gains are uneven across the tab.
- The repo's single-writer settings architecture conflicts with the default `key` binding; `getControlValue` / `setControlValue` must be overridden or every row must use `render`. Auto-save cannot be used as-is.
- Version choice is forced: Path A (bump to `1.13.0`) or Path B (dual implementation, with `requireApiVersion` guards around `update()`/`refreshDomState()` under the error-level `no-unsupported-api` rule).

**Recommended shape for the follow-up ticket** (inference, not verified): treat the migration as two layers — (1) move the simple/general settings and section headings to declarative `control`/`group` definitions so they become searchable and the lint override can be deleted; (2) re-home the bespoke provider/secret/template UI as `render` rows and `type: 'list'` collections (optionally inside a `SettingPage`), keeping the existing `appSettings`/`providers` facades as the write path via an overridden `setControlValue`. Decide Path A vs Path B up front, because it changes both `manifest.json`/`versions.json` and the guards in the constructor's refresh listeners.

---

## 9. Source index

**First-party Obsidian — type definitions (`obsidian` npm 1.13.1, read 2026-09-25)**

- Local: `node_modules/obsidian/obsidian.d.ts` — `PluginSettingTab`/value hooks `:5149-5174`; `SettingControl` union `:5878`; `SettingControlBase` `:5884-5926`; `SettingDefinition` `:5932`; `SettingDefinitionAction` `:5938-5963`; `SettingDefinitionBase` `:5990-6025`; `SettingDefinitionGroup` `:6079-6140`; `SettingDefinitionItem` `:6147`; `SettingDefinitionList` `:6157-6194`; `SettingDefinitionPage` `:6202-6259`; `SettingDefinitionRender` `:6265-6285`; control interfaces `:5866, 6291, 6311, 6336, 6422, 6514, 6656, 6679, 6696`; `SettingPage` `:6461-6508`; `SettingTab` `:6549-6649`.
- Mirror: <https://cdn.jsdelivr.net/npm/obsidian@1.13.1/obsidian.d.ts>.

**First-party Obsidian — docs, changelog, API history**

- Settings guide: <https://docs.obsidian.md/Plugins/User+interface/Settings> (raw: `cdn.jsdelivr.net/gh/obsidianmd/obsidian-developer-docs@main/en/Plugins/User%20interface/Settings.md`).
- Migration guide "Migrate to declarative settings": <https://docs.obsidian.md/plugins/guides/migrate-declarative-settings> (raw path `en/Plugins/Guides/Migrate to declarative settings.md`).
- TypeScript reference: <https://docs.obsidian.md/Reference/TypeScript+API/PluginSettingTab/getSettingDefinitions>, <https://docs.obsidian.md/Reference/TypeScript+API/SettingDefinition>.
- Changelog 1.13.0 (API introduced, settings search, "community plugins can migrate to appear"): <https://obsidian.md/changelog/2026-05-28-desktop-v1.13.0/>.
- Changelog 1.13.1 (slider/color reset, page `displayValue`, group `search` auto-filter): <https://obsidian.md/changelog/2026-06-09-desktop-v1.13.1/>.
- Changelog 1.13.4 (current public desktop): <https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/>.
- API introduction commit: `obsidianmd/obsidian-api@3b873bb` — "Update to 1.13.0. Add new preliminary API for new settings configuration options."
- Later changelog entry adding optional `SettingDefinitionItem#id` (post-1.13.1; not in the 1.13.1 d.ts): <https://obsidian.md/changelog/>.

**Lint plugin (`eslint-plugin-obsidianmd` 0.4.2, read 2026-09-25)**

- `dist/lib/rules/settingsTab/preferSettingDefinitions.js:3-34`; `shared.js:8,16-19,25-45`; `requireDisplay.js:17-42`; `noDeprecatedDisplay.js:18-73`; `preferUpdateOverDisplay.js:20-59`; `noManualHtmlHeadings.js:18-65`; `noProblematicSettingsHeadings.js`; `dist/lib/rules/noUnsupportedApi.js:50-88,135-181,184-266`; `dist/lib/index.js:117-137`.
- Probe: throwaway `src/settings/__probe.ts` extending `PluginSettingTab` (created, linted, deleted) — `no-unsupported-api` errors reproduced at `minAppVersion` 1.12.2.

**This repo (read 2026-09-25)**

- `manifest.json:5`; `versions.json`; `package.json:22,24`; `eslint.config.mjs:27-32`.
- `src/settings/index.ts:25-109`; `generalTab.ts:12-86`; `modelTab.ts:6,155,174-176,434-660`; `templateTab.ts:15-160`; `secrets.ts`; `providerSettings.ts:295-356`; `owner.ts:30-75`; `appSettings.ts:37-171`; `logic.ts:50-185`; `main.ts:48-89`; `docs/adr/0008-internal-settings-api-for-secret-management.md`.
- `npx eslint src/settings/index.ts` → `exit=0` (current lint is clean; the `prefer-setting-definitions` rule is the only one suppressed for this file).
