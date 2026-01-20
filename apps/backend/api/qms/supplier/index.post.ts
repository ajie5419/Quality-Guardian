import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);

    const newSupplier = await prisma.suppliers.create({
      data: {
        id: `SUP-${Date.now()}`,
        name: body.name,
        category: body.category,
        productName: body.productName,
        brand: body.brand,
        origin: body.origin,
        project: body.project,
        buyer: body.buyer,
        score2025: Number(body.score2025) || 0,
        status: body.status || 'Qualified',
        // Optional fields
        contact: body.contact,
        phone: body.phone,
        email: body.email,
        address: body.address,
        isDeleted: false,
      },
    });

    return useResponseSuccess(newSupplier);
  } catch (error) {
    console.error('Failed to create supplier:', error);
    return useResponseError('创建供应商失败');
  }
});
