import { resolve } from 'node:path';

const cwd = process.cwd();
// Nitro dev mode usually runs from .nitro or project root
const isNitro = cwd.includes('.nitro') || cwd.includes('.output');
export const PROJECT_ROOT = isNitro ? resolve(cwd, '..') : cwd;
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || resolve(PROJECT_ROOT, 'uploads');
