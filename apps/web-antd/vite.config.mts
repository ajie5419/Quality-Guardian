import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api/, ''),
            // 真实后端地址 (原 backend-mock 现已重命名为 backend)
            target: 'http://localhost:5320/api',
            ws: true,
          },
          '/uploads': {
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/uploads/, ''),
            target: 'http://localhost:5320/uploads',
          },
        },
      },
    },
  };
});
