import { defineEventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    // 1. Fetch Manual Records
    const manualRecords = await prisma.quality_losses.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Fetch Internal Loss (Engineering Problems)
    const internalRecords = await prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        isClaim: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Fetch External Loss (After-sales Problems)
    const externalRecords = await prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        isClaim: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatDate = (date: Date | null) => {
      if (!date) return null;
      return date.toISOString().split('T')[0];
    };

    const result: unknown[] = [];

    // Map Manual Records
    manualRecords.forEach((item) => {
      result.push({
        ...item,
        id: item.lossId || item.id,
        pk: item.id,
        date: formatDate(item.occurDate),
        responsibleDepartment: item.respDept,
        lossSource: 'Manual',
        workOrderNumber: '-',
        projectName: '-',
        partName: item.type,
        actualClaim: Number(item.actualClaim || 0),
      });
    });

    // Map Internal Records
    internalRecords.forEach((item) => {
      result.push({
        id: `INT-${item.serialNumber}`,
        pk: item.id,
        date: formatDate(item.date),
        amount: Number(item.lossAmount),
        responsibleDepartment: item.responsibleDepartment,
        description: item.description,
        // Map original status (CLOSED -> Confirmed, OPEN -> Pending)
        status: item.status === 'CLOSED' ? 'Confirmed' : 'Pending',
        type: 'Internal',
        lossSource: 'Internal',
        workOrderNumber: item.workOrderNumber,
        projectName: item.projectName,
        partName: item.partName,
        actualClaim: Number(item.recoveredAmount || 0),
        createdAt: item.createdAt,
      });
    });

    // Map External Records
    externalRecords.forEach((item) => {
      const totalAmount =
        Number(item.materialCost || 0) + Number(item.laborTravelCost || 0);
      result.push({
        id: `EXT-${item.serialNumber}`,
        pk: item.id,
        date: formatDate(item.occurDate),
        amount: totalAmount,
        responsibleDepartment: item.respDept,
        description: item.issueDescription,
        // Map original claimStatus (CLOSED -> Confirmed, OPEN/IN_PROGRESS -> Pending)
        status: item.claimStatus === 'CLOSED' ? 'Confirmed' : 'Pending',
        type: 'External',
        lossSource: 'External',
        workOrderNumber: item.workOrderNumber,
        projectName: item.projectName,
        partName: item.productSubtype || item.productType,
        actualClaim: Number(item.actualClaim || 0),
        createdAt: item.createdAt,
      });
    });

    // Sort by date desc
    result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return useResponseSuccess(result);
  } catch (error) {
    console.error('Failed to fetch quality losses:', error);
    return useResponseSuccess([]);
  }
});
