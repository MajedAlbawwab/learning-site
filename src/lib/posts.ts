// Shared helpers: reading time, formatting, translation linking.
import type { CollectionEntry } from 'astro:content';

export function readingTime(text: string, lang: 'ar' | 'en'): number {
  const words = text.replace(/[#>*`\-\[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / (lang === 'ar' ? 150 : 200)));
}

export function formatDate(date: Date, locale: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

export function slugOf(entry: { data: { slug?: string }; id: string }): string {
  return entry.data.slug ?? entry.id.replace(/\.(md|mdx)$/, '');
}

export function getPublished(entries: CollectionEntry<'blog'>[], lang: 'ar' | 'en', includeDrafts = false) {
  return entries
    .filter((e) => e.data.publish && e.data.lang === lang && (includeDrafts || !e.data.draft))
    .sort((a, b) => +b.data.date - +a.data.date);
}

export function getPublishedMixed(entries: CollectionEntry<'blog'>[], currentLang: 'ar' | 'en', includeDrafts = false) {
  const published = entries.filter((e) => e.data.publish && (includeDrafts || !e.data.draft));
  const byKey = new Map<string, CollectionEntry<'blog'>[]>();
  for (const entry of published) {
    const key = entry.data.translationKey ?? `__solo__${entry.id}`;
    const group = byKey.get(key) ?? [];
    group.push(entry);
    byKey.set(key, group);
  }
  const mixed: CollectionEntry<'blog'>[] = [];
  for (const group of byKey.values()) {
    const current = group.find((e) => e.data.lang === currentLang);
    mixed.push(current ?? group[0]);
  }
  return mixed.sort((a, b) => +b.data.date - +a.data.date);
}

export function findTranslation(
  entry: CollectionEntry<'blog'>,
  all: CollectionEntry<'blog'>[]
): CollectionEntry<'blog'> | undefined {
  if (!entry.data.translationKey) return undefined;
  const otherLang = entry.data.lang === 'ar' ? 'en' : 'ar';
  return all.find(
    (e) => e.data.publish && !e.data.draft && e.data.lang === otherLang && e.data.translationKey === entry.data.translationKey
  );
}
