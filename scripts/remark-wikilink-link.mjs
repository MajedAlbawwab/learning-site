// Remark plugin: converts Obsidian `[[wikilinks]]` inside note bodies into
// plain text (already handled by remark-wiki-link for bare links). This
// plugin is a no-op placeholder so the pipeline stays explicit — wikilinks
// are handled by `remark-wiki-link` in astro.config.mjs and checked against
// the published manifest `src/content/blog/.published-slugs.json` to decide
// whether to render as `<a>` or plain text.
//
// Since remark-wiki-link already renders `[[Target]]` as `<a class="wikilink">…</a>`,
// this file exists only to document the contract and to provide a future hook
// for title-cased slug resolution. It currently does nothing intentionally.
//
// To make unpublished targets render as plain text (not a link), the sync step
// rewrites them ahead of time. This plugin can add a rehype step later if needed.

export default function remarkWikilinkLink() {
  return () => {};
}
