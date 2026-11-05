// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkWikiLink from 'remark-wiki-link';
import remarkGfm from 'remark-gfm';

const site = 'https://majed-albawwab.pages.dev';

// Shiki theme for code blocks, mapped to design.md tokens.
const shikiTheme = {
  name: 'editorial-obsidian',
  settings: [
    { scope: ['comment'], settings: { italic: false, foreground: '#6e6c65' } },
    { scope: ['keyword', 'storage', 'storage.type'], settings: { italic: false, foreground: '#d97757' } },
    { scope: ['string', 'string.regexp', 'string.other.link'], settings: { italic: false, foreground: '#e0a368' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.other'], settings: { italic: false, foreground: '#faba7d' } },
    { scope: ['entity.name.function', 'entity.name.tag', 'entity.name.type'], settings: { italic: false, foreground: '#ffb59e' } },
    { scope: ['support.type', 'support.class', 'support.function'], settings: { italic: false, foreground: '#e5e2de' } },
    { scope: ['variable', 'variable.language'], settings: { italic: false, foreground: '#dbc1b9' } },
    { scope: ['punctuation'], settings: { italic: false, foreground: '#9e9c94' } }
  ],
  colors: {
    'editor.background': '#131312',
    'editor.foreground': '#e5e2de',
    'editor.lineHighlightBackground': '#20201e',
    'editorLineNumber.foreground': '#6e6c65'
  }
};

export default defineConfig({
  site,
  integrations: [sitemap({})],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ar'],
    routing: { prefixDefaultLocale: false }
  },
  markdown: {
    shikiConfig: { theme: shikiTheme, wrap: true },
    remarkPlugins: [[remarkWikiLink, { wikiLinkClassName: 'wikilink' }], remarkGfm]
  }
});
