<script lang="ts" setup>
import type { QmsInspectionApi } from '#/api/qms/inspection';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Select } from 'ant-design-vue';

import { getItpProjectList } from '#/api/qms/planning';
import { getSupplierList } from '#/api/qms/supplier';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import { useAvailableYears } from '#/hooks/useAvailableYears';

import InspectionGrid from './components/InspectionGrid.vue';
import InspectionRecordModal from './components/InspectionRecordModal.vue';
import { getSegmentedOptions } from './data';

const route = useRoute();
const { t } = useI18n();
const modalRef = ref();

// 引用 Grids，用于刷新
const incomingGridRef = ref();
const processGridRef = ref();
const shipmentGridRef = ref();

// ================= 1. 响应式状态声明 =================
const { years: dynamicYears } = useAvailableYears();
const activeKey = ref('incoming');
const currentYear = ref<number>(new Date().getFullYear());

// ================= 2. 基础数据 =================
const workOrderList = ref<any[]>([]);
const supplierList = ref<any[]>([]);
const outsourcingList = ref<any[]>([]);
const deptList = ref<any[]>([]);
const itpProjectList = ref<any[]>([]);

// ================= 3. 业务配置 =================
const segmentedOptions = computed(() => getSegmentedOptions(t));

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

// ================= 4. 初始化与弹窗处理 =================

onMounted(async () => {
  try {
    const [woRes, supplierRes, deptRes, itpRes] = await Promise.all([
      getWorkOrderList(),
      getSupplierList({ pageSize: 2000 }),
      getDeptList(),
      getItpProjectList(),
    ]);

    workOrderList.value = woRes.items || [];
    const items = supplierRes.items || [];

    supplierList.value = items.filter((s) => {
      const cat = (s.category || '').trim().toLowerCase();
      return cat === 'supplier' || cat === '';
    });

    outsourcingList.value = items.filter((s) => {
      const cat = (s.category || '').trim().toLowerCase();
      return cat === 'outsourcing';
    });

    deptList.value = deptRes;
    itpProjectList.value = itpRes;

    // Handle Task Dispatch Redirection
    const { taskId, itpProjectId } = route.query;
    if (taskId && itpProjectId) {
      activeKey.value = 'process'; // Switch to process tab
      // Wait for modal component to be ready or open directly
      openModal('create', { taskId: String(taskId), itpProjectId: String(itpProjectId) });
    }
  } catch (error) {
    console.error('Failed to load initial data:', error);
  }
});

function openModal(
  mode: 'create' | 'edit',
  row?: Partial<QmsInspectionApi.DetailedInspectionRecord> & { taskId?: string; itpProjectId?: string },
) {
  modalRef.value?.open(mode, row);
}

function handleSuccess() {
  // Refresh the active grid
  if (activeKey.value === 'incoming') incomingGridRef.value?.reload();
  else if (activeKey.value === 'process') processGridRef.value?.reload();
  else if (activeKey.value === 'shipment') shipmentGridRef.value?.reload();
}
</script>

<template>
  <Page>
    <div class="flex h-full flex-col overflow-hidden rounded-lg bg-white p-4">
      <div class="mb-4 flex flex-shrink-0 items-center justify-between">
        <Segmented v-model:value="activeKey" :options="segmentedOptions" />
        <div class="flex items-center gap-2">
          <span class="text-gray-500"
            >{{ t('qms.inspection.records.statsYear') }}:</span
          >
          <Select
            v-model:value="currentYear"
            :options="yearOptions"
            class="w-[120px]"
          />
        </div>
      </div>

      <div class="flex-1 overflow-hidden">
        <!-- 进货检验 Tab -->
        <div v-show="activeKey === 'incoming'" class="h-full">
          <InspectionGrid
            ref="incomingGridRef"
            type="incoming"
            :current-year="currentYear"
            @create="openModal('create')"
            @edit="(row) => openModal('edit', row)"
          />
        </div>

        <!-- 过程检验 Tab -->
        <div v-show="activeKey === 'process'" class="h-full">
          <InspectionGrid
            ref="processGridRef"
            type="process"
            :current-year="currentYear"
            @create="openModal('create')"
            @edit="(row) => openModal('edit', row)"
          />
        </div>

        <!-- 发货检验 Tab -->
        <div v-show="activeKey === 'shipment'" class="h-full">
          <InspectionGrid
            ref="shipmentGridRef"
            type="shipment"
            :current-year="currentYear"
            @create="openModal('create')"
            @edit="(row) => openModal('edit', row)"
          />
        </div>
      </div>
    </div>

    <!-- 录入弹窗 -->
    <InspectionRecordModal
      ref="modalRef"
      :work-order-list="workOrderList"
      :supplier-list="supplierList"
      :outsourcing-list="outsourcingList"
      :dept-list="deptList"
      :itp-project-list="itpProjectList"
      :active-key="activeKey"
      @success="handleSuccess"
    />
  </Page>
</template>
