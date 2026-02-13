import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  mapProjectBomItem,
  normalizeBomText,
  parseBomQuantity,
} from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID required');
  }

  try {
    const body = await readBody(event);
    const updated = await prisma.project_boms.update({
      where: { id },
      data: {
        part_name: normalizeBomText(body.partName) || '未命名部件',
        part_number: normalizeBomText(body.partNumber) || null,
        material: normalizeBomText(body.material) || null,
        quantity: parseBomQuantity(body.quantity, 1),
        unit: normalizeBomText(body.unit) || 'PCS',
        remarks: normalizeBomText(body.remarks) || null,
        updated_at: new Date(),
      },
    });

    return useResponseSuccess(mapProjectBomItem(updated));
  } catch (error) {
    logApiError('bom', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    return useResponseError('更新 BOM 条目失败');
  }
});
