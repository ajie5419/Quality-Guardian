<script lang="ts" setup>
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import { Descriptions, Drawer, Image, Tag } from 'ant-design-vue';

import { QmsStatusTag } from '#/components/Qms';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { findNameById } from '#/types';

type DeptNode = {
  children?: DeptNode[];
  id: string;
  name: string;
};

const props = defineProps<{
  deptData: DeptNode[];
  record?: QmsAfterSalesApi.AfterSalesItem;
}>();

const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();
const { isMobile } = useMobileViewport();

const title = computed(
  () => `售后问题详情 - ${props.record?.workOrderNumber || ''}`,
);
const drawerWidth = computed(() =>
  isMobile.value ? '100vw' : 'min(100vw, 900px)',
);
const photos = computed(() => parsePhotos(props.record?.photos));

function parsePhotos(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function formatDept(value: string | undefined) {
  if (!value) return '-';
  return findNameById(props.deptData, value) || value;
}

function formatDepartments(record: QmsAfterSalesApi.AfterSalesItem) {
  let values: string[] = [];
  if (
    Array.isArray(record.responsibleDepartments) &&
    record.responsibleDepartments.length > 0
  ) {
    values = record.responsibleDepartments;
  } else if (record.responsibleDept) {
    values = [record.responsibleDept];
  }
  if (values.length === 0) return '-';
  return values.map((value) => formatDept(value)).join(', ');
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="title"
    :width="drawerWidth"
    placement="right"
  >
    <Descriptions
      v-if="record"
      bordered
      :column="isMobile ? 1 : 2"
      size="small"
    >
      <Descriptions.Item :label="t('qms.afterSales.form.workOrderNumber')">
        {{ record.workOrderNumber || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.status')">
        <QmsStatusTag :status="record.status" type="after-sales" />
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.projectName')">
        {{ record.projectName || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.partName')">
        {{ record.partName || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.division')">
        {{ formatDept(record.division) }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.responsibleDept')">
        {{ formatDepartments(record) }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.customerName')">
        {{ record.customerName || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.location')">
        {{ record.location || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.productType')">
        {{ record.productType || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.productSubtype')">
        {{ record.productSubtype || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.defectType')">
        {{ record.defectType || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.defectSubtype')">
        {{ record.defectSubtype || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.severity')">
        {{ record.severity || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.columns.isClaim')">
        <Tag :color="record.isClaim ? 'red' : 'green'">
          {{ record.isClaim ? t('common.yes') : t('common.no') }}
        </Tag>
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.quantity')">
        {{ record.quantity ?? '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.runningHours')">
        {{ record.runningHours ?? '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.warrantyStatus')">
        {{ record.warrantyStatus || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.supplierBrand')">
        {{ record.supplierBrand || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.materialCost')">
        ¥{{ record.materialCost ?? 0 }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.laborTravelCost')">
        ¥{{ record.laborTravelCost ?? 0 }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.handler')">
        {{ record.handler || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.factoryDate')">
        {{ record.factoryDate || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.afterSales.form.issueDate')">
        {{ record.issueDate || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.afterSales.form.closeDate')">
        {{ record.closeDate || '-' }}
      </Descriptions.Item>

      <Descriptions.Item label="发生日期">
        {{ record.occurDate || '-' }}
      </Descriptions.Item>
      <Descriptions.Item label="发货日期">
        {{ record.shipDate || '-' }}
      </Descriptions.Item>

      <Descriptions.Item
        :label="t('qms.afterSales.form.issueDescription')"
        :span="isMobile ? 1 : 2"
      >
        {{ record.issueDescription || '-' }}
      </Descriptions.Item>
      <Descriptions.Item
        :label="t('qms.afterSales.form.resolutionPlan')"
        :span="isMobile ? 1 : 2"
      >
        {{ record.resolutionPlan || '-' }}
      </Descriptions.Item>
      <Descriptions.Item
        :label="t('qms.afterSales.form.photos')"
        :span="isMobile ? 1 : 2"
      >
        <div v-if="photos.length > 0" class="flex flex-wrap gap-2">
          <Image
            v-for="(photo, index) in photos"
            :key="`${photo}-${index}`"
            :width="96"
            :height="96"
            :src="photo"
            class="rounded border border-gray-200"
          />
        </div>
        <span v-else>-</span>
      </Descriptions.Item>
    </Descriptions>
  </Drawer>
</template>
