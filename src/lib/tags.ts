// Tag normalization, slugification, and indexing.
// Tags are shown exactly as written (after normalization, no translation).
import type { CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n';

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').trim().toLowerCase();
}

export function slugifyTag(tag: string): string {
  return normalizeTag(tag).replace(/\s+/g, '-').replace(/[^\w\-؀-ۿ]/g, '').replace(/-+/g, '-');
}

export interface TagInfo {
  /** Normalised display label, e.g. "dns" or an Arabic tag exactly as written. */
  label: string;
  /** URL-safe slug for /tags/{slug}/ */
  slug: string;
  count: number;
  posts: CollectionEntry<'blog'>[];
}

export function getTagIndex(
  posts: CollectionEntry<'blog'>[],
  locale: Locale
): TagInfo[] {
  const normalized = posts.map((p) => {
    const tags = [...new Set(p.data.tags.map(normalizeTag).filter(Boolean))];
    return { post: p, tags };
  });

  const map = new Map<string, TagInfo>();
  for (const { post, tags } of normalized) {
    for (const tag of tags) {
      const slug = slugifyTag(tag);
      const existing = map.get(slug);
      if (existing) {
        existing.count++;
        existing.posts.push(post);
      } else {
        map.set(slug, { label: tag, slug, count: 1, posts: [post] });
      }
    }
  }

  const tags = [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, locale === 'ar' ? 'ar' : 'en', { numeric: true, sensitivity: 'base' });
  });

  for (const t of tags) {
    t.posts.sort((a, b) => +b.data.date - +a.data.date);
  }
  return tags;
}

export function getPostsForTag(
  posts: CollectionEntry<'blog'>[],
  tagSlug: string,
  locale: Locale
): { tag: TagInfo; posts: CollectionEntry<'blog'>[] } | null {
  const index = getTagIndex(posts, locale);
  const tag = index.find((t) => t.slug === slugifyTag(tagSlug)) ?? null;
  if (!tag) return null;
  return { tag, posts: tag.posts };
}
