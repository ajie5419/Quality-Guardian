import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { defineEventHandler } from 'h3';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same resolution logic as upload.ts
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || resolve(__dirname, '..', '..', 'uploads');

export default defineEventHandler((_event) => {
  try {
    const files = readdirSync(UPLOAD_DIR).map((file) => {
      const filePath = join(UPLOAD_DIR, file);
      const stat = statSync(filePath);
      return {
        name: file,
        size: stat.size,
        mtime: stat.mtime,
        path: filePath,
      };
    });

    return {
      directory: UPLOAD_DIR,
      files,
      count: files.length,
      cwd: process.cwd(),
      dirname: __dirname,
    };
  } catch (error) {
    return {
      directory: UPLOAD_DIR,
      error: error.message,
      cwd: process.cwd(),
    };
  }
});
