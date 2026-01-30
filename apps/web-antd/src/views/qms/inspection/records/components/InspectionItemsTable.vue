<script lang="ts" setup>
import type { QmsInspectionApi } from '#/api/qms/inspection';

import { useI18n } from '@vben/locales';

import { Input, InputNumber, Select, Table, Tag } from 'ant-design-vue';

defineProps<{
  dataSource: QmsInspectionApi.InspectionTaskResult[];
}>();

const emit = defineEmits(['update:dataSource', 'change']);

const { t } = useI18n();

const columns = [
  { title: '检查项目', dataIndex: 'checkItem', width: 150 },
  { title: '标准值', dataIndex: 'standard', width: 200 }, // Custom render
  { title: '单位', dataIndex: 'uom', width: 80 },
  { title: '实测值', dataIndex: 'measuredValue', width: 150 },
  { title: '结果', dataIndex: 'result', width: 100 },
  { title: '备注', dataIndex: 'remarks' },
];

function handleResultChange(record: any, val: string) {
  record.result = val;
  emit('change');
}

function handleValueChange(record: any) {
  // Simple client-side auto-calc
  // Check if standardValue exists (including 0)
  if (
    record.standardValue !== undefined &&
    record.standardValue !== null &&
    record.measuredValue !== undefined &&
    record.measuredValue !== null
  ) {
    const val = Number.parseFloat(record.measuredValue);
    const std = Number.parseFloat(record.standardValue);
    const upper = Number.parseFloat(record.upperTolerance || '0');
    const lower = Number.parseFloat(record.lowerTolerance || '0');

    if (!Number.isNaN(val) && !Number.isNaN(std)) {
      record.result = val > std + upper || val < std - lower ? 'FAIL' : 'PASS';
    }
  }
  emit('change');
}
</script>

<template>
  <Table
    :columns="columns"
    :data-source="dataSource"
    :pagination="false"
    size="small"
    row-key="id"
    bordered
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.dataIndex === 'standard'">
        <div
          v-if="
            record.standardValue !== undefined && record.standardValue !== null
          "
        >
          {{ record.standardValue }}
          <span class="text-xs text-gray-400">
            (+{{ record.upperTolerance || 0 }}/-{{
              record.lowerTolerance || 0
            }})
          </span>
        </div>
        <div v-else class="text-xs text-gray-500">
          {{ record.acceptanceCriteria }}
        </div>
      </template>

      <template v-if="column.dataIndex === 'measuredValue'">
        <InputNumber
          v-if="
            record.standardValue !== undefined && record.standardValue !== null
          "
          v-model:value="record.measuredValue"
          size="small"
          class="w-full"
          @change="handleValueChange(record)"
        />
        <Input v-else v-model:value="record.measuredValue" size="small" />
      </template>

      <template v-if="column.dataIndex === 'result'">
        <Select
          v-model:value="record.result"
          size="small"
          class="w-full"
          @change="(val) => handleResultChange(record, val as string)"
        >
          <Select.Option value="PASS">
            <Tag color="green">{{ t('qms.inspection.resultValue.PASS') }}</Tag>
          </Select.Option>
          <Select.Option value="FAIL">
            <Tag color="red">{{ t('qms.inspection.resultValue.FAIL') }}</Tag>
          </Select.Option>
          <Select.Option value="NA">
            <Tag color="default">{{ t('qms.inspection.resultValue.NA') }}</Tag>
          </Select.Option>
        </Select>
      </template>

      <template v-if="column.dataIndex === 'remarks'">
        <Input v-model:value="record.remarks" size="small" />
      </template>
    </template>
  </Table>
</template>
