import type { UploadFileWithResponse } from '../types';

import { getUploadResponse } from '#/views/qms/shared/utils/upload-file';

export function normalizeIssuePhotoUrls(
  files: UploadFileWithResponse[],
): string[] {
  if (!Array.isArray(files)) return [];

  const urls: string[] = [];
  for (const file of files) {
    const responseUrl = String(getUploadResponse(file)?.data?.url ?? '').trim();
    const directUrl = String(file?.url ?? '').trim();
    const thumbUrl = String(file?.thumbUrl ?? '').trim();
    const candidate = responseUrl || directUrl || thumbUrl;
    if (candidate) urls.push(candidate);
  }

  return [...new Set(urls)];
}
