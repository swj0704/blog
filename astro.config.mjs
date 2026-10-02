import { defineConfig } from 'astro/config';

// 커스텀 도메인(public/CNAME)을 쓰므로 base 는 '/' 그대로 둡니다.
export default defineConfig({
  site: 'https://blog.won-joon.com',
  base: '/',
});
