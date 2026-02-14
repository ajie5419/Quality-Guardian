<script lang="ts" setup>
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { QmsInspectionApi } from '#/api/qms/inspection';

import { ref } from 'vue';

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
  getInspectionIssues,
  getInspectionRecords,
} from '#/api/qms/inspection';
import { useErrorHandler } from '#/hooks/useErrorHandler';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const selectedSupplier = ref<null | QmsSupplierApi.SupplierItem>(null);
const isDetailLoading = ref(false);
const supplierInspections = ref<QmsInspectionApi.InspectionRecord[]>([]);
const supplierAfterSales = ref<QmsAfterSalesApi.AfterSalesItem[]>([]);
const supplierEngineeringIssues = ref<QmsInspectionApi.InspectionIssue[]>([]);

const [Drawer, drawerApi] = useVbenDrawer({
  title: t('common.detail'),
  class: 'w-[950px]',
});

async function loadDetail(row: QmsSupplierApi.SupplierItem, titlePrefix = '') {
  selectedSupplier.value = row;
  const prefix = titlePrefix || t('qms.supplier.title');
  // 使用 qms.portrait 确保在 local qms.json 根部能找到
  drawerApi.setState({
    title: `${prefix}${t('qms.portrait')}: ${row.name}`,
  });
  isDetailLoading.value = true;

  try {
    const [inspections, afterSales, engineering] = await Promise.all([
      getInspectionRecords({ keyword: row.name, type: 'INCOMING' }),
      getAfterSalesList({ supplierBrand: row.brand || row.name }),
      getInspectionIssues({ supplierName: row.name }),
    ]);
    supplierInspections.value = inspections.items || [];
    supplierAfterSales.value = afterSales;
    supplierEngineeringIssues.value = engineering.items || [];
  } catch (error) {
    handleApiError(error, 'Load Supplier Detail');
  } finally {
    isDetailLoading.value = false;
  }
}

async function open(row: QmsSupplierApi.SupplierItem, titlePrefix = '') {
  await loadDetail(row, titlePrefix);
  drawerApi.open();
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
                  :value="selectedSupplier.incomingQualifiedRate ?? 0"
                  suffix="%"
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

      <Tabs default-active-key="1">
        <TabPane key="1" :tab="t('qms.common.tabs.basic')">
          <Descriptions bordered :column="2" size="small">
            <Descriptions.Item :label="t('qms.supplier.name')">
              {{ selectedSupplier.name }}
            </Descriptions.Item>
            <Descriptions.Item :label="t('qms.supplier.brand')">
              {{ selectedSupplier.brand }}
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
              :pagination="{ pageSize: 5 }"
              row-key="id"
              :loading="isDetailLoading"
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
        <TabPane key="4" :tab="t('qms.common.tabs.incoming')">
          <Table
            :data-source="supplierInspections"
            size="small"
            :pagination="{ pageSize: 5 }"
            row-key="id"
            :loading="isDetailLoading"
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
              :title="t('qms.inspection.records.form.materialName')"
              data-index="materialName"
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
