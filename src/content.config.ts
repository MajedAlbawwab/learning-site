import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    lang: z.enum(['ar', 'en']),
    slug: z.string().optional(),
    translationKey: z.string().optional(),
    tags: z
      .array(z.string())
      .default([])
      .transform((tags) =>
        Array.from(
          new Set(tags.map((t) => t.trim().replace(/^#/, '').trim().toLowerCase()).filter(Boolean))
        )
      ),
    cover: z.string().optional(),
    publish: z.boolean(),
    draft: z.boolean().default(false)
  })
});

export const collections = { blog };
