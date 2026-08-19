import type { Ref } from 'vue';

import { computed } from 'vue';

interface TeamStat {
  count: number;
  team: string;
  teamId: null | string;
}

interface SupplierStat {
  count: number;
  supplierId: null | string;
  team: string;
}

export function useDashboardRankStats(
  requestStats: Ref<{
    bySupplier: SupplierStat[];
    byTeam: TeamStat[];
  }>,
) {
  const sortedTeamStats = computed(() =>
    [...requestStats.value.byTeam].sort((a, b) => b.count - a.count),
  );
  const topTeamStats = computed(() => sortedTeamStats.value.slice(0, 12));
  const maxTeamCount = computed(() =>
    Math.max(1, ...topTeamStats.value.map((item) => item.count)),
  );

  const sortedSupplierStats = computed(() =>
    [...requestStats.value.bySupplier].sort((a, b) => b.count - a.count),
  );
  const topSupplierStats = computed(() =>
    sortedSupplierStats.value.slice(0, 12),
  );
  const maxSupplierCount = computed(() =>
    Math.max(1, ...topSupplierStats.value.map((item) => item.count)),
  );

  return {
    maxSupplierCount,
    maxTeamCount,
    topSupplierStats,
    topTeamStats,
  };
}
