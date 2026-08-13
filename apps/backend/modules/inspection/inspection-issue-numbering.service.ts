import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import { applyInspectionIssueWriteOwnership } from './inspection-issue-access.service';

export const InspectionIssueNumberingService = {
  async generateNextNcNumber(): Promise<string> {
    const now = new Date();
    const yearShort = now.getFullYear().toString().slice(-2);
    // Format: NC-YYKJ-XXX
    const prefix = `NC-${yearShort}KJ-`;

    // Find the max existing number for this prefix
    const lastRecord = await prisma.quality_records.findFirst({
      where: {
        nonConformanceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        nonConformanceNumber: 'desc',
      },
      select: {
        nonConformanceNumber: true,
      },
    });

    let sequence = 1;
    if (lastRecord && lastRecord.nonConformanceNumber) {
      // Extract the last 3 digits
      const lastSequenceStr = lastRecord.nonConformanceNumber.slice(
        prefix.length,
      );
      const lastSequence = Number.parseInt(lastSequenceStr, 10);
      if (!Number.isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    const sequenceStr = sequence.toString().padStart(3, '0');
    return `${prefix}${sequenceStr}`;
  },
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
