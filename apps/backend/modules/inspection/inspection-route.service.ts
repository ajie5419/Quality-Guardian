import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/governance/master-data/master-data-governance-write';
import {
  resolveCanonicalProcessName,
  resolveProcessIdForWrite,
} from '~/governance/master-data/process-resolver';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { buildInspectionFormProcessFilter } from '~/modules/inspection/inspection-form';
import prisma from '~/utils/prisma';

import { InspectionRequestCloseService } from './inspection-request-close.service';
import { InspectionRequestStatsService } from './inspection-request-stats.service';

function fail(prefix: string, message: string): never {
  throw new Error(`${prefix}:${message}`);
}

export const InspectionRouteService = {
  async closeRequest(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    return InspectionRequestCloseService.closeRequest(
      event,
      id,
      body,
      userinfo,
    );
  },

  async getRequestStats(query: {
    endDate?: string;
    period?: string;
    startDate?: string;
  }) {
    return InspectionRequestStatsService.getRequestStats(query);
  },

  async updateInspectionFormTemplate(
    id: string,
    body: Record<string, unknown>,
    userinfo: { username?: string },
  ) {
    const current = await prisma.inspection_form_templates.findUnique({
      where: { id },
      select: {
        partName: true,
        processId: true,
        process: { select: { name: true } },
        processName: true,
        status: true,
        workOrderNumber: true,
      },
    });
    if (!current) fail('NOT_FOUND', '检验表不存在');
    const workOrderNumber =
      body.workOrderNumber === undefined
        ? undefined
        : String(body.workOrderNumber || '').trim();
    const processName =
      body.processName === undefined
        ? undefined
        : String(body.processName || '').trim();
    const partName =
      body.partName === undefined
        ? undefined
        : String(body.partName || '').trim();
    const status =
      body.status === undefined
        ? undefined
        : String(body.status || '').trim() || 'active';
    const formNo =
      body.formNo === undefined ? undefined : String(body.formNo || '').trim();
    const drawingNo =
      body.drawingNo === undefined
        ? undefined
        : String(body.drawingNo || '').trim();
    const templateQuantity =
      body.templateQuantity === undefined
        ? undefined
        : Number(body.templateQuantity);
    const finalStatus = status ?? String(current.status || '').trim();
    const currentProcessName = resolveCanonicalProcessName(current) || '';
    if (finalStatus === 'active') {
      const finalWorkOrderNumber = workOrderNumber ?? current?.workOrderNumber;
      const finalProcessName = processName ?? currentProcessName;
      const finalPartName = partName ?? String(current?.partName || '').trim();
      if (finalWorkOrderNumber && finalProcessName) {
        const processFilter = await buildInspectionFormProcessFilter({
          category: 'PROCESS',
          processId: processName === undefined ? current.processId : null,
          processName: finalProcessName,
        });
        const duplicatedActiveTemplate =
          await prisma.inspection_form_templates.findFirst({
            where: {
              id: { not: id },
              isDeleted: false,
              ...(finalPartName
                ? { partName: finalPartName }
                : { OR: [{ partName: null }, { partName: '' }] }),
              ...processFilter,
              status: 'active',
              workOrderNumber: finalWorkOrderNumber,
            },
            select: { id: true },
          });
        if (duplicatedActiveTemplate)
          fail(
            'CONFLICT',
            '同一工单同一工序已存在启用中的检验表模板，请先停用旧模板',
          );
      }
    }
    const processNameChanged =
      processName !== undefined && processName !== currentProcessName;
    let normalizedTemplateQuantity: null | number | undefined;
    if (templateQuantity === undefined) {
      normalizedTemplateQuantity = undefined;
    } else if (Number.isFinite(templateQuantity) && templateQuantity > 0) {
      normalizedTemplateQuantity = Math.trunc(templateQuantity);
    } else {
      normalizedTemplateQuantity = null;
    }
    let resolvedProcessId: string | undefined;
    if (processName === undefined) {
      resolvedProcessId = undefined;
    } else if (processNameChanged) {
      resolvedProcessId = await resolveProcessIdForWrite({ processName });
    } else {
      resolvedProcessId = undefined;
    }
    const governedFields = buildGovernedWriteFieldsForTable(
      'inspection_form_templates',
      {
        formName:
          body.formName === undefined
            ? undefined
            : String(body.formName || '').trim(),
        partName: partName === undefined ? undefined : partName || null,
        processName: processName === undefined ? undefined : processName,
        projectName:
          body.projectName === undefined
            ? undefined
            : String(body.projectName || '').trim() || null,
      },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'inspection_form_templates',
      {
        formName:
          governedFields.formName === undefined
            ? undefined
            : governedFields.formName,
      },
    );
    const updated = await prisma.inspection_form_templates.update({
      where: { id },
      data: {
        attachments:
          body.attachments === undefined
            ? undefined
            : String(body.attachments || '').trim() || null,
        formFields:
          body.formFields === undefined
            ? undefined
            : JSON.stringify(body.formFields || []),
        formName:
          governedFields.formName === undefined
            ? undefined
            : governedFields.formName,
        formNo: formNo === undefined ? undefined : formNo || null,
        processId: resolvedProcessId,
        partName:
          governedFields.partName === undefined
            ? undefined
            : governedFields.partName,
        processName:
          governedFields.processName === undefined
            ? undefined
            : governedFields.processName,
        projectName:
          governedFields.projectName === undefined
            ? undefined
            : governedFields.projectName,
        ...governedCanonicalIds,
        templateQuantity: normalizedTemplateQuantity,
        drawingNo: drawingNo === undefined ? undefined : drawingNo || null,
        status: status === undefined ? undefined : status,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
        workOrderNumber:
          workOrderNumber === undefined ? undefined : workOrderNumber,
      },
    });
    if (body.attachments !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.attachments,
        bizId: id,
        bizType: 'inspection_form_template',
      });
    }
    return updated;
  },
};
