type InspectionCategoryLike = {
  category?: null | string;
  incomingType?: null | string;
  processName?: null | string;
};

const PROCESS_ALIAS_GROUPS = [
  ['组焊', '焊接'],
  ['涂装', '喷漆'],
  ['组装', '装配'],
  ['整体拼装', '组拼'],
];

function normalizeProcessText(value: string) {
  return String(value || '').trim();
}

export function resolveInspectionFormProcess(source: InspectionCategoryLike) {
  const category = String(source.category || '')
    .trim()
    .toUpperCase();
  if (category === 'INCOMING') {
    return String(source.incomingType || '进货检验').trim() || '进货检验';
  }
  if (category === 'SHIPMENT') {
    return '发货检验';
  }
  return normalizeProcessText(String(source.processName || ''));
}

export function resolveInspectionFormProcessCandidates(
  source: InspectionCategoryLike,
) {
  const process = resolveInspectionFormProcess(source);
  if (!process) return [];

  const candidateSet = new Set([process]);
  for (const group of PROCESS_ALIAS_GROUPS) {
    if (group.includes(process)) {
      for (const alias of group) {
        candidateSet.add(alias);
      }
    }
  }
  return [...candidateSet];
}

export function parseInspectionFormFields(raw?: null | string) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
