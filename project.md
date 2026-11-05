# project.md — Portfolio & Blog: Technical Spec

A personal bilingual (Arabic RTL + English LTR) portfolio with a blog. Static site, no server, no database, no CMS. Blog posts are Markdown files written in Obsidian and stored in GitHub. Publishing happens by pushing to GitHub.

Instruction to the AI: follow this file for all technical decisions. Visual design is defined separately in `design.md`; follow it for everything about look and feel. Page layout and site structure are not specified here and will be decided by the owner during the build.

---

## 1. Goals

1. **Simple.** Few dependencies, no client-side framework, readable code the owner can maintain alone.
2. **Cheap and easy to host.** Static output that deploys for free on common hosts with a git push.
3. **Content lives in plain Markdown.** The owner writes in Obsidian. The website reads those files at build time. No copy-pasting into a CMS.
4. **Bilingual from day one.** Arabic and English content, correct RTL and LTR handling.
5. **Fast.** Ships almost no JavaScript by default. Good Lighthouse scores without tuning.

Non-goals: user accounts, comments backend, admin panel, database, server-side rendering.

---

## 2. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Astro** (latest stable) | Built for content sites, ships zero JS by default, first-class Markdown and i18n routing |
| Language | TypeScript (only where needed, e.g. content schema and config) | Typed frontmatter catches broken posts at build time |
| Styling | **Plain CSS with custom properties** (no Tailwind, no CSS framework) | Tokens come directly from `design.md`; fewer dependencies |
| Content | Markdown / MDX-free Markdown via Astro **content collections** | Obsidian notes are plain Markdown |
| Syntax highlighting | **Shiki** (built into Astro) with a custom theme matching `design.md` syntax colors | No runtime JS |
| Search | **Pagefind** (static index generated at build) | Works on static hosting, supports Arabic, no backend |
| Feeds / SEO | `@astrojs/rss`, `@astrojs/sitemap` | Standard, official integrations |
| Package manager | **pnpm** (use only pnpm; never mix with npm or yarn) | Fast, disk-efficient, strict dependency resolution |
| Interactivity | Vanilla JS in small inline scripts only (e.g. typing animation, copy-code button) | No React/Vue/Svelte unless absolutely required |

Dependencies must stay minimal. Before adding any package, check whether Astro or the browser already does it. Document every added dependency and the reason in `README.md`.

---

## 3. Hosting and deployment

The build output is a static `dist/` folder, so it can run on any static host.

**Recommended: Cloudflare Pages.** Free, fast global CDN, connects directly to GitHub, builds on every push, free custom domain and HTTPS.

Alternatives that also work with zero changes: **Netlify**, **Vercel**, **GitHub Pages** (requires setting `site` and, for project pages, `base` in `astro.config`).

Deployment settings (any host):

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm build`
- Output directory: `dist`
- Node version: set in `.nvmrc` (use current LTS)
- pnpm version: pinned in `package.json` via the `packageManager` field (e.g. `"packageManager": "pnpm@<version>"`) so every host and machine uses the same one. On Cloudflare Pages, Netlify, and Vercel, pnpm is detected automatically from `pnpm-lock.yaml`
- Production branch: `main`

Rules:
- No server-side code, no serverless functions, no environment-specific secrets in the main build.
- The site must build with a single command on a clean checkout.
- Set `site` in `astro.config` to the final domain so RSS, sitemap, and canonical URLs are correct.

---

## 4. Content pipeline (Obsidian + GitHub)

### Source of truth

Blog posts are Markdown files with YAML frontmatter, written in Obsidian and stored in GitHub. The website reads them during the build. Choose one of the two setups below. **Setup A is the default** unless the owner says otherwise.

#### Setup A (default): vault folder inside the site repo

- The repo contains a content folder, e.g. `src/content/blog/`.
- That folder is opened as an Obsidian vault (or a folder inside a larger vault).
- The owner syncs using the **Obsidian Git** community plugin (auto commit and push on an interval) or normal git.
- Push to `main` triggers the host's automatic build and the post goes live.

Simplest option. One repo, no extra CI.

#### Setup B: separate notes repo

Use this if the owner's vault is a larger personal knowledge base that lives in its own repository and should stay private.

- Notes repo (can be private) holds the vault, synced by Obsidian Git.
- Site repo checks out the notes repo during build (via GitHub Action, git submodule, or a build-time script) and copies only publishable notes into the content collection.
- A push to the notes repo triggers a site rebuild (GitHub Action `repository_dispatch` or a scheduled workflow).

Example GitHub Action for the site repo (Cloudflare Pages or any host that deploys from the `dist` folder can be wired to this, or the host can simply build from git with a pre-build script):

```yaml
name: build
on:
  push: { branches: [main] }
  repository_dispatch: { types: [notes-updated] }
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: OWNER/notes-repo        # replace
          token: ${{ secrets.NOTES_REPO_TOKEN }}
          path: .notes
      - uses: pnpm/action-setup@v4          # reads the version from package.json "packageManager"
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: node scripts/sync-notes.mjs .notes src/content/blog
      - run: pnpm build
```

`scripts/sync-notes.mjs` copies only notes that pass the publish rules below, along with their referenced attachments.

### Publish rules (important: prevents leaking private notes)

A note is published only if its frontmatter contains `publish: true`. Notes without it are never copied into the site and never appear in builds, feeds, search, or the sitemap. Notes with `draft: true` are published only in local dev, not in production.

### Frontmatter schema

Validate with a Zod schema in `src/content.config.ts`. The build must fail with a clear error if a published note is invalid.

```yaml
---
title: "Post title"                # required
description: "One-sentence summary" # required, used for SEO and index
date: 2026-11-04                   # required, YYYY-MM-DD
updated: 2026-11-10                # optional
lang: ar                           # required: "ar" or "en"
translationKey: my-first-post      # optional, links the Arabic and English versions of the same post
tags: [notes, dev]                 # optional
cover: ./images/cover.png          # optional
publish: true                      # required to appear on the site
draft: false                       # optional
---
```

- Slugs come from the filename (kebab-case recommended). Allow Arabic filenames but slugify them to URL-safe slugs, and let the owner override with an optional `slug` field.
- Posts in different languages with the same `translationKey` are linked so the language switcher on a post goes to its translation (falling back to the language home when no translation exists).
- Reading time is computed at build time per language.

### Obsidian-specific handling

Recommended vault settings (document in `README.md`):
- Settings > Files & links > **Use [[Wikilinks]]: off**, **New link format: Relative path to file**. This keeps content as standard Markdown.
- Settings > Files & links > **Default location for new attachments**: "In subfolder under current folder" named `images`.

The build must still handle what Obsidian commonly produces:

| Obsidian feature | Handling |
|---|---|
| Frontmatter / properties | Parsed as YAML |
| `[[Wikilinks]]` and `![[image.png]]` embeds | Convert with a remark plugin (e.g. `remark-wiki-link` or equivalent) in case the owner leaves them on. Unresolved links render as plain text, not broken links |
| Callouts (`> [!note]`) | Convert with a rehype/remark callouts plugin, styled per `design.md` (borders, no shadows) |
| `#tags` inline | Optional. Frontmatter `tags` is the source of truth |
| Attachments / images | Copied to the build, referenced with relative paths, optimized by Astro's image handling where possible |
| Mermaid, math, Dataview | Not supported at launch. Render as plain code blocks and do not break the build |

### GitHub-only workflow (no Obsidian)

The owner can also add or edit Markdown files directly on GitHub (web editor or any editor). The same schema and publish rules apply.

---

## 5. Internationalization

- Use Astro's built-in i18n routing with locales `ar` and `en`. The default locale is configurable in one place (`astro.config`). **Ask the owner which language is the default before building.**
- URL pattern: `/{locale}/...` for both locales (or no prefix for the default, per owner preference).
- Every page sets `<html lang dir>` correctly (`rtl` for Arabic, `ltr` for English).
- UI strings (nav labels, buttons, "read more") live in two dictionary files, `src/i18n/ar.json` and `src/i18n/en.json`, accessed through one `t()` helper. No hardcoded UI text in components.
- Add `hreflang` alternates and a language switcher that preserves the current page where a translation exists.
- All CSS must use logical properties, as specified in `design.md`.

---

## 6. Features checklist

Required at launch:
- Blog posts rendered from Markdown, with tags, dates, and reading time
- Syntax-highlighted code blocks with a copy button
- RSS feed per language
- Sitemap and `robots.txt`
- SEO: title, description, canonical, Open Graph and Twitter meta, `hreflang`
- Static search with Pagefind, working in Arabic and English
- 404 page
- Skip-to-content link, keyboard navigation, `prefers-reduced-motion` respected

Optional later (do not build unless asked):
- Open Graph image generation per post
- View counts or analytics (use a privacy-friendly script such as Cloudflare Web Analytics, no cookie banner)
- Comments (e.g. Giscus backed by GitHub Discussions)
- Newsletter

---

## 7. Repository layout (code structure only)

```
/
├─ src/
│  ├─ content/blog/        # Markdown posts (Obsidian vault folder in Setup A)
│  ├─ content.config.ts    # collection schema (Zod)
│  ├─ components/
│  ├─ layouts/
│  ├─ pages/               # routes, set up by owner during the build
│  ├─ i18n/                # ar.json, en.json, t() helper
│  ├─ styles/              # tokens.css (from design.md), global.css
│  └─ scripts/             # tiny vanilla JS modules
├─ public/                 # fonts, favicon, robots.txt
├─ scripts/sync-notes.mjs  # Setup B only
├─ .nvmrc
├─ astro.config.mjs
├─ package.json            # includes the "packageManager" field for pnpm
├─ pnpm-lock.yaml          # commit this file
└─ README.md
```

---

## 8. Fonts and assets

- Font choices are defined in `design.md`.
- Thmanyah has license restrictions on hosting and modifying its files. Before self-hosting Thmanyah in `public/fonts/`, confirm the license permits web embedding. If it does not, use the fallback Arabic fonts listed in `design.md`.
- Self-host JetBrains Mono and Source Serif 4 (both open-source) as `woff2` files instead of loading from a third-party CDN, with `font-display: swap`.
- Preload only the critical font files (the UI font used above the fold).
- Images: use Astro's `<Image>` for local images, serve modern formats (AVIF/WebP), and always include `alt` text and explicit dimensions.

---

## 9. Quality bar

- Lighthouse 95+ on Performance, Accessibility, Best Practices, and SEO on the home page and a blog post, mobile.
- Zero console errors. No layout shift from fonts or images.
- Works with JavaScript disabled for everything except the typing animation, copy buttons, and search.
- Passes `astro check` with no type errors.
- Tested in both RTL and LTR on mobile (360px) and desktop.

---

## 10. Working agreement for the AI

1. Before writing code, list assumptions and anything that needs an owner decision (default language, Setup A or B, domain name, host). Ask only what is truly blocking; otherwise proceed with the defaults in this file.
2. Build in small, working steps: project setup and tokens, then content pipeline and schema, then i18n and routing, then components, then search, RSS, and SEO. Verify the build passes after each step.
3. Keep the code simple and commented where behavior is not obvious. Prefer clarity over cleverness.
4. Do not add a dependency, framework, or service that is not in this file without explaining why and getting approval.
5. Write a `README.md` covering: how to run locally, how to write and publish a post from Obsidian, the recommended Obsidian settings, how to deploy to Cloudflare Pages, and how to add a new language string.
6. Never publish a note that lacks `publish: true`.
