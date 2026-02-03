import { defineEventHandler, getQuery } from 'h3';
import { AfterSalesService } from '~/services/after-sales.service';
import { mapAfterSalesStatus } from '~/utils/after-sales-status';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);

  // Transform query params to expected types
  const params = {
    year: query.year ? Number.parseInt(String(query.year)) : undefined,
    workOrderNumber: query.workOrderNumber
      ? String(query.workOrderNumber)
      : undefined,
    projectName: query.projectName ? String(query.projectName) : undefined,
    status: query.status
      ? mapAfterSalesStatus(String(query.status))
      : undefined,
    supplierBrand: query.supplierBrand
      ? String(query.supplierBrand)
      : undefined,
  };

  const list = await AfterSalesService.getList(params);

  return useResponseSuccess(list);
});
