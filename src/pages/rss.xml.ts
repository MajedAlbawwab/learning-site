import rss from '@astrojs/rss';
import { getPublished, slugOf } from '../lib/posts';
import { t } from '../i18n';
import { getCollection } from 'astro:content';

export const GET = async () => {
  const posts = await getCollection('blog');
  const en = getPublished(posts, 'en');
  const d = t('en');
  return rss({
    title: d.rss.title,
    description: d.rss.description,
    site: 'https://majed-albawwab.pages.dev',
    items: en.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${slugOf(post)}`,
      categories: post.data.tags
    }))
  });
};
