import { extname } from 'node:path';

import { ErrorCode } from '@qgs/shared';
import { SystemService } from '~/modules/system';
import { BusinessError } from '~/utils/business-error';

/**
 * Upload format policy for every upload entry (anonymous and authenticated).
 *
 * The allowlist is a security control: formats that can carry scripts
 * (svg, html, ...) are never allowed. The policy is stored in system
 * settings under UPLOAD_ALLOWED_EXTENSIONS and defaults to the documents
 * tier (fail closed when unset or unparsable).
 */

export const UPLOAD_ALLOWED_EXTENSIONS_SETTING_KEY =
  'UPLOAD_ALLOWED_EXTENSIONS';

export const UPLOAD_ALLOWED_IMAGES = [
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
] as const;

export const UPLOAD_ALLOWED_IMAGES_PDF = [
  ...UPLOAD_ALLOWED_IMAGES,
  '.pdf',
] as const;

/**
 * Documents tier: PDF plus classic Office files (doc/docx/xls/xlsx).
 * Macro-carrying formats (docm/xlsm/pptm/...) are intentionally excluded.
 */
export const UPLOAD_ALLOWED_DOCUMENTS = [
  ...UPLOAD_ALLOWED_IMAGES_PDF,
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
] as const;

export type UploadAllowedExtensionsPolicy =
  | 'images'
  | 'images+pdf'
  | 'images+pdf+office';

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/msword': '.doc',
  'application/pdf': '.pdf',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function parseUploadAllowedExtensions(
  raw: null | string | undefined,
): Set<string> {
  const policy = String(raw ?? '').trim();
  if (policy === 'images') return new Set(UPLOAD_ALLOWED_IMAGES);
  if (policy === 'images+pdf') return new Set(UPLOAD_ALLOWED_IMAGES_PDF);
  // Fail closed to the default documents tier: script-carrying formats
  // (svg/html/...) are never allowed by any tier.
  return new Set(UPLOAD_ALLOWED_DOCUMENTS);
}

export async function resolveUploadAllowedExtensions(): Promise<Set<string>> {
  const raw = await SystemService.getSettingValue(
    UPLOAD_ALLOWED_EXTENSIONS_SETTING_KEY,
  );
  return parseUploadAllowedExtensions(raw);
}

/**
 * Resolve the safe extension for an upload. The client-reported MIME type is
 * never trusted for allowlisting: the original filename extension wins, and
 * the MIME type is only used as a fallback when the name has no extension.
 */
export function resolveAllowedUploadExtension(
  filename: string,
  mimeType: null | string | undefined,
  allowed: Set<string>,
): null | string {
  const ext = extname(filename).toLowerCase();
  if (ext) return allowed.has(ext) ? ext : null;
  const extFromMime = EXTENSION_BY_MIME[String(mimeType ?? '').toLowerCase()];
  return extFromMime && allowed.has(extFromMime) ? extFromMime : null;
}

export function assertAllowedUploadExtension(
  filename: string,
  mimeType: null | string | undefined,
  allowed: Set<string>,
): string {
  const ext = resolveAllowedUploadExtension(filename, mimeType, allowed);
  if (!ext) {
    throw new BusinessError(
      ErrorCode.BAD_REQUEST,
      `不支持的文件类型，仅允许：${[...allowed].join(', ')}`,
      400,
    );
  }
  return ext;
}
