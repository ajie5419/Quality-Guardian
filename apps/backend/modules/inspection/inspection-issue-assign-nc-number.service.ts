import type { UserSession } from '~/utils/jwt-utils';

import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexService } from '~/modules/quality-loss';
import { SystemLogService } from '~/modules/system-log';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  applyInspectionIssueWriteOwnership,
  InspectionIssueAccessService,
} from './inspection-issue-access.service';
import { reserveInspectionIssueNcNumber } from './inspection-issue-nc-number.service';

const logger = createModuleLogger('InspectionIssueAssignNcNumber');

export const InspectionIssueAssignNcNumberService = {
  async assignNcNumber(userinfo: UserSession, id: string) {
    const userContext = await InspectionIssueAccessService.getAccessContext(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.ASSIGN_NC_NUMBER,
    );
    const record = await prisma.$transaction(async (tx) => {
      const current = await tx.quality_records.findUnique({
        where: applyInspectionIssueWriteOwnership(
          { id, isDeleted: false },
          userContext,
        ),
        select: { nonConformanceNumber: true },
      });
      if (!current) {
        throw new BusinessError('NOT_FOUND', '不合格项不存在', 404);
      }
      if (current.nonConformanceNumber !== null) {
        throw new BusinessError('CONFLICT', '不合格项已经生成编号', 409);
      }

      const nonConformanceNumber = await reserveInspectionIssueNcNumber(tx);
      const assignment = await tx.quality_records.updateMany({
        where: applyInspectionIssueWriteOwnership(
          { id, isDeleted: false, nonConformanceNumber: null },
          userContext,
        ),
        data: { nonConformanceNumber },
      });
      if (assignment.count !== 1) {
        throw new BusinessError('CONFLICT', '不合格项已经生成编号', 409);
      }
      const updated = await tx.quality_records.findUnique({
        where: applyInspectionIssueWriteOwnership(
          { id, isDeleted: false },
          userContext,
        ),
      });
      if (!updated) {
        throw new BusinessError('NOT_FOUND', '不合格项不存在', 404);
      }
      await QualityLossIndexService.upsertFromInternalInTransaction(
        updated,
        tx,
      );
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [updated.supplierId],
        'inspection-issue.nc-number-assigned',
      );
      return updated;
    });
    try {
      await SystemLogService.auditLog('inspection', 'issueAssignNcNumber', {
        userId: String(userinfo.id || userinfo.userId || ''),
        targetId: id,
        detailsVariables: {
          nonConformanceNumber: record.nonConformanceNumber,
          partName: record.partName,
        },
      });
    } catch (error) {
      // The number is committed and cannot be assigned again, so preserve the
      // success response while retaining the failure for operational recovery.
      logger.error(error, 'inspection-issue audit after NC assignment');
    }
    return { ...record, ncNumber: record.nonConformanceNumber };
  },
};
