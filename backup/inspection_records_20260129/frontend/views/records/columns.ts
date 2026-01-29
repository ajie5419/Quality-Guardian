import type { VxeGridPropTypes } from '#/adapter/vxe-table';

export const getIncomingColumns = (
  t: (key: string) => string,
  actions: {
    canEdit: boolean;
    canDelete: boolean;
    onEdit: (row: any) => void;
    onDelete: (row: any) => void;
  },
): VxeGridPropTypes.Columns => [
  { type: 'checkbox', width: 50 },
  { type: 'seq', title: t('common.seq'), width: 60 },
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
  {
    field: 'incomingType',
    title: t('qms.inspection.records.form.incomingType'),
    width: 120,
  },
  { field: 'supplierName', title: t('qms.supplier.name'), minWidth: 150 },
  {
    field: 'materialName',
    title: t('qms.inspection.records.form.materialName'),
    minWidth: 150,
  },
  {
    field: 'quantity',
    title: t('qms.inspection.records.form.quantity'),
    width: 100,
  },
  {
    field: 'result',
    title: t('qms.inspection.records.form.result'),
    width: 100,
    slots: { default: 'result' },
  },
  {
    field: 'hasDocuments',
    title: t('qms.inspection.records.form.hasDocuments'),
    width: 100,
  },
  {
    field: 'inspector',
    title: t('qms.inspection.records.form.inspector'),
    width: 120,
  },
  { field: 'reportDate', title: t('common.date'), width: 120 },
  {
    title: t('common.action'),
    width: 150,
    fixed: 'right',
    cellRender: {
      name: 'CellOperation',
      props: {
        options: [
          ...(actions.canEdit ? ['edit'] : []),
          ...(actions.canDelete ? ['delete'] : []),
        ],
        onClick: ({ code, row }: { code: string; row: any }) => {
          if (code === 'edit') actions.onEdit(row);
          if (code === 'delete') actions.onDelete(row);
        },
      },
    },
  },
];

export const getProcessColumns = (
  t: (key: string) => string,
  actions: {
    canEdit: boolean;
    canDelete: boolean;
    onEdit: (row: any) => void;
    onDelete: (row: any) => void;
  },
): VxeGridPropTypes.Columns => [
  { type: 'checkbox', width: 50 },
  { type: 'seq', title: t('common.seq'), width: 60 },
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
  {
    field: 'process',
    title: t('qms.inspection.records.form.process'),
    width: 150,
    formatter: ({ row }) =>
      row.process ||
      (row.itpProjectId ? t('qms.inspection.records.itpPlan') : '-'),
  },
  {
    field: 'level1Component',
    title: t('qms.inspection.records.form.level1'),
    width: 120,
  },
  {
    field: 'componentName',
    title: t('qms.inspection.records.form.componentName'),
    minWidth: 150,
    formatter: ({ row }) =>
      row.componentName ||
      (row.results
        ? t('qms.inspection.records.inspectionCount', {
            count: row.results.length,
          })
        : '-'),
  },
  {
    field: 'quantity',
    title: t('qms.inspection.records.form.quantity'),
    width: 80,
  },
  {
    field: 'result',
    title: t('qms.inspection.records.form.result'),
    width: 100,
    slots: { default: 'result' },
  },
  {
    field: 'inspector',
    title: t('qms.inspection.records.form.inspector'),
    width: 120,
  },
  { field: 'team', title: t('qms.inspection.records.form.team'), width: 100 },
  { field: 'reportDate', title: t('common.date'), width: 120 },
  {
    title: t('common.action'),
    width: 150,
    fixed: 'right',
    cellRender: {
      name: 'CellOperation',
      props: {
        options: [
          ...(actions.canEdit ? ['edit'] : []),
          ...(actions.canDelete ? ['delete'] : []),
        ],
        onClick: ({ code, row }: { code: string; row: any }) => {
          if (code === 'edit') actions.onEdit(row);
          if (code === 'delete') actions.onDelete(row);
        },
      },
    },
  },
];

export const getShipmentColumns = (
  t: (key: string) => string,
  actions: {
    canEdit: boolean;
    canDelete: boolean;
    onEdit: (row: any) => void;
    onDelete: (row: any) => void;
  },
): VxeGridPropTypes.Columns => [
  { type: 'checkbox', width: 50 },
  { type: 'seq', title: t('common.seq'), width: 60 },
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
  {
    field: 'componentName',
    title: t('qms.inspection.records.form.componentName'),
    minWidth: 150,
    formatter: ({ row }) =>
      row.componentName ||
      (row.results
        ? t('qms.inspection.records.inspectionCount', {
            count: row.results.length,
          })
        : '-'),
  },
  {
    field: 'quantity',
    title: t('qms.inspection.records.form.quantity'),
    width: 100,
  },
  {
    field: 'inspector',
    title: t('qms.inspection.records.form.inspector'),
    width: 120,
  },
  { field: 'reportDate', title: t('common.date'), width: 120 },
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
  {
    title: t('common.action'),
    width: 150,
    fixed: 'right',
    cellRender: {
      name: 'CellOperation',
      props: {
        options: [
          ...(actions.canEdit ? ['edit'] : []),
          ...(actions.canDelete ? ['delete'] : []),
        ],
        onClick: ({ code, row }: { code: string; row: any }) => {
          if (code === 'edit') actions.onEdit(row);
          if (code === 'delete') actions.onDelete(row);
        },
      },
    },
  },
];
