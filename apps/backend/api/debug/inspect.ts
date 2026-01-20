import { eventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default eventHandler(async () => {
  try {
    const count = await prisma.quality_records.count();
    const latest = await prisma.quality_records.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        issuePhoto: true,
        createdAt: true,
      },
    });

    return {
      status: 'success',
      count,
      latest,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
    };
  }
});
