import type { Prisma } from '@prisma/client';
import type { QualityLossItem } from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import { DataScopeService } from '~/modules/data-scope/data-scope.service';

export const QualityLossDataScopeService = {
  async applyManualWhere(params: {
    baseWhere: Prisma.quality_lossesWhereInput;
    dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
    userContext: { userId: string; username?: string };
  }): Promise<Prisma.quality_lossesWhereInput> {
    return DataScopeService.buildQualityLossWhere(
      params.baseWhere,
      params.userContext,
      params.dataScope,
    );
  },

  async apply(
    items: QualityLossItem[],
    userContext?: { userId: string; username?: string },
  ) {
    if (!userContext?.userId) return items;

    const scope = await DataScopeService.getScopeForModule(
      userContext.userId,
      'quality-loss',
    );
    if (scope.scopeType === 'ALL') return items;

    const deptSource =
      scope.scopeType === 'DEPT'
        ? scope
        : await DataScopeService.getScopeForModule(
            userContext.userId,
            'supplier',
          );
    return items.filter((item) =>
      deptSource.deptIds.includes(String(item.responsibleDepartmentId || '')),
    );
  },

  async sortFilteredByScope(
    items: QualityLossItem[],
    sort: (items: QualityLossItem[]) => QualityLossItem[],
    userContext?: { userId: string; username?: string },
  ) {
    const scoped = await this.apply(items, userContext);
    return sort(scoped);
  },
};
