import { defineEventHandler, setResponseStatus, setHeader } from 'h3';

export default defineEventHandler((event) => {
  const path = event.path;

  // 在控制台打印未匹配的请求路径，方便调试
  console.log(`[404] API not found: ${path}`);

  // 设置 HTTP 状态码为 404
  setResponseStatus(event, 404);

  // 设置 Content-Type 为 application/json
  setHeader(event, 'Content-Type', 'application/json');

  // 返回 JSON 格式的 404 错误响应
  return {
    code: 404,
    message: 'API not found',
    path,
  };
});
