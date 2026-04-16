import type { QmsWelderApi } from '#/api/qms/welder';

export function isLikelyWelderCode(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /[A-Z0-9-]/i.test(text) && !/[\u4E00-\u9FFF]/.test(text);
}

export function isLikelyWelderName(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /[\u4E00-\u9FFF]/.test(text);
}

export function normalizeWelderIdentity(row: QmsWelderApi.WelderItem) {
  const welderCode = String(row.welderCode || '').trim();
  const name = String(row.name || '').trim();
  if (isLikelyWelderCode(name) && isLikelyWelderName(welderCode)) {
    return {
      displayName: welderCode,
      displayWelderCode: name,
    };
  }
  return {
    displayName: name,
    displayWelderCode: welderCode,
  };
}

export function resolveScoreTagColor(score: number) {
  if (score >= 10) return 'green';
  if (score >= 7) return 'gold';
  return 'red';
}
