import process from 'node:process';

import errorHandler from './error';

// Force restart timestamp: 2026-01-28 T06:00:00
process.env.COMPATIBILITY_DATE = new Date().toISOString();
export default defineNitroConfig({
  ignore: ['node_modules', 'uploads', '.output', '.nitro', 'dist'],
  devErrorHandler: errorHandler,
  errorHandler: '~/error',
  // Serve static files from uploads directory
  publicAssets: [
    {
      baseURL: '/uploads',
      dir: './uploads',
      maxAge: 60 * 60 * 24 * 30, // 30 days cache
    },
  ],
  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers':
          'Accept, Authorization, Content-Length, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, X-CSRF-TOKEN, X-Requested-With',
        'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': '*',
      },
    },
    '/uploads/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
  },
});
