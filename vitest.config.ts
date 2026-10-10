import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Vue from '@vitejs/plugin-vue';
import VueJsx from '@vitejs/plugin-vue-jsx';
import { configDefaults, defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [Vue(), VueJsx()],
  test: {
    environment: 'happy-dom',
    exclude: [
      ...configDefaults.exclude,
      // Playwright owns every e2e directory.
      '**/e2e/**',
      // E2E runs copy source snapshots (including *.test.ts) into
      // output/playwright/<runId>/ for fingerprint evidence. Those copies are
      // not part of the workspace sources and must never be collected here.
      '**/output/**',
    ],
    alias: {
      '#': path.resolve(__dirname, './apps/web-antd/src'),
      '@': path.resolve(__dirname, './apps/weapp/src'),
      '~': path.resolve(__dirname, './apps/backend'),
    },
  },
});
