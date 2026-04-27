import { defineConfig } from '@vben/vite-config';

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../..');

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

  return {
    application: {},
    vite: {
      define: {
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion),
      },
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
