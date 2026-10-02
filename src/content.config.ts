import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    // 'log' 는 일지(개발, 공부 등 그날의 기록). 글 목록이 아니라 /log/ 에 모인다.
    kind: z.enum(['post', 'log']).default('post'),
  }),
});

export const collections = { posts };
