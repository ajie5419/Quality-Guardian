import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import {
  normalizeSupplierScore,
  normalizeSupplierStatus,
  normalizeSupplierString,
} from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少供应商ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);

    await prisma.suppliers.update({
      where: { id },
      data: {
        name: normalizeSupplierString(body.name),
        category: normalizeSupplierString(body.category),
        productName: normalizeSupplierString(body.productName),
        brand: normalizeSupplierString(body.brand),
        origin: normalizeSupplierString(body.origin),
        project: normalizeSupplierString(body.project),
        buyer: normalizeSupplierString(body.buyer),
        score2025: normalizeSupplierScore(body.score2025, 0),
        status: normalizeSupplierStatus(body.status),
        contact: normalizeSupplierString(body.contact),
        phone: normalizeSupplierString(body.phone),
        email: normalizeSupplierString(body.email),
        address: normalizeSupplierString(body.address),
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('supplier', error);
    if (isPrismaNotFoundError(error)) {
      setResponseStatus(event, 404);
      return useResponseError('供应商不存在');
    }
    if (isPrismaUniqueConstraintError(error)) {
      setResponseStatus(event, 409);
      return useResponseError('供应商名称已存在');
    }
    setResponseStatus(event, 500);
    return useResponseError('更新供应商失败');
  }
});
