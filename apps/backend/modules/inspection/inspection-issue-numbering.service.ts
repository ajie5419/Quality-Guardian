import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import { applyInspectionIssueWriteOwnership } from './inspection-issue-access.service';

export const InspectionIssueNumberingService = {
  async deleteRecord(
    id: string,
    userId: string,
    roles?: unknown,
  ): Promise<void> {
    const result = await prisma.$transaction(async (tx) => {
      const result = await tx.quality_records.updateMany({
        where: applyInspectionIssueWriteOwnership(
          { id, isDeleted: false },
          { roles, userId },
        ),
        data: {
          isDeleted: true,
          updatedAt: new Date(),
        },
      });
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'INTERNAL', sourcePk: id }],
        'inspection-issue.deleted',
      );
      return result;
    });
    if (result.count === 0) {
      throw new BusinessError('NOT_FOUND', '记录不存在', 404);
    }
    const [
      { FileStorageService },
      { SystemLogService },
      { WelderScoreService },
    ] = await Promise.all([
      import('~/modules/file-storage'),
      import('~/modules/system-log'),
      import('~/modules/welder'),
    ]);
    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'inspection_issue',
    });
    await WelderScoreService.syncFromInspectionIssues();

    // Record audit log
    await SystemLogService.auditLog('inspection', 'issueDelete', {
      userId,
      targetId: id,
      detailsVariables: {},
    });
  },
};
