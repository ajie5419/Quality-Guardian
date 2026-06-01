import { SUPPLIER_CATEGORY } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionPublicQueryService } from '~/modules/inspection/inspection-public-query.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z
  .object({
    category: z
      .enum([SUPPLIER_CATEGORY.OUTSOURCING, SUPPLIER_CATEGORY.SUPPLIER])
      .optional(),
    keyword: z.string().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const query = schema.parse(getQuery(event));
  const keyword = String(query.keyword || '').trim();
  const category = query.category || SUPPLIER_CATEGORY.SUPPLIER;

  try {
    return useResponseSuccess(
      await InspectionPublicQueryService.getPublicSuppliers(keyword, category),
    );
  } catch (error) {
    logApiError(
      'public-inspection-request-supplier-list',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(event, '获取供应商列表失败');
  }
});
