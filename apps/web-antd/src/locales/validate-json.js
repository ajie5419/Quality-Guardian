/* eslint-disable no-console */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Validate the web-antd locale files:
 * 1. Every JSON file under langs/<lang>/ parses correctly.
 * 2. zh-CN and en-US expose the same file set.
 * 3. Every translation key in a zh-CN file exists in its en-US counterpart
 *    (and vice versa), so missing translations are caught before shipping.
 *
 * Exits with code 1 when any check fails.
 */

const LANGS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'langs');
const LANG_DIRS = ['zh-CN', 'en-US'];

/** Collect every leaf key path (dot-joined) from a parsed JSON value. */
function collectKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Keys present in left but missing in right. */
function missingKeys(left, right) {
  const rightSet = new Set(right);
  return left.filter((key) => !rightSet.has(key));
}

function loadLangFiles(langDir) {
  const dir = join(LANGS_DIR, langDir);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  return { dir, files };
}

let failed = false;

const parsedByLang = {};
for (const langDir of LANG_DIRS) {
  let loaded;
  try {
    loaded = loadLangFiles(langDir);
  } catch (error) {
    console.error(
      `FAIL: cannot read lang dir ${join(LANGS_DIR, langDir)}: ${error.message}`,
    );
    process.exitCode = 1;
    failed = true;
    continue;
  }
  parsedByLang[langDir] = { files: loaded.files, values: new Map() };
  for (const file of loaded.files) {
    const filePath = join(loaded.dir, file);
    try {
      parsedByLang[langDir].values.set(
        file,
        JSON.parse(readFileSync(filePath, 'utf8')),
      );
      console.log(`PASS: ${langDir}/${file} is valid JSON.`);
    } catch (error) {
      console.error(
        `FAIL: ${langDir}/${file} is INVALID JSON: ${error.message}`,
      );
      process.exitCode = 1;
      failed = true;
    }
  }
}

const zh = parsedByLang['zh-CN'];
const en = parsedByLang['en-US'];
if (zh && en) {
  const zhFiles = new Set(zh.files);
  const enFiles = new Set(en.files);
  for (const file of zhFiles) {
    if (!enFiles.has(file)) {
      console.error(`FAIL: en-US is missing locale file ${file}`);
      process.exitCode = 1;
      failed = true;
    }
  }
  for (const file of enFiles) {
    if (!zhFiles.has(file)) {
      console.error(`FAIL: zh-CN is missing locale file ${file}`);
      process.exitCode = 1;
      failed = true;
    }
  }

  for (const file of zh.files) {
    const zhValue = zh.values.get(file);
    const enValue = en.values.get(file);
    if (!zhValue || !enValue) continue;
    const zhKeys = collectKeys(zhValue);
    const enKeys = collectKeys(enValue);
    const missingInEn = missingKeys(zhKeys, enKeys);
    const missingInZh = missingKeys(enKeys, zhKeys);
    if (missingInEn.length === 0 && missingInZh.length === 0) {
      console.log(`PASS: key parity ${file} (${zhKeys.length} keys).`);
    } else {
      if (missingInEn.length > 0) {
        console.error(
          `FAIL: ${file} keys missing in en-US: ${missingInEn.join(', ')}`,
        );
      }
      if (missingInZh.length > 0) {
        console.error(
          `FAIL: ${file} keys missing in zh-CN: ${missingInZh.join(', ')}`,
        );
      }
      process.exitCode = 1;
      failed = true;
    }
  }
}

if (!failed) {
  console.log('All locale checks passed.');
}
