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

export const PROCESS_OPTIONS = [
  { label: '外购件', value: '外购件' },
  { label: '原材料', value: '原材料' },
  { label: '辅材', value: '辅材' },
  { label: '机加成品件', value: '机加成品件' },
  { label: '下料', value: '下料' },
  { label: '组对', value: '组对' },
  { label: '焊接', value: '焊接' },
  { label: '焊后尺寸', value: '焊后尺寸' },
  { label: '外观', value: '外观' },
  { label: '整体拼装', value: '整体拼装' },
  { label: '组装', value: '组装' },
  { label: '装配', value: '装配' },
  { label: '组拼', value: '组拼' },
  { label: '打砂', value: '打砂' },
  { label: '喷漆', value: '喷漆' },
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
    incoming: [
      { field: 'incomingType', title: '进货类型', width: 100 },
      { field: 'supplierName', title: t('qms.supplier.name'), minWidth: 150 },
      { field: 'materialName', title: '物料名称', minWidth: 150 },
    ],
    process: [
      { field: 'processName', title: '工序', width: 100 },
      { field: 'level1Component', title: '一级部件', width: 120 },
      { field: 'team', title: '班组', width: 100 },
    ],
    shipment: [
      { field: 'documents', title: '随箱资料', width: 150 },
      { field: 'packingListArchived', title: '装箱单归档', width: 100 },
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

export const getFormConfig = (type: string) => {
  const config = {
    showSupplier: false,
    showMaterial: false,
    showIncomingType: false,
    showProcess: false,
    showLevel1: false,
    showTeam: false,
    showDocuments: false,
    showPackingList: false,
  };

  switch (type) {
    case 'incoming': {
      config.showSupplier = true;
      config.showMaterial = true;
      config.showIncomingType = true;

      break;
    }
    case 'process': {
      config.showProcess = true;
      config.showLevel1 = true;
      config.showTeam = true;

      break;
    }
    case 'shipment': {
      config.showDocuments = true;
      config.showPackingList = true;

      break;
    }
    // No default
  }

  return config;
};
