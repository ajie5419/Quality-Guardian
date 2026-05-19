import type { VxeGridPropTypes } from '#/adapter/vxe-table';
import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { cloneInspectionProcessFallbackOptions } from '../../shared/constants/inspection-process-fallback';

export const INSPECTION_TYPES = {
  INCOMING: 'INCOMING',
  PROCESS: 'PROCESS',
  SHIPMENT: 'SHIPMENT',
} as const;

export const INSPECTION_TABS = [
  { label: '进货检验', value: 'incoming' },
  { label: '过程检验', value: 'process' },
  { label: '发货检验', value: 'shipment' },
];

export const getProcessOptions = (_t: (key: string) => string) =>
  cloneInspectionProcessFallbackOptions();

export function mapDictionaryOptionsToInspectionProcess(
  options: DictionaryOptionItem[] | undefined,
  fallbackOptions: Array<{ label: string; value: string }> = [],
) {
  if (!options || options.length === 0) {
    return fallbackOptions;
  }

  const merged = new Map<string, { label: string; value: string }>();
  for (const item of options) {
    const value = String(item.dictKey || '').trim();
    if (!value) continue;
    merged.set(value, {
      label: String(item.dictValue || value).trim() || value,
      value,
    });
  }
  for (const option of fallbackOptions) {
    if (!merged.has(option.value)) {
      merged.set(option.value, option);
    }
  }

  return [...merged.values()];
}

export function mapDictionaryOptionsToInspectionProcessOnly(
  options: DictionaryOptionItem[] | undefined,
  fallbackOptions: Array<{ label: string; value: string }> = [],
) {
  if (!options || options.length === 0) {
    return fallbackOptions;
  }
  return options
    .map((item) => {
      const value = String(item.dictKey || '').trim();
      if (!value) return null;
      return {
        label: String(item.dictValue || value).trim() || value,
        value,
      };
    })
    .filter(Boolean) as Array<{ label: string; value: string }>;
}

export const getColumns = (
  type: string,
  t: (key: string) => string,
): VxeGridPropTypes.Columns => {
  const commonColumns: VxeGridPropTypes.Columns = [
    { type: 'checkbox', width: 50 },
    { type: 'seq', title: '#', width: 60 },
    {
      field: 'workOrderNumber',
      title: t('qms.workOrder.workOrderNumber'),
      width: 150,
    },
    {
      field: 'projectName',
      title: t('qms.workOrder.projectName'),
      minWidth: 150,
    },
  ];

  const typeColumns: Record<string, VxeGridPropTypes.Columns> = {
    [INSPECTION_TYPES.INCOMING.toLowerCase()]: [
      {
        field: 'incomingType',
        title: t('qms.inspection.records.form.incomingType'),
        width: 100,
      },
      { field: 'supplierName', title: t('qms.supplier.name'), minWidth: 150 },
      {
        field: 'materialName',
        title: t('qms.inspection.records.form.materialName'),
        minWidth: 150,
      },
      {
        field: 'hasDocuments',
        title: '是否有资料',
        width: 100,
        slots: { default: 'hasDocuments' },
      },
    ],
    [INSPECTION_TYPES.PROCESS.toLowerCase()]: [
      {
        field: 'processName',
        title: t('qms.inspection.records.form.process'),
        width: 100,
      },
      {
        field: 'level1Component',
        title: t('qms.inspection.records.form.level1'),
        width: 120,
      },
      {
        field: 'level2Component',
        title: t('qms.inspection.records.form.componentName'),
        width: 120,
      },
      {
        field: 'team',
        title: t('qms.inspection.records.form.team'),
        width: 100,
      },
    ],
    [INSPECTION_TYPES.SHIPMENT.toLowerCase()]: [
      {
        field: 'materialName',
        title: t('qms.planning.bom.partName'),
        minWidth: 150,
      },
      {
        field: 'documents',
        title: t('qms.inspection.records.form.documents'),
        width: 150,
      },
      {
        field: 'packingListArchived',
        title: t('qms.inspection.records.form.packingListArchived'),
        width: 100,
      },
    ],
  };

  const endColumns: VxeGridPropTypes.Columns = [
    { field: 'quantity', title: '数量', width: 80 },
    { field: 'inspector', title: '检验员', width: 100 },
    {
      field: 'result',
      title: '检验结论',
      width: 100,
      slots: { default: 'result' },
    },
    {
      field: 'issueStatus',
      title: '问题状态',
      width: 120,
      slots: { default: 'issueStatus' },
    },
    {
      field: 'unqualifiedQuantity',
      title: '不合格数量',
      width: 110,
    },
    {
      field: 'inspectionDate',
      title: '检验日期',
      width: 120,
      formatter: 'formatDate',
    },
    {
      field: 'remarks',
      title: t('qms.inspection.fields.remarks'),
      minWidth: 150,
      showOverflow: true,
    },
    {
      title: t('common.action'),
      width: 150,
      fixed: 'right',
      slots: { default: 'action' },
    },
  ];

  return [...commonColumns, ...(typeColumns[type] || []), ...endColumns];
};

export const getFormConfig = (type: string, t: (key: string) => string) => {
  const config = {
    showSupplier: false,
    showMaterial: false,
    showIncomingType: false,
    showProcess: false,
    showLevel1: false,
    showLevel2: false,
    showTeam: false,
    showDocuments: false,
    showPackingList: false,
    showHasDocuments: false,
    labels: {
      materialName: t('qms.inspection.records.form.materialName'),
    },
  };

  const normalizedType = type.toLowerCase();

  switch (normalizedType) {
    case INSPECTION_TYPES.INCOMING.toLowerCase(): {
      config.showSupplier = true;
      config.showMaterial = true;
      config.showIncomingType = true;
      config.showHasDocuments = true;
      break;
    }
    case INSPECTION_TYPES.PROCESS.toLowerCase(): {
      config.showProcess = true;
      config.showLevel1 = true;
      config.showLevel2 = true;
      config.showTeam = true;
      break;
    }
    case INSPECTION_TYPES.SHIPMENT.toLowerCase(): {
      config.showMaterial = true;
      config.showDocuments = true;
      config.showPackingList = true;
      config.labels.materialName = t('qms.planning.bom.partName');
      break;
    }
  }

  return config;
};
