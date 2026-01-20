import { defineEventHandler, readBody } from 'h3';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  await prisma.system_settings.upsert({
    where: { key: 'AI_CONFIGURATION' },
    update: {
      value: JSON.stringify(body),
      updatedAt: new Date(),
    },
    create: {
      key: 'AI_CONFIGURATION',
      value: JSON.stringify(body),
      updatedAt: new Date(),
    },
  });

  return useResponseSuccess(body);
});
