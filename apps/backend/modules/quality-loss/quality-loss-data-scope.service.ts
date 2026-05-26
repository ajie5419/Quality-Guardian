import type { QualityLossItem } from '@qgs/shared';

import { DataScopeService } from '~/modules/data-scope/data-scope.service';

export const QualityLossDataScopeService = {
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
    const deptCandidates = await DataScopeService.getDeptCandidates(
      deptSource.deptIds,
    );
    return items.filter((item) =>
      deptCandidates.includes(String(item.responsibleDepartment || '')),
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
