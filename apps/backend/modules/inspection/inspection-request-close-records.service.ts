import type { Prisma } from '@prisma/client';

import type { AuthorizedSourceContext } from './inspection-request-close-effects.service';

import prisma from '~/utils/prisma';

import { buildInspectionRecordFromRequest } from './inspection-request';
import { buildCloseInspectionResponsibilityWrite } from './inspection-request-close-responsibility.service';
import { assertWorkOrdersExist } from './inspection-request-work-orders';

export type CloseRecordRequest = Prisma.qms_inspection_requestsGetPayload<{
  include: {
    process: { select: { name: true } };
    work_order: { select: { projectName: true } };
    workOrders: { select: { isPrimary: true; workOrderNumber: true } };
  };
}>;

export type CloseInspectionRecordLink = {
  inspectionId: string;
  isPrimary: boolean;
  workOrderNumber: string;
};

export async function createCloseInspectionRecords(options: {
  body: Record<string, unknown>;
  request: CloseRecordRequest;
  sourceContext?: AuthorizedSourceContext;
  tx?: Prisma.TransactionClient;
}): Promise<CloseInspectionRecordLink[]> {
  const client = options.tx ?? prisma;
  if (options.sourceContext && options.sourceContext.transaction !== options.tx)
    throw new Error('Close derived write transaction mismatch');
  const numbers = resolveCloseWorkOrderNumbers(options.request);
  const workOrders = await assertWorkOrdersExist(client, numbers);
  const projectByWorkOrder = new Map(
    workOrders.map((item) => [item.workOrderNumber, item.projectName]),
  );
  const links: CloseInspectionRecordLink[] = [];

  for (const [index, workOrderNumber] of numbers.entries()) {
    const inspection = await buildInspectionRecordFromRequest(
      options.request,
      options.body,
      {
        projectName: projectByWorkOrder.get(workOrderNumber) || null,
        workOrderNumber,
      },
      options.tx,
    );
    // qms-arch-allow R-SCOPE: close-flow inspection persist; the record was
    // built and its id assigned in the same transaction.
    await client.inspections.update({
      data: buildCloseInspectionResponsibilityWrite({
        inspection,
        request: options.request,
      }),
      where: { id: inspection.id },
    });
    links.push({
      inspectionId: String(inspection.id),
      isPrimary: index === 0,
      workOrderNumber,
    });
  }

  return links;
}

function resolveCloseWorkOrderNumbers(request: CloseRecordRequest) {
  const linked = request.workOrders.map((item) => item.workOrderNumber);
  return [...new Set([request.workOrderNumber, ...linked])];
}
