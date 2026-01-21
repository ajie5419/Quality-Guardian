import { defineEventHandler, getHeaders, getRequestURL } from 'h3';

export default defineEventHandler((event) => {
  const url = getRequestURL(event);
  const headers = getHeaders(event);

  return {
    message: 'Debug route info',
    timestamp: new Date().toISOString(),
    request: {
      fullUrl: url.href,
      pathname: url.pathname,
      search: url.search,
      method: event.method,
    },
    headers: {
      host: headers.host,
      origin: headers.origin,
      referer: headers.referer,
    },
    nitroInfo: {
      routeRules: 'Check nitro.config.ts for route rules',
      apiPrefix: 'Nitro api/ folder maps to /api/ URL prefix',
    },
  };
});
