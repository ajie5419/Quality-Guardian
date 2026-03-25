import type { VbenFormSchema } from '#/adapter/form';

import { $t } from '@vben/locales';

import { Modal } from 'ant-design-vue';

import { getProcessOptions } from '../config';

export const getFormSchema = (type: string): VbenFormSchema[] => {
  const isIncoming = type === 'incoming';
  const isProcess = type === 'process';
  const isShipment = type === 'shipment';

  const schema: VbenFormSchema[] = [
    {
      fieldName: 'workOrderNumber',
      label: $t('qms.workOrder.workOrderNumber'),
      component: 'WorkOrderSelect',
      rules: 'required',
      modelPropName: 'value', // Important for custom components
    },
    {
      fieldName: 'projectName',
      label: $t('qms.workOrder.projectName'),
      component: 'Input',
      componentProps: {
        disabled: true,
      },
    },
  ];

  // --- Dynamic Fields ---
  if (isIncoming) {
    schema.push(
      {
        fieldName: 'incomingType',
        label: $t('qms.inspection.records.form.incomingType'),
        component: 'Select',
        rules: 'selectRequired',
        modelPropName: 'value',
        componentProps: {
          options: [
            {
              label: $t('qms.inspection.records.options.process.rawMaterial'),
              value: '原材料',
            },
            {
              label: $t('qms.inspection.records.options.process.outsourced'),
              value: '外购件',
            },
            {
              label: $t('qms.inspection.records.options.process.auxiliary'),
              value: '辅材',
            },
            {
              label: $t('qms.inspection.records.options.process.machined'),
              value: '机加成品件',
            },
          ],
        },
      },
      {
        fieldName: 'supplierName',
        label: '单位',
        component: 'SupplierSelect',
        rules: 'required',
        modelPropName: 'value',
      },
      {
        fieldName: 'hasDocuments',
        label: '是否有资料',
        component: 'Switch',
        defaultValue: true,
        modelPropName: 'checked',
        componentProps: {
          checkedChildren: '是',
          unCheckedChildren: '否',
          class: 'w-[60px]',
          beforeChange: (checked: boolean) =>
            new Promise<boolean>((resolve) => {
              Modal.confirm({
                title: '确认更改',
                content: `确定要将是否有资料改为"${checked ? '是' : '否'}"吗？`,
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
              });
            }),
        },
      },
    );
  }

  if (isIncoming || isShipment) {
    schema.push({
      fieldName: 'materialName',
      label: isShipment
        ? $t('qms.planning.bom.partName')
        : $t('qms.inspection.records.form.materialName'),
      component: 'Input',
      rules: 'required',
    });
  }

  if (isProcess) {
    schema.push(
      {
        fieldName: 'processName',
        label: $t('qms.inspection.records.form.process'),
        component: 'Select',
        rules: 'selectRequired',
        modelPropName: 'value',
        componentProps: {
          options: getProcessOptions($t),
        },
      },
      {
        fieldName: 'level1Component',
        label: $t('qms.inspection.records.form.level1'),
        component: 'BomItemSelect',
        modelPropName: 'value',
      },
      {
        fieldName: 'level2Component',
        label: $t('qms.inspection.records.form.componentName'),
        component: 'Input',
        rules: 'required',
      },
      {
        fieldName: 'team',
        label: $t('qms.inspection.records.form.team'),
        component: 'TeamSelect',
        rules: 'required',
        modelPropName: 'value',
      },
    );
  }

  if (isShipment) {
    schema.push(
      {
        fieldName: 'documents',
        label: $t('qms.inspection.records.form.documents'),
        component: 'Input',
        rules: 'required',
      },
      {
        fieldName: 'packingListArchived',
        label: $t('qms.inspection.records.form.packingListArchived'),
        component: 'Select',
        defaultValue: '是',
        rules: 'selectRequired',
        modelPropName: 'value',
        componentProps: {
          options: [
            { label: $t('common.yes') || '是', value: '是' },
            { label: $t('common.no') || '否', value: '否' },
          ],
        },
      },
    );
  }

  // --- Common Fields ---
  schema.push(
    {
      fieldName: 'quantity',
      label: $t('qms.workOrder.quantity'),
      component: 'InputNumber',
      rules: 'required',
      defaultValue: 1,
    },
    {
      fieldName: 'inspectionDate',
      label: $t('qms.inspection.issues.reportDate'),
      component: 'DatePicker',
      rules: 'required',
      defaultValue: '',
      componentProps: {
        valueFormat: 'YYYY-MM-DD',
      },
    },
    {
      fieldName: 'inspector',
      label: $t('qms.inspection.issues.reportedBy'),
      component: 'Input',
      rules: 'required',
    },
    {
      fieldName: 'remarks',
      label: $t('qms.inspection.fields.remarks'),
      component: 'Textarea',
      componentProps: {
        rows: 2,
      },
      formItemClass: 'col-span-full',
    },
    {
      fieldName: 'result',
      label: $t('qms.inspection.records.form.overallResult'),
      component: 'Select',
      defaultValue: 'PASS',
      modelPropName: 'value',
      componentProps: {
        class: 'w-32',
        options: [
          { label: '合格', value: 'PASS' },
          { label: '不合格', value: 'FAIL' },
        ],
      },
      formItemClass: 'col-span-full',
    },
  );

  return schema;
};
