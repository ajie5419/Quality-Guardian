export { normalizeIssuePhotoUrls } from '../../issues/utils/photo-upload';

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
