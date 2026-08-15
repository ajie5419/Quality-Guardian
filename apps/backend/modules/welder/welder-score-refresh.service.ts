import type { Prisma } from '@prisma/client';
import type { MetricRefreshClient } from '~/modules/metric-refresh';

import {
  clampWelderScore,
  resolveWelderIdByResponsibleText,
  resolveWelderSeverityDeduction,
} from '@qgs/shared';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

export const ALL_WELDERS_SENTINEL = '__ALL__';

const WELDER_SCORE_MAX = 12;

export interface WelderScoreSyncSummary {
  deductionIssueCount: number;
  matchedIssueCount: number;
  updatedCount: number;
}

interface WelderCandidate {
  id: string;
  name: string;
  score: null | number;
  welderCode: null | string;
}

interface WelderScoreStat {
  responsibleWelder: null | string;
  responsibleWelderId: null | string;
  severity: string;
  _count: { id: number };
}

const EMPTY_SUMMARY: WelderScoreSyncSummary = {
  deductionIssueCount: 0,
  matchedIssueCount: 0,
  updatedCount: 0,
};

function uniqueIds(values: Array<null | string | undefined>): string[] {
  return [
    ...new Set(
      values.map((value) => String(value || '').trim()).filter(Boolean),
    ),
  ];
}

function issueCount(stats: WelderScoreStat[]) {
  return stats.reduce((sum, stat) => sum + stat._count.id, 0);
}

async function applyDeductions(
  welders: WelderCandidate[],
  stats: WelderScoreStat[],
): Promise<WelderScoreSyncSummary> {
  const welderIdSet = new Set(welders.map((welder) => welder.id));
  const deductionByWelder = new Map<string, number>();
  let matchedIssueCount = 0;
  for (const stat of stats) {
    // Canonical id wins; legacy rows without an id fall back to unique text
    // matching so ambiguous names are never credited.
    const welderId =
      stat.responsibleWelderId && welderIdSet.has(stat.responsibleWelderId)
        ? stat.responsibleWelderId
        : resolveWelderIdByResponsibleText({
            responsibleWelder: stat.responsibleWelder,
            welderCandidates: welders,
          });
    if (!welderId) continue;
    const count = stat._count.id;
    matchedIssueCount += count;
    const current = deductionByWelder.get(welderId) || 0;
    deductionByWelder.set(
      welderId,
      current + resolveWelderSeverityDeduction(stat.severity) * count,
    );
  }

  const updateOps: Array<ReturnType<typeof prisma.welders.update>> = [];
  for (const welder of welders) {
    const deduction = deductionByWelder.get(welder.id) || 0;
    const nextScore = clampWelderScore(WELDER_SCORE_MAX - deduction);
    const currentScore = Number.isFinite(welder.score)
      ? Number(welder.score)
      : WELDER_SCORE_MAX;
    if (currentScore === nextScore) continue;
    updateOps.push(
      prisma.welders.update({
        where: { id: welder.id },
        data: { score: nextScore, updatedAt: new Date() },
      }),
    );
  }

  if (updateOps.length > 0) await prisma.$transaction(updateOps);
  return {
    deductionIssueCount: issueCount(stats),
    matchedIssueCount,
    updatedCount: updateOps.length,
  };
}

export const WelderScoreRefreshService = {
  async refreshByWelderIds(
    welderIds: Array<null | string | undefined>,
  ): Promise<WelderScoreSyncSummary> {
    const ids = uniqueIds(welderIds);
    if (ids.length === 0) return { ...EMPTY_SUMMARY };

    const { InspectionService } = await import('~/modules/inspection');
    const welders = await prisma.welders.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, name: true, score: true, welderCode: true },
    });
    if (welders.length === 0) return { ...EMPTY_SUMMARY };

    const names = [
      ...new Set(
        welders
          .flatMap((welder) => [welder.name, welder.welderCode])
          .filter(Boolean),
      ),
    ];
    const stats = await InspectionService.getWelderScoreStats({
      welderIds: ids,
      welderNames: names,
    });
    return applyDeductions(welders, stats);
  },

  async refreshAll(): Promise<WelderScoreSyncSummary> {
    const { InspectionService } = await import('~/modules/inspection');
    const [welders, stats] = await Promise.all([
      prisma.welders.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true, score: true, welderCode: true },
      }),
      InspectionService.getWelderScoreStats(),
    ]);

    if (welders.length === 0) {
      return {
        deductionIssueCount: issueCount(stats),
        matchedIssueCount: 0,
        updatedCount: 0,
      };
    }
    return applyDeductions(welders, stats);
  },

  /**
   * Enqueue a score refresh for the welders referenced by responsible-welder
   * text. Unresolvable or empty references fall back to a full refresh so
   * scoring can never silently stall on an ambiguous name. Must be called
   * inside the source transaction so a failed enqueue rolls the write back.
   */
  async enqueueForResponsibleText(
    client: MetricRefreshClient,
    texts: Array<null | string | undefined>,
    reason: string,
  ) {
    const uniqueTexts = [
      ...new Set(
        texts.map((text) => String(text || '').trim()).filter(Boolean),
      ),
    ];
    if (uniqueTexts.length === 0) return { enqueued: 0 };

    const welders = await prisma.welders.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, welderCode: true },
    });
    const welderIds = new Set<string>();
    let unresolved = false;
    for (const text of uniqueTexts) {
      const welderId = resolveWelderIdByResponsibleText({
        responsibleWelder: text,
        welderCandidates: welders,
      });
      if (welderId) {
        welderIds.add(welderId);
      } else {
        unresolved = true;
      }
    }
    const entityIds = [...welderIds];
    if (unresolved || entityIds.length === 0) {
      entityIds.push(ALL_WELDERS_SENTINEL);
    }
    return MetricRefreshQueue.enqueueWelderScores(client, entityIds, reason);
  },

  /**
   * Resolve a single responsible-welder text to its canonical welder id using
   * the same unique-match rules as score refresh. Returns undefined when the
   * text is empty or ambiguous so callers keep the legacy text snapshot and
   * let governance flag the unresolved reference.
   */
  async resolveResponsibleWelderId(
    tx: Prisma.TransactionClient,
    text: unknown,
  ): Promise<null | string> {
    const normalized = String(text || '').trim();
    if (!normalized) return null;
    const welders = await tx.welders.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, welderCode: true },
    });
    return (
      resolveWelderIdByResponsibleText({
        responsibleWelder: normalized,
        welderCandidates: welders,
      }) ?? null
    );
  },

  /**
   * Resolve the responsible welder for a write. An explicit canonical id is
   * validated against the welder table (fail-closed on missing/soft-deleted);
   * otherwise the legacy text is resolved by unique match.
   */
  async resolveResponsibleWelderIdForWrite(
    tx: Prisma.TransactionClient,
    explicitId: unknown,
    text: unknown,
  ): Promise<null | string> {
    const id = String(explicitId || '').trim();
    if (id) {
      const welder = await tx.welders.findUnique({
        where: { id },
        select: { id: true, isDeleted: true },
      });
      if (!welder || welder.isDeleted) {
        throw new BusinessError('VALIDATION', '责任焊工无效', 400);
      }
      return id;
    }
    return this.resolveResponsibleWelderId(tx, text);
  },

  async enqueueFullRefresh(client: MetricRefreshClient, reason: string) {
    return MetricRefreshQueue.enqueueWelderScores(
      client,
      [ALL_WELDERS_SENTINEL],
      reason,
    );
  },
};
