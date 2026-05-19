import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const APP_LOCALES_DIR = path.join(ROOT, 'apps/web-antd/src/locales/langs');

const ALLOWED_FILE_EXT = '.json';
const FORBIDDEN_SUFFIXES = ['.bak', '.bak2', '.bak3', '.tmp'];

function flattenKeys(node, parentPath = '', keys = []) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      const currentPath = parentPath ? `${parentPath}.${key}` : key;
      flattenKeys(value, currentPath, keys);
    }
    return keys;
  }
  keys.push(parentPath);
  return keys;
}

async function listLocaleDirs(localesDir) {
  const entries = await fs.readdir(localesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function listJsonFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(ALLOWED_FILE_EXT))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function listForbiddenFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) =>
      FORBIDDEN_SUFFIXES.some((suffix) => name.endsWith(suffix)),
    );
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

function diffSet(source, target) {
  const diff = [];
  for (const item of source) {
    if (!target.has(item)) {
      diff.push(item);
    }
  }
  return diff.sort((a, b) => a.localeCompare(b));
}

async function main() {
  const localeDirs = await listLocaleDirs(APP_LOCALES_DIR);
  if (localeDirs.length === 0) {
    throw new Error('No locale directories found');
  }

  const forbiddenFiles = [];
  for (const locale of localeDirs) {
    const localePath = path.join(APP_LOCALES_DIR, locale);
    const files = await listForbiddenFiles(localePath);
    for (const file of files) {
      forbiddenFiles.push(path.join(localePath, file));
    }
  }

  if (forbiddenFiles.length > 0) {
    throw new Error(
      `Forbidden locale temp/backup files detected:\n${forbiddenFiles
        .map((file) => `- ${path.relative(ROOT, file)}`)
        .join('\n')}`,
    );
  }

  const namespaceByLocale = new Map();
  for (const locale of localeDirs) {
    const localePath = path.join(APP_LOCALES_DIR, locale);
    namespaceByLocale.set(locale, await listJsonFiles(localePath));
  }

  const [baselineLocale] = localeDirs;
  const baselineNamespaces = namespaceByLocale.get(baselineLocale) || [];
  for (const locale of localeDirs.slice(1)) {
    const currentNamespaces = namespaceByLocale.get(locale) || [];
    const currentSet = new Set(currentNamespaces);
    const baselineSet = new Set(baselineNamespaces);
    const missingFiles = diffSet(baselineSet, currentSet);
    const extraFiles = diffSet(currentSet, baselineSet);
    if (missingFiles.length > 0 || extraFiles.length > 0) {
      throw new Error(
        [
          `Namespace file mismatch between ${baselineLocale} and ${locale}.`,
          missingFiles.length > 0
            ? `Missing in ${locale}: ${missingFiles.join(', ')}`
            : null,
          extraFiles.length > 0
            ? `Extra in ${locale}: ${extraFiles.join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  const keyDiffViolations = [];
  for (const namespace of baselineNamespaces) {
    const baselinePath = path.join(APP_LOCALES_DIR, baselineLocale, namespace);
    const baselineJson = await readJson(baselinePath);
    const baselineKeys = new Set(flattenKeys(baselineJson));

    for (const locale of localeDirs.slice(1)) {
      const localePath = path.join(APP_LOCALES_DIR, locale, namespace);
      const localeJson = await readJson(localePath);
      const localeKeys = new Set(flattenKeys(localeJson));

      const missingKeys = diffSet(baselineKeys, localeKeys);
      const extraKeys = diffSet(localeKeys, baselineKeys);

      if (missingKeys.length > 0 || extraKeys.length > 0) {
        keyDiffViolations.push({
          extraKeys,
          locale,
          missingKeys,
          namespace,
        });
      }
    }
  }

  console.log(
    `[i18n-check] PASS namespace/json checks. locales=${localeDirs.join(', ')} namespaces=${baselineNamespaces.length}`,
  );

  if (keyDiffViolations.length > 0) {
    const detail = keyDiffViolations
      .map((item) => {
        const parts = [
          `- ${item.namespace} ${item.locale}: missing=${item.missingKeys.length}, extra=${item.extraKeys.length}`,
        ];
        if (item.missingKeys.length > 0) {
          parts.push(
            `  missingKeys: ${item.missingKeys.slice(0, 10).join(', ')}`,
          );
        }
        if (item.extraKeys.length > 0) {
          parts.push(`  extraKeys: ${item.extraKeys.slice(0, 10).join(', ')}`);
        }
        return parts.join('\n');
      })
      .join('\n');
    throw new Error(`I18n key parity check failed:\n${detail}`);
  }

  console.log('[i18n-check] PASS key parity checks.');
}

main().catch((error) => {
  console.error('[i18n-check] FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
