import { defineEventHandler, getRouterParam, readBody } from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少供应商ID');
  }

  try {
    const body = await readBody(event);

    await prisma.suppliers.update({
      where: { id },
      data: {
        name: body.name,
        category: body.category,
        productName: body.productName,
        brand: body.brand,
        origin: body.origin,
        project: body.project,
        buyer: body.buyer,
        score2025: Number(body.score2025) || 0, // Ensure float/int
        status: body.status,
        contact: body.contact,
        phone: body.phone,
        email: body.email,
        address: body.address,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update supplier:', error);
    return useResponseError('更新供应商失败');
  }
});
