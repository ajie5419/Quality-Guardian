import type { UploadFileWithResponse } from '../../issues/types';

function pickFirstNonEmpty(
  values: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = String(values[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

export function deriveIssuePartName(values: Record<string, unknown>): string {
  return pickFirstNonEmpty(values, [
    'partName',
    'level1Component',
    'materialName',
    'itemName',
  ]);
}

export function deriveIssueProcessName(
  values: Record<string, unknown>,
): string {
  return pickFirstNonEmpty(values, ['processName', 'incomingType', 'category']);
}

export function deriveResponsibleDepartment(
  type: string,
  values: Record<string, unknown>,
): string {
  const team = String(values.team ?? '').trim();
  if (team) return team;

  const explicit = String(values.responsibleDepartment ?? '').trim();
  if (explicit) return explicit;

  if (type === 'incoming') return '采购部';
  return '质量部';
}

export function normalizeIssuePhotoUrls(
  files: UploadFileWithResponse[],
): string[] {
  if (!Array.isArray(files)) return [];

  const urls: string[] = [];
  for (const file of files) {
    const responseUrl = String(file?.response?.data?.url ?? '').trim();
    const directUrl = String(file?.url ?? '').trim();
    const thumbUrl = String(file?.thumbUrl ?? '').trim();
    const candidate = responseUrl || directUrl || thumbUrl;
    if (candidate) urls.push(candidate);
  }

  return [...new Set(urls)];
}
