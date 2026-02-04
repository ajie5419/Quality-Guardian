import type { VxeGridPropTypes } from '#/adapter/vxe-table';

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

export const getProcessOptions = (t: (key: string) => string) => [
  {
    label: t('qms.inspection.records.options.process.outsourced'),
    value: '外购件',
  },
  {
    label: t('qms.inspection.records.options.process.rawMaterial'),
    value: '原材料',
  },
  {
    label: t('qms.inspection.records.options.process.auxiliary'),
    value: '辅材',
  },
  {
    label: t('qms.inspection.records.options.process.machined'),
    value: '机加成品件',
  },
  {
    label: t('qms.inspection.records.options.process.cutting'),
    value: '下料',
  },
  {
    label: t('qms.inspection.records.options.process.assembly'),
    value: '组对',
  },
  {
    label: t('qms.inspection.records.options.process.welding'),
    value: '焊接',
  },
  {
    label: t('qms.inspection.records.options.process.weldSize'),
    value: '焊后尺寸',
  },
  {
    label: t('qms.inspection.records.options.process.appearance'),
    value: '外观',
  },
  {
    label: t('qms.inspection.records.options.process.overallAssembly'),
    value: '整体拼装',
  },
  {
    label: t('qms.inspection.records.options.process.assembling'),
    value: '组装',
  },
  {
    label: t('qms.inspection.records.options.process.mounting'),
    value: '装配',
  },
  {
    label: t('qms.inspection.records.options.process.grouping'),
    value: '组拼',
  },
  {
    label: t('qms.inspection.records.options.process.sandblasting'),
    value: '打砂',
  },
  {
    label: t('qms.inspection.records.options.process.painting'),
    value: '喷漆',
  },
];

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
      title: '结果',
      width: 100,
      slots: { default: 'result' },
    },
    {
      field: 'inspectionDate',
      title: '检验日期',
      width: 120,
      formatter: 'formatDate',
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
