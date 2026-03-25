<script lang="ts" setup>
import { useI18n } from '@vben/locales';

import { Input, InputNumber, Select, Table, Tag } from 'ant-design-vue';

interface InspectionItemRow {
  acceptanceCriteria?: string;
  checkItem?: string;
  id: string;
  lowerTolerance?: number;
  measuredValue?: number | string;
  remarks?: string;
  result: 'FAIL' | 'NA' | 'PASS';
  standardValue?: number;
  uom?: string;
  upperTolerance?: number;
}

defineProps<{
  dataSource: InspectionItemRow[];
}>();

const emit = defineEmits(['update:dataSource', 'change']);

const { t } = useI18n();

const columns = [
  { title: '检查项目', dataIndex: 'checkItem', width: 150 },
  { title: '标准值', dataIndex: 'standard', width: 200 }, // Custom render
  { title: '实测值', dataIndex: 'measuredValue', width: 150 },
  { title: '结果', dataIndex: 'result', width: 100 },
  { title: '备注', dataIndex: 'remarks' },
];

function appendUnit(text: string, uom?: string) {
  const base = String(text || '').trim();
  const unit = String(uom || '').trim();
  if (!unit) return base;
  return base ? `${base}（${unit}）` : unit;
}

function handleResultChange(
  record: InspectionItemRow,
  val: 'FAIL' | 'NA' | 'PASS',
) {
  record.result = val;
  emit('change');
}

function handleValueChange(record: InspectionItemRow) {
  // Simple client-side auto-calc
  if (
    record.standardValue !== undefined &&
    record.standardValue !== null &&
    record.measuredValue !== undefined &&
    record.measuredValue !== null
  ) {
    const val =
      typeof record.measuredValue === 'number'
        ? record.measuredValue
        : Number.parseFloat(String(record.measuredValue));
    const std =
      typeof record.standardValue === 'number'
        ? record.standardValue
        : Number.parseFloat(String(record.standardValue));
    const upper =
      typeof record.upperTolerance === 'number'
        ? record.upperTolerance
        : Number.parseFloat(String(record.upperTolerance || '0'));
    const lower =
      typeof record.lowerTolerance === 'number'
        ? record.lowerTolerance
        : Number.parseFloat(String(record.lowerTolerance || '0'));

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
      <template v-if="column.dataIndex === 'checkItem'">
        <span>{{
          appendUnit(String(record.checkItem || ''), record.uom)
        }}</span>
      </template>

      <template v-if="column.dataIndex === 'standard'">
        <div v-if="String(record.acceptanceCriteria || '').trim()">
          {{
            String(record.acceptanceCriteria || '')
              .toLowerCase()
              .includes(String(record.uom || '').toLowerCase())
              ? record.acceptanceCriteria
              : appendUnit(String(record.acceptanceCriteria || ''), record.uom)
          }}
        </div>
        <div
          v-else-if="
            record.standardValue !== undefined && record.standardValue !== null
          "
        >
          {{ appendUnit(String(record.standardValue), record.uom) }}
          <span class="text-xs text-gray-400">
            (+{{ record.upperTolerance || 0 }}/-{{
              record.lowerTolerance || 0
            }})
          </span>
        </div>
        <div v-else class="text-xs text-gray-500">-</div>
      </template>

      <template v-if="column.dataIndex === 'measuredValue'">
        <InputNumber
          v-if="
            !String(record.acceptanceCriteria || '').trim() &&
            record.standardValue !== undefined &&
            record.standardValue !== null
          "
          v-model:value="record.measuredValue"
          size="small"
          class="w-full"
          @change="handleValueChange(record as InspectionItemRow)"
        />
        <Input v-else v-model:value="record.measuredValue" size="small" />
      </template>

      <template v-if="column.dataIndex === 'result'">
        <Select
          v-model:value="record.result"
          size="small"
          class="w-full"
          @change="
            (val) =>
              handleResultChange(
                record as InspectionItemRow,
                val as 'FAIL' | 'PASS' | 'NA',
              )
          "
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
