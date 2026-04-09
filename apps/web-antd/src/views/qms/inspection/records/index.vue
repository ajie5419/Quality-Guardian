<script lang="ts" setup>
import type { QmsInspectionApi } from '#/api/qms/inspection';

import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Descriptions,
  Drawer,
  Modal,
  Segmented,
  Select,
  Tag,
} from 'ant-design-vue';

import ErrorBoundary from '#/components/ErrorBoundary.vue';

import InspectionForm from './components/InspectionForm.vue';
import InspectionGrid from './components/InspectionGrid.vue';
import { useInspectionRecords } from './composables/useInspectionRecords';
import { INSPECTION_TABS } from './config';

const {
  activeKey,
  currentYear,
  yearOptions,
  gridRef,
  formRef,
  modalVisible,
  currentRecord,
  isEdit,
  openModal,
  handleSubmit,
} = useInspectionRecords();
const route = useRoute();

const detailVisible = ref(false);
const detailRecord = ref<QmsInspectionApi.InspectionRecord>();
const routeKeyword = ref('');
const routeSourceInspectionId = ref('');

function openDetail(record: QmsInspectionApi.InspectionRecord) {
  detailRecord.value = record;
  detailVisible.value = true;
}

function getIssueStatusLabel(status: unknown) {
  const value = String(status || '')
    .trim()
    .toUpperCase();
  if (value === 'OPEN') return '待处理';
  if (value === 'IN_PROGRESS') return '处理中';
  if (value === 'RESOLVED') return '待验证';
  if (value === 'CLOSED') return '已关闭';
  return '无问题';
}

function getIssueStatusColor(status: unknown) {
  const value = String(status || '')
    .trim()
    .toUpperCase();
  if (value === 'OPEN') return 'default';
  if (value === 'IN_PROGRESS') return 'processing';
  if (value === 'RESOLVED') return 'warning';
  if (value === 'CLOSED') return 'success';
  return 'default';
}

function getArchiveStatusLabel(status: unknown) {
  const value = String(status || '')
    .trim()
    .toUpperCase();
  if (!value || value === 'NONE') return '无需归档';
  if (value === 'ARCHIVED') return '已归档';
  if (value === 'IN_PROGRESS') return '整理中';
  if (value === 'REJECTED') return '已退回';
  return '待整理';
}

function getArchiveStatusColor(status: unknown) {
  const value = String(status || '')
    .trim()
    .toUpperCase();
  if (!value || value === 'NONE') return 'default';
  if (value === 'ARCHIVED') return 'success';
  if (value === 'IN_PROGRESS') return 'processing';
  if (value === 'REJECTED') return 'error';
  return 'warning';
}

function getDetailValue(key: string) {
  const raw = detailRecord.value as unknown as
    | Record<string, unknown>
    | undefined;
  return raw?.[key];
}

function getDetailString(key: string, fallback = '-') {
  const value = getDetailValue(key);
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

function getDetailNumber(key: string, fallback = '-') {
  const value = getDetailValue(key);
  if (typeof value === 'number') return String(value);
  return fallback;
}

function isDetailFail() {
  return getDetailString('result', '').toUpperCase() === 'FAIL';
}

function getDetailType() {
  const category = getDetailString('category', '');
  if (category) return category.toLowerCase();
  return activeKey.value;
}

function isIncomingDetail() {
  return getDetailType() === 'incoming';
}

function isProcessDetail() {
  return getDetailType() === 'process';
}

function isShipmentDetail() {
  return getDetailType() === 'shipment';
}

function getBoolLabel(key: string) {
  const value = getDetailValue(key);
  return value ? '是' : '否';
}

function formatDetailDate(key: string, fallback = '-') {
  const value = getDetailString(key, '');
  if (!value) return fallback;
  return value.includes('T') ? value.slice(0, 10) : value;
}

function syncRouteFilters() {
  routeKeyword.value =
    typeof route.query.keyword === 'string' ? route.query.keyword : '';
  routeSourceInspectionId.value =
    typeof route.query.sourceInspectionId === 'string'
      ? route.query.sourceInspectionId
      : '';
}

onMounted(() => {
  syncRouteFilters();
});

watch(
  () => route.query,
  () => syncRouteFilters(),
  { deep: true },
);
</script>

<template>
  <Page>
    <ErrorBoundary>
      <div class="bg-white p-4">
        <div class="mb-4 flex justify-between">
          <Segmented v-model:value="activeKey" :options="INSPECTION_TABS" />
          <Select
            v-model:value="currentYear"
            :options="yearOptions"
            class="w-32"
          />
        </div>

        <div>
          <InspectionGrid
            ref="gridRef"
            :keyword="routeKeyword"
            :source-inspection-id="routeSourceInspectionId"
            :type="activeKey"
            :year="currentYear"
            @create="openModal()"
            @edit="openModal"
            @view="openDetail"
          />
        </div>
      </div>

      <Modal
        v-model:open="modalVisible"
        :title="isEdit ? '编辑记录' : '新建记录'"
        width="1000px"
        :destroy-on-close="true"
        @ok="handleSubmit"
      >
        <InspectionForm
          ref="formRef"
          :type="activeKey"
          :record="currentRecord"
        />
      </Modal>

      <Drawer
        v-model:open="detailVisible"
        title="检验记录详情"
        :width="880"
        placement="right"
      >
        <Descriptions v-if="detailRecord" bordered :column="2" size="small">
          <Descriptions.Item label="工单号">
            {{ getDetailString('workOrderNumber') }}
          </Descriptions.Item>
          <Descriptions.Item label="项目名称">
            {{ getDetailString('projectName') }}
          </Descriptions.Item>

          <template v-if="isIncomingDetail()">
            <Descriptions.Item label="进货类型">
              {{ getDetailString('incomingType') }}
            </Descriptions.Item>
            <Descriptions.Item label="单位">
              {{ getDetailString('supplierName') }}
            </Descriptions.Item>
            <Descriptions.Item label="物料名称">
              {{ getDetailString('materialName') }}
            </Descriptions.Item>
            <Descriptions.Item label="是否有资料">
              {{ getBoolLabel('hasDocuments') }}
            </Descriptions.Item>
          </template>

          <template v-if="isProcessDetail()">
            <Descriptions.Item label="工序">
              {{ getDetailString('processName') }}
            </Descriptions.Item>
            <Descriptions.Item label="一级部件">
              {{ getDetailString('level1Component') }}
            </Descriptions.Item>
            <Descriptions.Item label="部件名称">
              {{ getDetailString('level2Component') }}
            </Descriptions.Item>
            <Descriptions.Item label="班组">
              {{ getDetailString('team') }}
            </Descriptions.Item>
          </template>

          <template v-if="isShipmentDetail()">
            <Descriptions.Item label="部件名称">
              {{ getDetailString('materialName') }}
            </Descriptions.Item>
            <Descriptions.Item label="随车资料">
              {{ getDetailString('documents') }}
            </Descriptions.Item>
            <Descriptions.Item label="装箱单归档">
              {{ getBoolLabel('packingListArchived') }}
            </Descriptions.Item>
          </template>

          <Descriptions.Item label="数量">
            {{ getDetailNumber('quantity') }}
          </Descriptions.Item>
          <Descriptions.Item label="检验员">
            {{ getDetailString('inspector') }}
          </Descriptions.Item>
          <Descriptions.Item label="检验日期">
            {{ formatDetailDate('inspectionDate') }}
          </Descriptions.Item>
          <Descriptions.Item label="不合格数量">
            {{ getDetailNumber('unqualifiedQuantity', '0') }}
          </Descriptions.Item>
          <Descriptions.Item label="检验结论">
            <Tag :color="isDetailFail() ? 'red' : 'green'">
              {{ isDetailFail() ? '不合格' : '合格' }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="问题状态">
            <Tag
              :color="getIssueStatusColor(getDetailString('issueStatus', ''))"
            >
              {{ getIssueStatusLabel(getDetailString('issueStatus', '')) }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="资料归档状态">
            <Tag
              :color="
                getArchiveStatusColor(getDetailString('archiveTaskStatus', ''))
              "
            >
              {{
                getArchiveStatusLabel(getDetailString('archiveTaskStatus', ''))
              }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="备注" :span="2">
            {{ getDetailString('remarks') }}
          </Descriptions.Item>
        </Descriptions>
      </Drawer>
    </ErrorBoundary>
  </Page>
</template>
