import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaMissingColumnError } from '~/utils/prisma-error';
import { parseProjectDocuments } from '~/utils/project-documents';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    let result: Array<{
      customerName: string;
      deliveryDate: Date | null;
      division: string;
      documents: ReturnType<typeof parseProjectDocuments>;
      id: string;
      projectName: string;
      status: string;
      workOrderNumber: string;
    }>;

    try {
      const projects = await prisma.doc_projects.findMany({
        where: { isDeleted: false },
        include: {
          work_order: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      result = projects.map((p) => ({
        id: p.id,
        workOrderNumber: p.workOrderNumber,
        projectName: p.projectName,
        status: p.status,
        customerName: p.work_order.customerName,
        division: p.work_order.division,
        deliveryDate: p.work_order.deliveryDate,
        documents: parseProjectDocuments(p.documents),
      }));
    } catch (error) {
      if (!isPrismaMissingColumnError(error)) {
        throw error;
      }

      const projects = await prisma.doc_projects.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          workOrderNumber: true,
          projectName: true,
          status: true,
          work_order: {
            select: {
              customerName: true,
              deliveryDate: true,
              division: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      result = projects.map((p) => ({
        id: p.id,
        workOrderNumber: p.workOrderNumber,
        projectName: p.projectName,
        status: p.status,
        customerName: p.work_order.customerName,
        division: p.work_order.division,
        deliveryDate: p.work_order.deliveryDate,
        documents: [],
      }));
    }

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('project-docs-projects', error);
    return internalServerErrorResponse(event, '获取项目资料列表失败');
  }
});
