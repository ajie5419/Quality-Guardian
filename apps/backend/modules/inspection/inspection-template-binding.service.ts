import type { InspectionRecordInput } from './inspection-record-types';

import process from 'node:process';

import { Prisma } from '@prisma/client';
import { buildInspectionFormProcessFilter } from '~/modules/inspection/inspection-form';

const inspectionTemplateAutoBindEnabled =
  process.env.INSPECTION_TEMPLATE_AUTO_BIND_ENABLED !== 'false';

export async function resolveInspectionTemplateBinding(
  tx: Prisma.TransactionClient,
  data: InspectionRecordInput,
) {
  const directTemplateId = String(data.templateId || '').trim();
  const directTemplateName = String(data.templateName || '').trim();
  if (directTemplateId || directTemplateName) {
    return {
      templateId: directTemplateId || null,
      templateName: directTemplateName || null,
    };
  }

  if (!inspectionTemplateAutoBindEnabled) {
    return {
      templateId: null,
      templateName: null,
    };
  }

  const workOrderNumber = String(data.workOrderNumber || '').trim();
  if (!workOrderNumber) {
    return {
      templateId: null,
      templateName: null,
    };
  }
  const processFilter = await buildInspectionFormProcessFilter({
    category: data.category,
    incomingType: data.incomingType || null,
    processId: data.processId,
    processName: data.processName || '',
  });
  if (Object.keys(processFilter).length === 0) {
    return {
      templateId: null,
      templateName: null,
    };
  }

  const partCandidates = [
    String(data.materialName || '').trim(),
    String(data.level2Component || '').trim(),
    String(data.level1Component || '').trim(),
  ].filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);
  let matchedTemplate = null;
  for (const partName of partCandidates) {
    // governance-allow-direct-canonical-read: template match still relies on part-name fallback strategy.
    matchedTemplate = await tx.inspection_form_templates.findFirst({
      where: {
        isDeleted: false,
        partName,
        ...processFilter,
        status: 'active',
        workOrderNumber,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        formName: true,
        id: true,
      },
    });
    if (matchedTemplate) {
      break;
    }
  }
  if (!matchedTemplate) {
    // governance-allow-direct-canonical-read: fallback empty-part template lookup is name-based by design.
    matchedTemplate = await tx.inspection_form_templates.findFirst({
      where: {
        isDeleted: false,
        OR: [{ partName: null }, { partName: '' }],
        ...processFilter,
        status: 'active',
        workOrderNumber,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        formName: true,
        id: true,
      },
    });
  }

  return {
    templateId: matchedTemplate?.id || null,
    templateName: matchedTemplate?.formName || null,
  };
}
