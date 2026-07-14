<script lang="ts" setup>
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { QmsSupplierApi } from '#/api/qms/supplier';

import { reactive, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Card,
  Col,
  Descriptions,
  Row,
  Statistic,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getAfterSalesList } from '#/api/qms/after-sales';
import {
  getSupplierHistoryProjects,
  getSupplierInspectionHistory,
  getSupplierQualityIssues,
} from '#/api/qms/supplier';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useMobileViewport } from '#/hooks/useMobileViewport';

import { getOutsourcingModeLabel } from '../data';
import {
  formatIncomingQualifiedRate,
  hasIncomingQualifiedRate,
} from './supplier-detail';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { isMobile } = useMobileViewport();

const selectedSupplier = ref<null | QmsSupplierApi.SupplierItem>(null);
const isDetailLoading = ref(false);
const supplierInspections = ref<QmsSupplierApi.SupplierInspectionHistory[]>([]);
const supplierInspectionPagination = reactive({
  current: 1,
  pageSize: 5,
  showSizeChanger: true,
  total: 0,
});
const isInspectionHistoryLoading = ref(false);
const supplierAfterSales = ref<QmsAfterSalesApi.AfterSalesItem[]>([]);
const supplierEngineeringIssues = ref<QmsInspectionApi.InspectionIssue[]>([]);
const supplierEngineeringPagination = reactive({
  current: 1,
  pageSize: 5,
  showSizeChanger: true,
  total: 0,
});
const isEngineeringHistoryLoading = ref(false);
const supplierHistoryProjects = ref<QmsSupplierApi.SupplierHistoryProject[]>(
  [],
);
let detailRequestSequence = 0;
let engineeringPageRequestSequence = 0;
let inspectionPageRequestSequence = 0;

const [Drawer, drawerApi] = useVbenDrawer({
  title: t('common.detail'),
  class: isMobile.value ? 'w-[100vw]' : 'w-[950px]',
});

function clearDetailData() {
  supplierInspections.value = [];
  supplierInspectionPagination.current = 1;
  supplierInspectionPagination.total = 0;
  isInspectionHistoryLoading.value = false;
  supplierAfterSales.value = [];
  supplierEngineeringIssues.value = [];
  supplierEngineeringPagination.current = 1;
  supplierEngineeringPagination.total = 0;
  isEngineeringHistoryLoading.value = false;
  supplierHistoryProjects.value = [];
}

function reportRejectedDetailRequest(
  result: PromiseSettledResult<unknown>,
  context: string,
) {
  if (result.status === 'rejected') {
    handleApiError(result.reason, context);
  }
}

async function loadDetail(row: QmsSupplierApi.SupplierItem, titlePrefix = '') {
  const requestSequence = ++detailRequestSequence;
  const engineeringRequestSequence = ++engineeringPageRequestSequence;
  const inspectionRequestSequence = ++inspectionPageRequestSequence;
  selectedSupplier.value = row;
  clearDetailData();
  const prefix = titlePrefix || t('qms.supplier.title');
  // 使用 qms.portrait 确保在 local qms.json 根部能找到
  drawerApi.setState({
    title: `${prefix}${t('qms.portrait')}: ${row.name}`,
  });
  isDetailLoading.value = true;

  try {
    const [inspections, afterSales, engineering, historyProjects] =
      await Promise.allSettled([
        getSupplierInspectionHistory(row.id, {
          page: supplierInspectionPagination.current,
          pageSize: supplierInspectionPagination.pageSize,
        }),
        getAfterSalesList({ supplierBrandId: row.id }),
        getSupplierQualityIssues(row.id, {
          page: supplierEngineeringPagination.current,
          pageSize: supplierEngineeringPagination.pageSize,
        }),
        getSupplierHistoryProjects(row.id),
      ]);

    if (
      requestSequence !== detailRequestSequence ||
      selectedSupplier.value?.id !== row.id
    ) {
      return;
    }

    if (
      inspections.status === 'fulfilled' &&
      inspectionRequestSequence === inspectionPageRequestSequence
    ) {
      supplierInspections.value = inspections.value.items || [];
      supplierInspectionPagination.total = inspections.value.total || 0;
    }
    if (afterSales.status === 'fulfilled') {
      supplierAfterSales.value = afterSales.value;
    }
    if (
      engineering.status === 'fulfilled' &&
      engineeringRequestSequence === engineeringPageRequestSequence
    ) {
      supplierEngineeringIssues.value = engineering.value.items || [];
      supplierEngineeringPagination.total = engineering.value.total || 0;
    }
    if (historyProjects.status === 'fulfilled') {
      supplierHistoryProjects.value = historyProjects.value.items || [];
    }

    reportRejectedDetailRequest(
      inspections,
      'Load Supplier Inspection History',
    );
    reportRejectedDetailRequest(afterSales, 'Load Supplier After Sales');
    reportRejectedDetailRequest(engineering, 'Load Supplier Engineering');
    reportRejectedDetailRequest(
      historyProjects,
      'Load Supplier History Projects',
    );
  } catch (error) {
    if (requestSequence === detailRequestSequence) {
      handleApiError(error, 'Load Supplier Detail');
    }
  } finally {
    if (requestSequence === detailRequestSequence) {
      isDetailLoading.value = false;
    }
  }
}

interface InspectionPaginationChange {
  current?: number;
  pageSize?: number;
}

async function handleInspectionPageChange(
  pagination: InspectionPaginationChange,
) {
  if (!selectedSupplier.value) return;

  const supplierId = selectedSupplier.value.id;
  const requestSequence = ++inspectionPageRequestSequence;
  const page = pagination.current || 1;
  const pageSize = pagination.pageSize || 5;
  isInspectionHistoryLoading.value = true;
  try {
    const result = await getSupplierInspectionHistory(supplierId, {
      page,
      pageSize,
    });
    if (
      requestSequence !== inspectionPageRequestSequence ||
      selectedSupplier.value?.id !== supplierId
    ) {
      return;
    }
    supplierInspections.value = result.items || [];
    supplierInspectionPagination.current = page;
    supplierInspectionPagination.pageSize = pageSize;
    supplierInspectionPagination.total = result.total || 0;
  } catch (error) {
    if (requestSequence === inspectionPageRequestSequence) {
      handleApiError(error, 'Load Supplier Inspection History');
    }
  } finally {
    if (requestSequence === inspectionPageRequestSequence) {
      isInspectionHistoryLoading.value = false;
    }
  }
}

async function handleEngineeringPageChange(
  pagination: InspectionPaginationChange,
) {
  if (!selectedSupplier.value) return;

  const supplierId = selectedSupplier.value.id;
  const requestSequence = ++engineeringPageRequestSequence;
  const page = pagination.current || 1;
  const pageSize = pagination.pageSize || 5;
  isEngineeringHistoryLoading.value = true;
  try {
    const result = await getSupplierQualityIssues(supplierId, {
      page,
      pageSize,
    });
    if (
      requestSequence !== engineeringPageRequestSequence ||
      selectedSupplier.value?.id !== supplierId
    ) {
      return;
    }
    supplierEngineeringIssues.value = result.items || [];
    supplierEngineeringPagination.current = page;
    supplierEngineeringPagination.pageSize = pageSize;
    supplierEngineeringPagination.total = result.total || 0;
  } catch (error) {
    if (requestSequence === engineeringPageRequestSequence) {
      handleApiError(error, 'Load Supplier Engineering');
    }
  } finally {
    if (requestSequence === engineeringPageRequestSequence) {
      isEngineeringHistoryLoading.value = false;
    }
  }
}

interface AdmissionDocument {
  name: string;
  url: string;
}

function formatDateValue(value?: null | string) {
  return value ? value.split('T')[0] : '-';
}

function parseAdmissionDocuments(value: unknown): AdmissionDocument[] {
  if (!value) return [];
  const source = Array.isArray(value)
    ? value
    : (() => {
        try {
          const parsed = JSON.parse(String(value));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const url = String(record.url || '').trim();
      const name = String(record.name || record.originalName || url).trim();
      return url && name ? { name, url } : null;
    })
    .filter(Boolean) as AdmissionDocument[];
}

async function open(row: QmsSupplierApi.SupplierItem, titlePrefix = '') {
  const loading = loadDetail(row, titlePrefix);
  drawerApi.open();
  await loading;
}

defineExpose({
  open,
});
</script>

<template>
  <Drawer>
    <div v-if="selectedSupplier" class="space-y-6">
      <Row :gutter="12">
        <Col :span="6">
          <Card
            size="small"
            :title="t('qms.common.overallScore')"
            class="bg-gray-50"
          >
            <div class="py-2 text-center">
              <div
                class="text-3xl font-bold"
                :class="
                  (selectedSupplier.qualityScore ?? 0) >= 80
                    ? 'text-green-500'
                    : 'text-red-500'
                "
              >
                {{ selectedSupplier.qualityScore ?? '-' }}
              </div>
              <div class="mt-1 text-[10px] text-gray-400">
                {{ t('qms.common.scoreDesc') }}
              </div>
            </div>
          </Card>
        </Col>
        <Col :span="18">
          <Card
            size="small"
            :title="t('qms.common.riskOverview')"
            class="bg-gray-50"
          >
            <Row :gutter="8">
              <Col :span="4">
                <Statistic
                  :title="t('qms.common.batchCount')"
                  :value="selectedSupplier.incomingBatchCount ?? 0"
                  :value-style="{ fontSize: '16px' }"
                />
              </Col>
              <Col :span="5">
                <Statistic
                  :title="t('qms.common.totalQuantity')"
                  :value="selectedSupplier.incomingTotalQuantity ?? 0"
                  :value-style="{ fontSize: '16px' }"
                />
              </Col>
              <Col :span="5">
                <Statistic
                  :title="t('qms.common.passRate')"
                  :value="
                    formatIncomingQualifiedRate(
                      selectedSupplier.incomingBatchCount,
                      selectedSupplier.incomingQualifiedRate,
                    )
                  "
                  :suffix="
                    hasIncomingQualifiedRate(
                      selectedSupplier.incomingBatchCount,
                      selectedSupplier.incomingQualifiedRate,
                    )
                      ? '%'
                      : undefined
                  "
                  :value-style="{ color: '#3f8600', fontSize: '16px' }"
                />
              </Col>
              <Col :span="5">
                <Statistic
                  :title="t('qms.common.engLoss')"
                  :value="selectedSupplier.totalEngineeringLoss ?? 0"
                  prefix="¥"
                  :value-style="{ color: '#fa8c16', fontSize: '16px' }"
                />
              </Col>
              <Col :span="5">
                <Statistic
                  :title="t('qms.common.afterSalesLoss')"
                  :value="selectedSupplier.totalAfterSalesLoss ?? 0"
                  prefix="¥"
                  :value-style="{ color: '#cf1322', fontSize: '16px' }"
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="评分构成" class="bg-gray-50">
        <Row :gutter="12">
          <Col :span="6">
            <Statistic
              title="来料质量"
              :value="selectedSupplier.incomingScore ?? 0"
              suffix="分"
              :value-style="{ color: '#1677ff', fontSize: '16px' }"
            />
          </Col>
          <Col :span="6">
            <Statistic
              title="工程质量"
              :value="selectedSupplier.engineeringScore ?? 0"
              suffix="分"
              :value-style="{ color: '#fa8c16', fontSize: '16px' }"
            />
          </Col>
          <Col :span="6">
            <Statistic
              title="售后质量"
              :value="selectedSupplier.afterSalesScore ?? 0"
              suffix="分"
              :value-style="{ color: '#cf1322', fontSize: '16px' }"
            />
          </Col>
          <Col :span="6">
            <Statistic
              title="稳定性"
              :value="selectedSupplier.stabilityScore ?? 0"
              suffix="分"
              :value-style="{ color: '#3f8600', fontSize: '16px' }"
            />
          </Col>
        </Row>
      </Card>

      <Tabs default-active-key="1">
        <TabPane key="1" :tab="t('qms.common.tabs.basic')">
          <Descriptions bordered :column="2" size="small">
            <Descriptions.Item :label="t('qms.supplier.name')">
              {{ selectedSupplier.name }}
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.brand')">
              {{ selectedSupplier.brand }}
            </Descriptions.Item>
            <Descriptions.Item
              v-if="selectedSupplier.category === 'Outsourcing'"
              :label="t('qms.outsourcing.managementType')"
            >
              <Tag color="green">
                {{ getOutsourcingModeLabel(selectedSupplier.outsourcingMode) }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.mainProduct')">
              {{ selectedSupplier.productName }}
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.origin')">
              {{ selectedSupplier.origin }}
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.buyer')">
              {{ selectedSupplier.buyer }}
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.recognizedAt')">
              {{ formatDateValue(selectedSupplier.recognizedAt) }}
            </Descriptions.Item>
            <Descriptions.Item
              v-if="selectedSupplier.category === 'Supplier'"
              :label="t('qms.supplier.manufacturerNature')"
            >
              {{ selectedSupplier.manufacturerNature || '-' }}
            </Descriptions.Item>
            <Descriptions.Item
              :label="t('qms.supplier.admissionDocuments')"
              :span="2"
            >
              <template
                v-if="
                  parseAdmissionDocuments(selectedSupplier.admissionDocuments)
                    .length > 0
                "
              >
                <a
                  v-for="file in parseAdmissionDocuments(
                    selectedSupplier.admissionDocuments,
                  )"
                  :key="file.url"
                  :href="file.url"
                  class="mr-3"
                  target="_blank"
                >
                  {{ file.name }}
                </a>
              </template>
              <span v-else>-</span>
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.qualityLevel')">
              <Tag color="purple">
                {{ selectedSupplier.level ?? '-' }} {{ t('common.level') }}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </TabPane>
        <TabPane key="2" :tab="t('qms.common.tabs.engineering')">
          <div class="min-h-[300px] p-2">
            <Table
              :data-source="supplierEngineeringIssues"
              size="small"
              :pagination="supplierEngineeringPagination"
              row-key="id"
              :loading="isDetailLoading || isEngineeringHistoryLoading"
              @change="handleEngineeringPageChange"
            >
              <Table.Column
                :title="t('common.date')"
                data-index="reportDate"
                width="110"
              />
              <Table.Column
                :title="t('qms.workOrder.workOrderNumber')"
                data-index="workOrderNumber"
                width="140"
              />
              <Table.Column
                :title="t('qms.inspection.issues.partName')"
                data-index="partName"
                width="150"
              />
              <Table.Column
                :title="t('qms.inspection.records.form.quantity')"
                data-index="quantity"
                width="80"
              />
              <Table.Column
                :title="t('qms.inspection.issues.description')"
                data-index="description"
                ellipsis
              />
              <Table.Column
                :title="t('qms.inspection.issues.lossAmount')"
                data-index="lossAmount"
                width="100"
              >
                <template #default="{ text }">
                  <span class="font-bold text-orange-600"
                    >¥{{ text ?? 0 }}</span
                  >
                </template>
              </Table.Column>
            </Table>
          </div>
        </TabPane>
        <TabPane key="3" :tab="t('qms.common.tabs.afterSales')">
          <div class="min-h-[300px] p-2">
            <Table
              :data-source="supplierAfterSales"
              size="small"
              :pagination="{ pageSize: 5 }"
              row-key="id"
              :loading="isDetailLoading"
            >
              <Table.Column
                :title="t('common.date')"
                data-index="issueDate"
                width="110"
              />
              <Table.Column
                :title="t('qms.workOrder.workOrderNumber')"
                data-index="workOrderNumber"
                width="140"
              />
              <Table.Column
                :title="t('qms.inspection.issues.partName')"
                data-index="partName"
                width="150"
              />
              <Table.Column
                :title="t('qms.inspection.records.form.quantity')"
                data-index="quantity"
                width="80"
              />
              <Table.Column
                :title="t('qms.inspection.issues.description')"
                data-index="issueDescription"
                ellipsis
              />
              <Table.Column
                :title="t('qms.inspection.issues.lossAmount')"
                data-index="qualityLoss"
                width="100"
              >
                <template #default="{ text }">
                  <span class="font-bold text-red-600">¥{{ text ?? 0 }}</span>
                </template>
              </Table.Column>
            </Table>
          </div>
        </TabPane>
        <TabPane key="4" :tab="t('qms.supplier.historyProjects')">
          <Table
            :data-source="supplierHistoryProjects"
            size="small"
            :pagination="{ pageSize: 5 }"
            row-key="workOrderNumber"
            :loading="isDetailLoading"
          >
            <Table.Column
              :title="t('qms.workOrder.workOrderNumber')"
              data-index="workOrderNumber"
              width="180"
            />
            <Table.Column
              :title="t('qms.workOrder.projectName')"
              data-index="projectName"
            >
              <template #default="{ text }">
                {{ text || '-' }}
              </template>
            </Table.Column>
          </Table>
        </TabPane>
        <TabPane key="5" :tab="t('qms.common.tabs.inspectionHistory')">
          <Table
            :data-source="supplierInspections"
            size="small"
            :pagination="supplierInspectionPagination"
            row-key="id"
            :loading="isDetailLoading || isInspectionHistoryLoading"
            @change="handleInspectionPageChange"
          >
            <Table.Column
              :title="t('qms.inspection.records.form.inspectionDate')"
              data-index="inspectionDate"
              width="120"
            >
              <template #default="{ text }">
                {{ text ? text.split('T')[0] : '-' }}
              </template>
            </Table.Column>
            <Table.Column
              :title="t('qms.workOrder.workOrderNumber')"
              data-index="workOrderNumber"
              width="140"
            />
            <Table.Column
              :title="t('qms.inspection.issues.partName')"
              data-index="partName"
            />
            <Table.Column
              :title="t('qms.inspection.records.form.quantity')"
              data-index="quantity"
              width="80"
            />
            <Table.Column
              :title="t('qms.inspection.records.form.result')"
              data-index="result"
            >
              <template #default="{ text }">
                <Tag :color="text === 'PASS' ? 'green' : 'red'">
                  {{ text ?? '-' }}
                </Tag>
              </template>
            </Table.Column>
          </Table>
        </TabPane>
      </Tabs>
    </div>
  </Drawer>
</template>
