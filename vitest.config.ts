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
    exclude: [...configDefaults.exclude, '**/e2e/**'],
    alias: {
      '#': path.resolve(__dirname, './apps/web-antd/src'),
      '~': path.resolve(__dirname, './apps/backend'),
    },
  },
});
