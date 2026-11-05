import rss from '@astrojs/rss';
import { getPublished, slugOf } from '../../lib/posts';
import { t } from '../../i18n';
import { getCollection } from 'astro:content';

export const GET = async () => {
  const posts = await getCollection('blog');
  const ar = getPublished(posts, 'ar');
  const d = t('ar');
  return rss({
    title: d.rss.title,
    description: d.rss.description,
    site: 'https://majed-albawwab.pages.dev/ar',
    items: ar.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/ar/blog/${slugOf(post)}`,
      categories: post.data.tags
    }))
  });
};

