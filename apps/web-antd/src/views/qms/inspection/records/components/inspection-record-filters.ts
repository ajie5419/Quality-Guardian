export type InspectionRecordFilterParams = {
  componentName?: string;
  endDate?: string;
  hasDocuments?: boolean;
  inspector?: string;
  keyword?: string;
  level1Component?: string;
  materialName?: string;
  processName?: string;
  projectName?: string;
  startDate?: string;
  supplierName?: string;
  team?: string;
  workOrderNumber?: string;
};

export type InspectionRecordFilterState = Omit<
  InspectionRecordFilterParams,
  'endDate' | 'hasDocuments' | 'startDate'
> & {
  hasDocuments?: string;
  inspectionDateRange?: [string, string];
};

function normalizeFilterText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function normalizeHasDocumentsFilter(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function resolveInspectionRecordDateRangeQuery(value: unknown): {
  endDate?: string;
  startDate?: string;
} {
  if (!Array.isArray(value) || value.length !== 2) return {};
  const startDate = normalizeFilterText(value[0]);
  const endDate = normalizeFilterText(value[1]);
  return startDate && endDate ? { endDate, startDate } : {};
}

export function buildInspectionRecordFilterParams(options: {
  fallbackKeyword?: string;
  filters: InspectionRecordFilterState;
  formValues?: Record<string, unknown>;
}): InspectionRecordFilterParams {
  const { fallbackKeyword, filters, formValues = {} } = options;
  const dateRange = resolveInspectionRecordDateRangeQuery(
    filters.inspectionDateRange ?? formValues.inspectionDateRange,
  );
  const resolveText = (key: keyof InspectionRecordFilterState) =>
    normalizeFilterText(filters[key]) || normalizeFilterText(formValues[key]);

  return {
    componentName: resolveText('componentName'),
    ...dateRange,
    hasDocuments: normalizeHasDocumentsFilter(
      filters.hasDocuments ?? formValues.hasDocuments,
    ),
    inspector: resolveText('inspector'),
    keyword: resolveText('keyword') || normalizeFilterText(fallbackKeyword),
    level1Component: resolveText('level1Component'),
    materialName: resolveText('materialName'),
    processName: resolveText('processName'),
    projectName: resolveText('projectName'),
    supplierName: resolveText('supplierName'),
    team: resolveText('team'),
    workOrderNumber: resolveText('workOrderNumber'),
  };
}
