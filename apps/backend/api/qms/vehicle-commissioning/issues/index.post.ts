import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { VehicleCommissioningService } from '~/services/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

function normalizeBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', '是'].includes(String(value).toLowerCase());
}

function normalizePhotos(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    if (!body.description && !body.title) {
      return badRequestResponse(event, '缺少问题描述');
    }
    const photos = normalizePhotos(body.photos);

    const created = await VehicleCommissioningService.createIssue(
      {
        assignee: body.assignee ? String(body.assignee) : undefined,
        date: body.date ? String(body.date) : undefined,
        description: body.description ? String(body.description) : undefined,
        isClaim: normalizeBoolean(body.isClaim),
        lossAmount: normalizeNumber(body.lossAmount),
        partName: body.partName ? String(body.partName) : undefined,
        photos,
        projectName: body.projectName ? String(body.projectName) : undefined,
        recoveredAmount: normalizeNumber(body.recoveredAmount),
        responsibleDepartment: body.responsibleDepartment
          ? String(body.responsibleDepartment)
          : undefined,
        claimNotes: body.claimNotes ? String(body.claimNotes) : undefined,
        claimStatus: body.claimStatus ? String(body.claimStatus) : undefined,
        severity: body.severity ? String(body.severity) : undefined,
        solution: body.solution ? String(body.solution) : undefined,
        status: body.status ? (String(body.status) as any) : undefined,
        title: body.title ? String(body.title) : undefined,
        workOrderNumber: body.workOrderNumber
          ? String(body.workOrderNumber)
          : undefined,
      },
      String(userinfo.id),
    );
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: photos,
        bizId: String(created.id),
        bizType: 'vehicle_commissioning_issue',
        fieldName: 'photos',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
    }
    return useResponseSuccess(created);
  } catch (error) {
    logApiError('vehicle-commissioning-issues-create', error);
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
