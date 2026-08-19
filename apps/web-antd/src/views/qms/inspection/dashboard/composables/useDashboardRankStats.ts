import type { Ref } from 'vue';

import { computed } from 'vue';

interface DepartmentStat {
  count: number;
  department: string;
  responsibleDepartmentId: null | string;
}

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
    byDepartment: DepartmentStat[];
    bySupplier: SupplierStat[];
    byTeam: TeamStat[];
  }>,
) {
  const sortedDepartmentStats = computed(() =>
    [...requestStats.value.byDepartment].sort((a, b) => b.count - a.count),
  );
  const topDepartmentStats = computed(() =>
    sortedDepartmentStats.value.slice(0, 12),
  );
  const maxDepartmentCount = computed(() =>
    Math.max(1, ...topDepartmentStats.value.map((item) => item.count)),
  );

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
    maxDepartmentCount,
    maxSupplierCount,
    maxTeamCount,
    topDepartmentStats,
    topSupplierStats,
    topTeamStats,
  };
}
