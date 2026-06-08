import { defineConfig } from 'vite';

// @ts-expect-error dcloudio CJS default export
import uniPlugin from '@dcloudio/vite-plugin-uni';

const uni = uniPlugin.default || uniPlugin;

export default defineConfig({
  plugins: [uni()],
});
