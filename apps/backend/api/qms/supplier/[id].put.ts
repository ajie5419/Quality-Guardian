import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('缺少供应商ID');
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
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'P2025') {
      setResponseStatus(event, 404);
      return useResponseError('供应商不存在');
    }
    if (errorCode === 'P2002') {
      setResponseStatus(event, 409);
      return useResponseError('供应商名称已存在');
    }
    setResponseStatus(event, 500);
    return useResponseError('更新供应商失败');
  }
});
