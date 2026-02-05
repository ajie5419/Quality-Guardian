import { resolve } from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
// Nitro dev mode usually runs from .nitro or project root
// If running in dev mode, nitro might set cwd to .nitro/dev
const isNitro = cwd.includes('.nitro') || cwd.includes('.output');
export const PROJECT_ROOT = isNitro ? resolve(cwd, '..') : cwd;

// Stable upload directory: apps/backend/uploads
// We want to avoid saving inside .nitro which is temporary
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR || resolve(PROJECT_ROOT, 'uploads');
