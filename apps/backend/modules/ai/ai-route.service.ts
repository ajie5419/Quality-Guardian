import prisma from '~/utils/prisma';

export const AiRouteService = {
  async listHistoryIssues(partName: string) {
    return prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        OR: [
          { partName: { contains: partName } },
          { description: { contains: partName } },
        ],
      },
      take: 15,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        partName: true,
        description: true,
        rootCause: true,
        solution: true,
        createdAt: true,
      },
    });
  },
};
