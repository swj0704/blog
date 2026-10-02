import { getCollection } from 'astro:content';

export const SITE = {
  title: 'wonjoon.log',
  description: '안드로이드 개발자로 일하며 겪은 것들을 적습니다.',
  author: 'Wonjoon Shin',
  github: 'https://github.com/swj0704',
};

// draft 글은 로컬 개발 서버에서만 보입니다.
export async function getPosts() {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;

export const formatDate = (date: Date) =>
  date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
