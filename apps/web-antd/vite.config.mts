import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@vben/vite-config';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../..');
const require = createRequire(
  resolve(repoRoot, 'packages/stores/package.json'),
);
const piniaPersistedStateEntry = require.resolve('pinia-plugin-persistedstate');

function resolveBuildVersion() {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION;
  }

  const rootPackage = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  ) as { version?: string };
  const baseVersion = rootPackage.version || '0.0.0';

  try {
    const shortSha = execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return shortSha ? `${baseVersion}-${shortSha}` : baseVersion;
  } catch {
    return baseVersion;
  }
}

export default defineConfig(async () => {
  const buildVersion = resolveBuildVersion();
  const isolatedE2E = process.env.QGS_E2E_MODE === 'isolated';
  const backendOrigin = isolatedE2E
    ? process.env.QGS_E2E_BACKEND_ORIGIN
    : 'http://localhost:5320';
  if (
    !backendOrigin ||
    (isolatedE2E && !/^http:\/\/127\.0\.0\.1:\d+$/.test(backendOrigin))
  ) {
    throw new Error('Isolated E2E requires a loopback backend origin');
  }

  return {
    application: isolatedE2E
      ? { devtools: false, nitroMock: false, pwa: false }
      : {},
    vite: {
      define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion),
      },
      optimizeDeps: {
        exclude: ['jiti'],
      },
      resolve: {
        alias: {
          'pinia-plugin-persistedstate': piniaPersistedStateEntry,
        },
      },
      server: {
        ...(isolatedE2E ? { host: '127.0.0.1', strictPort: true } : {}),
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api/, ''),
            // 真实后端地址 (原 backend-mock 现已重命名为 backend)
            target: `${backendOrigin}/api`,
            ws: true,
          },
          '/uploads': {
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/uploads/, ''),
            target: `${backendOrigin}/uploads`,
          },
        },
      },
    },
  };
});
