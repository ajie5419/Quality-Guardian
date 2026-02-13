import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import {
  createSupplierId,
  normalizeSupplierName,
  normalizeSupplierScore,
  normalizeSupplierStatus,
  normalizeSupplierString,
} from '~/utils/supplier';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const name = normalizeSupplierName(body.name);
    const missingFields = getMissingRequiredFields({ name }, ['name']);
    if (missingFields.length > 0) {
      setResponseStatus(event, 400);
      return useResponseError(`缺少必填字段: ${missingFields[0]}`);
    }

    const newSupplier = await prisma.suppliers.create({
      data: {
        id: createSupplierId(),
        name,
        category: normalizeSupplierString(body.category),
        productName: normalizeSupplierString(body.productName),
        brand: normalizeSupplierString(body.brand),
        origin: normalizeSupplierString(body.origin),
        project: normalizeSupplierString(body.project),
        buyer: normalizeSupplierString(body.buyer),
        score2025: normalizeSupplierScore(body.score2025, 0),
        status: normalizeSupplierStatus(body.status),
        // Optional fields
        contact: normalizeSupplierString(body.contact),
        phone: normalizeSupplierString(body.phone),
        email: normalizeSupplierString(body.email),
        address: normalizeSupplierString(body.address),
        isDeleted: false,
      },
    });

    return useResponseSuccess(newSupplier);
  } catch (error: unknown) {
    logApiError('supplier', error);
    if (isPrismaUniqueConstraintError(error)) {
      setResponseStatus(event, 409);
      return useResponseError('供应商名称已存在');
    }
    setResponseStatus(event, 500);
    return useResponseError('创建供应商失败');
  }
});
