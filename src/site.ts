import { getCollection } from 'astro:content';

export const SITE = {
  title: '신원준의 개발 기록',
  description: '안드로이드 개발자로 일하며 겪은 것들을 적습니다.',
  author: '신원준',
  github: 'https://github.com/swj0704',
};

// draft 글은 로컬 개발 서버에서만 보입니다.
async function getEntries(kind: 'post' | 'log') {
  const entries = await getCollection(
    'posts',
    ({ data }) => data.kind === kind && (import.meta.env.DEV || !data.draft),
  );
  return entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const getPosts = () => getEntries('post');
export const getLogs = () => getEntries('log');

export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;

export const formatDate = (date: Date) =>
  date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
