import { defineEventHandler } from 'h3';

export default defineEventHandler((event) => {
  const method = event.method;
  const path = event.path;
  const timestamp = new Date().toISOString();

  // 记录所有 API 请求
  console.log(`[API-Request] ${timestamp} ${method} ${path}`);

  // 不返回任何值，让请求继续执行
});
