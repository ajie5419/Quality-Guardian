<script lang="ts" setup>
import { Button, Card } from 'ant-design-vue';

interface TeamReinspectionStat {
  inspectedCount: number;
  reinspectionCount: number;
  reinspectionRate: number;
  submittedCount: number;
  team: string;
  teamId: null | string;
}

interface TeamStat {
  count: number;
  team: string;
  teamId: null | string;
}

interface SupplierReinspectionStat {
  inspectedCount: number;
  reinspectionCount: number;
  reinspectionRate: number;
  submittedCount: number;
  supplierId: null | string;
  team: string;
}

interface SupplierStat {
  count: number;
  supplierId: null | string;
  team: string;
}

defineProps<{
  maxSupplierCount: number;
  maxTeamCount: number;
  reinspectionStatsTotal: number;
  supplierReinspectionStatsTotal: number;
  supplierStatsTotal: number;
  teamStatsTotal: number;
  topReinspectionStats: TeamReinspectionStat[];
  topSupplierReinspectionStats: SupplierReinspectionStat[];
  topSupplierStats: SupplierStat[];
  topTeamStats: TeamStat[];
}>();

const emit = defineEmits<{
  openDetail: [
    type: 'reinspection' | 'supplier' | 'supplierReinspection' | 'team',
  ];
}>();
</script>

<template>
  <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
    <!-- Team rank card -->
    <Card :body-style="{ padding: '16px' }">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">班组报检排行</div>
          <div class="mt-1 text-xs text-gray-500">
            共 {{ teamStatsTotal }} 个班组
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">前 12 项</span>
          <Button
            v-if="teamStatsTotal > topTeamStats.length"
            size="small"
            type="link"
            @click="emit('openDetail', 'team')"
          >
            查看全部
          </Button>
        </div>
      </div>
      <div v-if="topTeamStats.length > 0" class="space-y-3">
        <div
          v-for="item in topTeamStats"
          :key="item.teamId || 'unresolved-team'"
          class="space-y-1"
        >
          <div class="flex items-start justify-between gap-3 text-sm">
            <span class="break-words text-gray-800">
              {{ item.team || '未填写' }}
            </span>
            <span class="shrink-0 font-semibold text-gray-900">
              {{ item.count }}
            </span>
          </div>
          <div class="h-1.5 overflow-hidden rounded bg-gray-100">
            <div
              class="h-full rounded bg-blue-500"
              :style="{ width: `${(item.count / maxTeamCount) * 100}%` }"
            ></div>
          </div>
        </div>
      </div>
      <div v-else class="py-10 text-center text-sm text-gray-400">
        当前范围暂无班组报检
      </div>
    </Card>

    <!-- Supplier rank card -->
    <Card :body-style="{ padding: '16px' }">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">供应商报检排行</div>
          <div class="mt-1 text-xs text-gray-500">
            共 {{ supplierStatsTotal }} 个供应商
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">前 12 项</span>
          <Button
            v-if="supplierStatsTotal > topSupplierStats.length"
            size="small"
            type="link"
            @click="emit('openDetail', 'supplier')"
          >
            查看全部
          </Button>
        </div>
      </div>
      <div v-if="topSupplierStats.length > 0" class="space-y-3">
        <div
          v-for="item in topSupplierStats"
          :key="item.supplierId || 'unresolved-supplier'"
          class="space-y-1"
        >
          <div class="flex items-start justify-between gap-3 text-sm">
            <span class="break-words text-gray-800">
              {{ item.team || '未填写' }}
            </span>
            <span class="shrink-0 font-semibold text-gray-900">
              {{ item.count }}
            </span>
          </div>
          <div class="h-1.5 overflow-hidden rounded bg-gray-100">
            <div
              class="h-full rounded bg-cyan-500"
              :style="{
                width: `${(item.count / maxSupplierCount) * 100}%`,
              }"
            ></div>
          </div>
        </div>
      </div>
      <div v-else class="py-10 text-center text-sm text-gray-400">
        当前范围暂无供应商报检
      </div>
    </Card>

    <!-- Team reinspection rate card -->
    <Card :body-style="{ padding: '16px' }">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">班组复检率</div>
          <div class="mt-1 text-xs text-gray-500">
            只按已完成检验或已产生不合格项的任务计算
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">
            {{ reinspectionStatsTotal }} 个班组
          </span>
          <Button
            v-if="reinspectionStatsTotal > topReinspectionStats.length"
            size="small"
            type="link"
            @click="emit('openDetail', 'reinspection')"
          >
            查看全部
          </Button>
        </div>
      </div>
      <div v-if="topReinspectionStats.length > 0" class="space-y-2">
        <div
          v-for="(item, index) in topReinspectionStats"
          :key="item.teamId || 'unresolved-team-reinspection'"
          class="rounded bg-gray-50 px-3 py-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm text-gray-800">
                <span class="mr-2 text-xs text-gray-400">{{ index + 1 }}</span>
                <span class="break-words">{{ item.team || '未填写' }}</span>
              </div>
              <div class="mt-1 text-xs text-gray-500">
                复检 {{ item.reinspectionCount }} / 已检
                {{ item.inspectedCount }}
                <span class="text-gray-400">
                  · 报检 {{ item.submittedCount }}
                </span>
              </div>
            </div>
            <span class="shrink-0 text-base font-semibold text-orange-600">
              {{ item.reinspectionRate }}%
            </span>
          </div>
        </div>
      </div>
      <div v-else class="py-10 text-center text-sm text-gray-400">
        当前范围暂无复检率数据
      </div>
    </Card>

    <!-- Supplier reinspection rate card -->
    <Card :body-style="{ padding: '16px' }">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">供应商复检率</div>
          <div class="mt-1 text-xs text-gray-500">
            只按已完成检验或已产生不合格项的任务计算
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">
            {{ supplierReinspectionStatsTotal }} 个供应商
          </span>
          <Button
            v-if="
              supplierReinspectionStatsTotal >
              topSupplierReinspectionStats.length
            "
            size="small"
            type="link"
            @click="emit('openDetail', 'supplierReinspection')"
          >
            查看全部
          </Button>
        </div>
      </div>
      <div v-if="topSupplierReinspectionStats.length > 0" class="space-y-2">
        <div
          v-for="(item, index) in topSupplierReinspectionStats"
          :key="item.supplierId || 'unresolved-supplier-reinspection'"
          class="rounded bg-gray-50 px-3 py-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm text-gray-800">
                <span class="mr-2 text-xs text-gray-400">{{ index + 1 }}</span>
                <span class="break-words">{{ item.team || '未填写' }}</span>
              </div>
              <div class="mt-1 text-xs text-gray-500">
                复检 {{ item.reinspectionCount }} / 已检
                {{ item.inspectedCount }}
                <span class="text-gray-400">
                  · 报检 {{ item.submittedCount }}
                </span>
              </div>
            </div>
            <span class="shrink-0 text-base font-semibold text-orange-600">
              {{ item.reinspectionRate }}%
            </span>
          </div>
        </div>
      </div>
      <div v-else class="py-10 text-center text-sm text-gray-400">
        当前范围暂无供应商复检率数据
      </div>
    </Card>
  </div>
</template>
