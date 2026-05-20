import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { KnowledgeSettlementParams } from '#/hooks/useKnowledgeSettlement';

function buildAfterSalesKnowledgeSections(
  row: QmsAfterSalesApi.AfterSalesItem,
  t: (key: string) => string,
): KnowledgeSettlementParams['sections'] {
  return [
    {
      title: t('qms.afterSales.form.baseInfo'),
      fields: [
        {
          label: t('qms.afterSales.form.workOrderNumber'),
          value: row.workOrderNumber,
        },
        {
          label: t('qms.afterSales.form.projectName'),
          value: row.projectName,
        },
        {
          label: t('qms.afterSales.form.partName'),
          value: row.partName || '-',
        },
        {
          label: t('qms.afterSales.form.customerName'),
          value: row.customerName,
        },
      ],
    },
    {
      title: t('qms.afterSales.form.issueDetails'),
      content: row.issueDescription,
    },
    {
      title: t('qms.afterSales.form.resolutionPlan'),
      content: row.resolutionPlan || t('common.notSet'),
    },
    {
      title: t('qms.afterSales.form.responsibility'),
      fields: [
        {
          label: t('qms.afterSales.form.materialCost'),
          value: `¥${row.materialCost}`,
        },
        {
          label: t('qms.afterSales.form.laborTravelCost'),
          value: `¥${row.laborTravelCost}`,
        },
      ],
    },
  ];
}

export function buildAfterSalesKnowledgePayload(
  row: QmsAfterSalesApi.AfterSalesItem,
  t: (key: string) => string,
): KnowledgeSettlementParams {
  return {
    title: `【${t('qms.afterSales.title')}】${row.workOrderNumber} - ${row.partName || row.projectName}`,
    summary: row.issueDescription,
    categoryId: 'CAT-DEFAULT',
    photos: row.photos,
    attachmentNamePrefix: t('qms.afterSales.title'),
    tags: [row.defectType, row.productType, row.partName, row.projectName],
    sections: buildAfterSalesKnowledgeSections(row, t),
  };
}
