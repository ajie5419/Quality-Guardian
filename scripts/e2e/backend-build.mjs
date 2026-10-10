import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(
  new URL('../../apps/backend/package.json', import.meta.url),
);
const { createNitro, build, prepare } = await import(
  pathToFileURL(
    join(
      dirname(require.resolve('nitropack/package.json')),
      'dist/core/index.mjs',
    ),
  ).href
);
// The source copy contains no dotenv files; disable c12 loading as a second guard.
const nitro = await createNitro(
  {
    rootDir: process.env.QGS_E2E_BACKEND_DIR,
    preset: 'node-server',
    compatibilityDate: '2026-10-08',
    // Nitro otherwise inlines "production" even when the launched process is test.
    replace: { 'process.env.NODE_ENV': JSON.stringify('test') },
  },
  { dotenv: false },
);
try {
  await prepare(nitro);
  await build(nitro);
} finally {
  await nitro.close();
}
