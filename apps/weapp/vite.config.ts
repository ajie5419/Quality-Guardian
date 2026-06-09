// @ts-expect-error dcloudio CJS default export
import uniPlugin from '@dcloudio/vite-plugin-uni';
import { defineConfig } from 'vite';

const uni = uniPlugin.default || uniPlugin;

export default defineConfig({
  plugins: [uni()],
});
