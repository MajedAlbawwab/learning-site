# Majed Albawwab — Blog

Bilingual (Arabic RTL + English LTR) static blog. Astro, TypeScript, plain CSS. English is the default locale. Designed per `design.md` ("Editorial Obsidian").

## Run locally

```sh
pnpm install
pnpm dev      # localhost:4321
pnpm dev:notes  # dev + auto-sync notes every 30s (recommended)
pnpm notes:update  # one-off: git pull .notes + sync (no dev server)
pnpm build    # astro build + pagefind
pnpm preview
pnpm check    # astro check
```

Node version: see `.nvmrc` (LTS). pnpm version: pinned via `packageManager` in `package.json`.

## Writing & publishing a post (Setup B)

Blog content lives in a **separate notes repo**: `MajedAlbawwab/learning_journy` (open it as an Obsidian vault).

1. In Obsidian, create or edit a Markdown note anywhere in the vault.
2. Add frontmatter with the required schema (see `src/content.config.ts`):

```yaml
---
title: "Post title"
description: "One-sentence summary"
date: 2026-11-04
lang: ar # "ar" or "en"
translationKey: my-first-post # optional, links AR + EN versions
tags: [notes, dev]
publish: true # REQUIRED — notes without this are never published
draft: false
---
```

3. Attach images to a subfolder named `images` next to the note.
4. Commit + push the **notes repo**.
5. A workflow in `MajedAlbawwab/learning_journy` (add `.github/workflows/notify-site.yml` below) dispatches `notes-updated` to this site repo. This repo's `build.yml` then checks out the notes repo, runs `scripts/sync-notes.mjs` (copies only `publish: true` notes + images into `src/content/blog/`), builds, and deploys.

> A note is published **only** with `publish: true`. `draft: true` is local-dev only. Notes without `publish: true` never appear in builds, feeds, search, or the sitemap.

### Local auto-sync (`pnpm dev:notes`)

By default `pnpm dev:notes` pulls the notes repo into `.notes/` (read-only mirror) and syncs publishable notes to `src/content/blog/` before starting `astro dev`. While the dev server runs, it polls every 30 seconds:

- If `.notes/` HEAD changed (git) or any `.md` / image mtime changed (local-vault mode) → runs `pnpm notes:update`, prints a summary (`N published · M skipped · K removed · warnings`), and Astro's hot reload picks up the changed files.
- If nothing changed → does nothing (no copy, no reload).
- If `git pull` fails (offline, conflict) → prints a clear warning and keeps serving the last good content; the dev server never crashes.

To preview **unsaved / unpushed** notes instantly, point the watcher at your live Obsidian vault (skips git entirely):

```sh
# .env.local  (gitignored)
NOTES_LOCAL_PATH=C:\Users\majed\Documents\Obsidian\VaultName
```

Copy `.env.example` to `.env.local` and edit the path. When `NOTES_LOCAL_PATH` is set, `pnpm notes:update` and `pnpm dev:notes` read from that folder instead of `.notes/` and never call `git`.

### Recommended Obsidian settings

- Settings > Files & links > **Use [[Wikilinks]]: off**, **New link format: Relative path to file**
- Settings > Files & links > **Default location for new attachments**: "In subfolder under current folder" named `images`

Wikilinks and callouts (`> [!note]`) are handled at build time if left on. Mermaid, math, and Dataview render as plain code blocks.

### Notify workflow (add to notes repo `MajedAlbawwab/learning_journy`)

File: `.github/workflows/notify-site.yml`

```yaml
name: notify-site
on:
  push:
    branches: [main]
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.SITE_DISPATCH_TOKEN }}
          repository: <OWNER>/<SITE-REPO>
          event-type: notes-updated
```

`SITE_DISPATCH_TOKEN` needs `repo` scope (or contents:write) for the site repo.

### One-time setup in this site repo

- Add secret `NOTES_REPO_TOKEN`: a fine-grained PAT (contents:read) on `MajedAlbawwab/learning_journy`.
- Add secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the Pages deploy step.
- Set the site repo visibility/branches so `main` is the production branch.

## Deploy to Cloudflare Pages

Connected-repo settings (or the GitHub Action above):

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output directory: `dist`
- Node version: `.nvmrc`

`astro.config.mjs` `site` is `https://majed-albawwab.pages.dev`. Update it when adding a custom domain so RSS, sitemap, and canonical URLs are correct.

## Content structure

- `src/content/blog/` — destination for synced notes (Setup B). Sample posts are included for local dev.
- `src/content.config.ts` — Zod schema, validated at build time (invalid published notes fail the build).
- `src/i18n/en.json`, `src/i18n/ar.json` — UI strings. Add a key to both files; use `t(locale)`. No hardcoded UI text in components.
- `src/styles/tokens.css` — design tokens from `design.md`. All CSS uses logical properties (`margin-inline-start`, etc.) for RTL correctness.

## Dependencies (why each was added)

| Package | Why |
|---|---|
| `astro` | Framework — zero JS by default, i18n routing, Markdown |
| `@astrojs/sitemap` | Sitemap generation (SEO) |
| `@astrojs/rss` | RSS feeds per language (`/rss.xml`, `/ar/rss.xml`) |
| `remark-wiki-link`, `mdast-util-wiki-link` | Convert Obsidian `[[wikilinks]]` to standard Markdown |
| `remark-gfm` | GitHub-flavored Markdown (tables, task lists) |
| `@astrojs/markdown-remark` | Required by Astro 7 for unified remark/rehype processors |
| `zod` | Frontmatter validation in `src/content.config.ts` |
| `pagefind` (dev) | Static bilingual search index (Arabic + English) |
| `@astrojs/check`, `typescript` (dev) | `pnpm check` type checking |

Per `project.md`: no dependency without a documented reason. No CSS framework, no client framework.
