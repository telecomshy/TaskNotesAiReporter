# Changing plugin metadata after publication (name / id / description / repo) — primary sources

- **Question**: Once a plugin is live in the Obsidian Community directory, can you still change (a) its display **name**, (b) its **`id`**, (c) its listing / manifest **description**, and (d) its **GitHub repository** location?
- **Pinned upstream**: `obsidianmd/obsidian-developer-docs@c56c7e770ba25dd0ea392aacf4588f9425970d36` (read 2026-09-24). Re-check when the docs move.
- **Method**: raw Markdown via `gh api … -H "Accept: application/vnd.github.raw"`. `docs.obsidian.md` renders client-side and direct fetches fail on this machine (no DNS for `raw.githubusercontent.com`), so the source repo is the only reachable copy — same technique as `obsidian-community-plugin-submission.md`.
- **Scope**: investigation only; no manifest, version, or source change.

Companion to `obsidian-community-plugin-submission.md`, which covers the pre-publication path. This file covers **after** the listing exists.

---

## TL;DR

- **Display name — changeable.** Edit `name` in `manifest.json`; an invalid name delists the plugin until fixed. (Themes are the exception: theme names are frozen.)
- **`id` — not changeable** after publication.
- **Description — two separate fields.** The directory listing's *short and long description* is edited on the management page (**Edit listing**), independent of any release. The `manifest.json` `description` is a different field, reviewed by the scanner.
- **GitHub repo — moving to another user/org needs a directory admin.** A same-owner repository *rename* is not addressed by any page read; treat as unverified.

---

## 1. Verified facts

### F1. The `id` is immutable once published

- "You can't change an entry's identifier after it's been published." (Source: `en/Community directory/Frequently asked questions.md:23`.)
- "Be aware that changing the identifier resets all downloads for your plugin or theme, and requires all current users to reinstall it." (Source: `…Frequently asked questions.md:25`.)
- The `id` constraints are unchanged: lowercase letters and hyphens only, can't end with `plugin`, can't contain `obsidian`. (Source: `en/Reference/Manifest.md:27`.)

### F2. A plugin's display name **is** changeable; a theme's is not

- "You can update your plugin names in the community directory by changing the `name` field in `manifest.json`. If the new name is invalid, the directory delists the plugin until you resolve the problem." (Source: `en/Reference/Manifest.md:37`.)
- "Theme names cannot be changed once the theme has been submitted to the community directory." (Source: `en/Reference/Manifest.md:37`.)
- Practical consequence: a rename is a manifest edit, and a bad name is a **delisting**, not a silent rejection.

### F3. The name rules a new name must satisfy

(Source: `en/Reference/Manifest.md:39-45`.)

- Short and descriptive.
- Prefer English and Basic Latin characters only.
- No punctuation except hyphens, plus sign, and parentheses; no emoji or special characters.
- Must not use the name of an Obsidian core plugin or feature on its own (e.g. "Live Preview", "Bases").
- Must not include the word "Obsidian" or variants like "Obsi-"/"-sidian".
- Must be unique across every plugin and theme.
- No profanity or Code-of-Conduct-prohibited terms.
- A plugin name may not contain the word "Plugin".

### F4. The listing description is editable from the management page

- "Select **Edit listing** to update the entry's icon, short and long description, categories, payment type, and screenshots, then select **Save**." (Source: `en/Community directory/Manage your plugin or theme.md:33`.)
- This is the directory-side copy, edited on the website — **no release required**.
- It is distinct from `manifest.json`'s `description`, which is a required plugin field (Source: `en/Reference/Manifest.md:26`) and is what the automated review scans (Source: `Manage your plugin or theme.md:21`).

### F5. Afterwards, updates need no re-submission — a new release is enough

- "Do I need to resubmit my plugin or theme for every update? No. … After that, making a new release is enough for users to receive the update." (Source: `en/Community directory/Frequently asked questions.md:17-19`.)
- "Address any items in your repository, then publish a new release to trigger a fresh review." (Source: `en/Community directory/Manage your plugin or theme.md:23`.)
- Checks can be forced instead of waiting: **Check for new releases** (`Frequently asked questions.md:96-98`) and **Request review** / **Review branch** (`Manage your plugin or theme.md:23,27`).

### F6. Moving the repo to a different GitHub user requires a directory admin

- "How do I transfer my plugin to a different GitHub user? … Only admins can transfer a plugin to a different GitHub location. Create a post in the `#community-directory` channel on Discord that includes the new and old repository locations, and whether you've received permission from the original author." (Source: `en/Community directory/Frequently asked questions.md:31-33`.)

### F7. Directory ownership transfer is a separate mechanism from moving the repo

- **Transfer ownership** moves the entry within the directory (to an organization or another directory handle) and does **not** move the GitHub repository. (Source: `en/Community directory/Manage your plugin or theme.md:49-55`.)

---

## 2. Unverified / open

- **Same-owner repository rename.** None of the pages read (`Manifest`, `FAQ`, `Manage your plugin or theme`) state whether renaming a GitHub repo *in place* (owner unchanged, new repo name) keeps the directory working. The directory stores the linked repo (`Manage your plugin or theme.md:13`) and the legacy listing carries `repo: owner/name` (prior note, `obsidian-releases/.github/workflows/mirror-community-json.yml`). GitHub itself redirects a renamed repo's old URL, but whether the directory's stored link and scanner follow that redirect is **UNCONFIRMED**. Ask in `#community-directory` before relying on it.
- **Does editing `manifest.json` `description` alone update the listing?** The directory "processes the `manifest.json` at the HEAD of your repository's default branch" (prior note quoting `Submit your plugin.md:57`), so a review run should pick it up; a new release is the documented trigger (F5). Treat "no release needed" as **INFERENCE**.
- **Which description shows in the in-app Browse list.** The prior note (F7) records that Obsidian reads `community-plugins.json`, mirrored hourly from `community.obsidian.md`, carrying `name`/`author`/`description`. That chain points at the *directory* description (F4) rather than the manifest one, but the short-vs-long vs manifest mapping is not spelled out by a primary source. **INFERENCE.**

---

## 3. Source index

- `obsidianmd/obsidian-developer-docs@c56c7e770ba25dd0ea392aacf4588f9425970d36`
  - `en/Reference/Manifest.md` — name rules and changeability, `id` rules, required fields.
  - `en/Community directory/Frequently asked questions.md` — identifier immutability, no-resubmission, repo transfer, review checks.
  - `en/Community directory/Manage your plugin or theme.md` — Edit listing, fix a failed review, transfer ownership.
- `docs/research/obsidian-community-plugin-submission.md` (this repo) — pre-publication path, submission flow, release mechanics, `community-plugins.json` mirror.
- Tooling: `gh api` with `Accept: application/vnd.github.raw` (GitHub CLI 2.100.0).
