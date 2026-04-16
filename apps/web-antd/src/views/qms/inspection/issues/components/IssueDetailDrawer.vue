<script lang="ts" setup>
import type { InspectionIssue } from '../types';

import type { SystemDeptApi } from '#/api/system/dept';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import { Descriptions, Drawer, Image, Tag } from 'ant-design-vue';

import { findNameById } from '#/types';

import {
  getSeverityColor,
  getSeverityLabel,
  getStatusColor,
  getStatusLabel,
} from '../utils/statusHelper';

const props = defineProps<{
  deptData: SystemDeptApi.Dept[];
  record?: InspectionIssue;
}>();

const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();

const title = computed(() => `不合格项详情 - ${props.record?.ncNumber || ''}`);

const photos = computed(() => parsePhotos(props.record?.photos));

function parsePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item);
      continue;
    }
    if (
      item &&
      typeof item === 'object' &&
      'url' in item &&
      typeof item.url === 'string'
    ) {
      result.push(item.url);
    }
  }
  return result;
}

function formatDept(value: string | undefined) {
  if (!value) return '-';
  return findNameById(props.deptData, value) || value;
}

function formatDisplayDate(value: string | undefined) {
  if (!value) return '-';
  return value.includes('T') ? value.slice(0, 10) : value;
}
</script>

<template>
  <Drawer v-model:open="open" :title="title" :width="960" placement="right">
    <Descriptions v-if="record" bordered :column="2" size="small">
      <Descriptions.Item :label="t('qms.inspection.issues.ncNumber')">
        {{ record.ncNumber || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.statusLabel')">
        <Tag :color="getStatusColor(record.status)">
          {{ getStatusLabel(record.status) }}
        </Tag>
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.inspection.issues.workOrderNumber')">
        {{ record.workOrderNumber || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.projectName')">
        {{ record.projectName || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.inspection.issues.partName')">
        {{ record.partName || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.processName')">
        {{ record.processName || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.inspection.issues.reportDate')">
        {{ formatDisplayDate(record.reportDate) }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.reportedBy')">
        {{ record.inspector || '-' }}
      </Descriptions.Item>

      <Descriptions.Item label="事业部">
        {{ formatDept(record.division) }}
      </Descriptions.Item>
      <Descriptions.Item
        :label="t('qms.inspection.issues.responsibleDepartment')"
      >
        {{ formatDept(record.responsibleDepartment) }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.responsibleWelder')">
        {{ record.responsibleWelder || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.inspection.issues.defectType')">
        {{ record.defectType || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.defectSubtype')">
        {{ record.defectSubtype || '-' }}
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.inspection.issues.severity')">
        <Tag :color="getSeverityColor(record.severity)">
          {{ getSeverityLabel(record.severity) }}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.claim')">
        <Tag :color="record.claim === 'Yes' ? 'red' : 'green'">
          {{ record.claim === 'Yes' ? t('common.yes') : t('common.no') }}
        </Tag>
      </Descriptions.Item>

      <Descriptions.Item :label="t('qms.inspection.issues.quantity')">
        {{ record.quantity ?? '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.lossAmount')">
        ¥{{ record.lossAmount ?? 0 }}
      </Descriptions.Item>

      <Descriptions.Item label="供应商">
        {{ record.supplierName || '-' }}
      </Descriptions.Item>
      <Descriptions.Item label="更新时间">
        {{ formatDisplayDate(record.updatedAt) }}
      </Descriptions.Item>

      <Descriptions.Item
        :label="t('qms.inspection.issues.description')"
        :span="2"
      >
        {{ record.description || '-' }}
      </Descriptions.Item>
      <Descriptions.Item
        :label="t('qms.inspection.issues.rootCause')"
        :span="2"
      >
        {{ record.rootCause || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.solution')" :span="2">
        {{ record.solution || '-' }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('qms.inspection.issues.photos')" :span="2">
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
