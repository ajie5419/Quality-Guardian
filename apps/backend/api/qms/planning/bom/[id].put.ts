import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID required' };

  try {
    const updated = await prisma.project_boms.update({
      where: { id },
      data: {
        part_name: body.partName,
        part_number: body.partNumber,
        material: body.material,
        quantity: Number(body.quantity),
        unit: body.unit,
        remarks: body.remarks,
        updated_at: new Date(),
      },
    });

    return {
      code: 0,
      data: updated,
      message: 'ok',
    };
  } catch (error) {
    console.error('Update BOM item error:', error);
    return { code: -1, message: '更新失败' };
  }
});
