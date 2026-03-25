export interface ProjectDocumentLedgerItem {
  createdAt: string;
  id: string;
  projectName: string;
  sourceInspectionId?: string;
  sourceIssueId?: string;
  sourceIssueNumber?: string;
  sourceLabel?: string;
  sourceType: 'INSPECTION' | 'ISSUE' | 'MANUAL';
  status: string;
  updatedAt: string;
  workContent: string;
  workOrderNumber: string;
}

interface InspectionProjectDocumentSource {
  category?: string;
  documents?: null | string;
  hasDocuments?: boolean;
  id: string;
  incomingType?: null | string;
  level1Component?: null | string;
  level2Component?: null | string;
  materialName?: null | string;
  processName?: null | string;
  projectName?: null | string;
  result?: null | string;
  workOrderNumber: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeInspectionCategoryLabel(category?: string) {
  if (category === 'INCOMING') return '进货检验';
  if (category === 'PROCESS') return '过程检验';
  if (category === 'SHIPMENT') return '发货检验';
  return '检验记录';
}

function resolveInspectionDocumentSubject(
  source: InspectionProjectDocumentSource,
) {
  const materialName = getString(source.materialName).trim();
  if (materialName) return materialName;

  const level2Component = getString(source.level2Component).trim();
  if (level2Component) return level2Component;

  const level1Component = getString(source.level1Component).trim();
  if (level1Component) return level1Component;

  const processName = getString(source.processName).trim();
  if (processName) return processName;

  const incomingType = getString(source.incomingType).trim();
  if (incomingType) return incomingType;

  return getString(source.projectName).trim() || source.workOrderNumber;
}

function normalizeInspectionResultLabel(result?: null | string) {
  return String(result || '').toUpperCase() === 'FAIL' ? '不合格' : '合格';
}

function createInspectionLedgerWorkContent(
  source: InspectionProjectDocumentSource,
) {
  const categoryLabel = normalizeInspectionCategoryLabel(source.category);
  const subject = resolveInspectionDocumentSubject(source);
  const resultLabel = normalizeInspectionResultLabel(source.result);
  return `${categoryLabel}资料整理：${subject}，检验结论：${resultLabel}`;
}

export function shouldSyncInspectionProjectDocument(
  source: InspectionProjectDocumentSource,
) {
  return (
    Boolean(source.hasDocuments) || Boolean(getString(source.documents).trim())
  );
}

export function upsertInspectionProjectDocuments(
  currentItems: ProjectDocumentLedgerItem[],
  source: InspectionProjectDocumentSource,
) {
  const now = new Date().toISOString();
  const nextItems = currentItems.filter(
    (item) => item.sourceInspectionId !== source.id,
  );

  if (!shouldSyncInspectionProjectDocument(source)) {
    return nextItems;
  }

  const previous = currentItems.find(
    (item) => item.sourceInspectionId === source.id,
  );
  const nextItem: ProjectDocumentLedgerItem = {
    createdAt: previous?.createdAt || now,
    id: previous?.id || `inspection:${source.id}`,
    projectName: getString(source.projectName) || source.workOrderNumber,
    sourceInspectionId: source.id,
    sourceLabel: `${normalizeInspectionCategoryLabel(source.category)} / ${resolveInspectionDocumentSubject(source)}`,
    sourceType: 'INSPECTION',
    status: previous?.status || '已整理',
    updatedAt: now,
    workContent:
      previous?.workContent || createInspectionLedgerWorkContent(source),
    workOrderNumber: source.workOrderNumber,
  };

  return [nextItem, ...nextItems];
}

export function parseProjectDocuments(
  raw: null | string | undefined,
): ProjectDocumentLedgerItem[] {
  if (!raw) return [];

  try {
    return normalizeProjectDocuments(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function normalizeProjectDocuments(
  raw: unknown,
): ProjectDocumentLedgerItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item) => isRecord(item))
    .map((item): ProjectDocumentLedgerItem => {
      const rawSourceType = getString(item.sourceType);
      let sourceType: ProjectDocumentLedgerItem['sourceType'] = 'MANUAL';
      if (rawSourceType === 'INSPECTION') {
        sourceType = 'INSPECTION';
      } else if (rawSourceType === 'ISSUE') {
        sourceType = 'ISSUE';
      }
      return {
        id: getString(item.id),
        workOrderNumber: getString(item.workOrderNumber),
        projectName: getString(item.projectName),
        workContent: getString(item.workContent),
        status: getString(item.status),
        sourceType,
        sourceInspectionId: getString(item.sourceInspectionId) || undefined,
        sourceIssueId: getString(item.sourceIssueId) || undefined,
        sourceIssueNumber: getString(item.sourceIssueNumber) || undefined,
        sourceLabel: getString(item.sourceLabel) || undefined,
        createdAt: getString(item.createdAt),
        updatedAt: getString(item.updatedAt),
      };
    })
    .filter((item) => item.id);
}

export function stringifyProjectDocuments(items: ProjectDocumentLedgerItem[]) {
  return JSON.stringify(items);
}
