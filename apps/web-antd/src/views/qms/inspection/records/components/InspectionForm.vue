<script lang="ts" setup>
import type { QmsInspectionApi } from '#/api/qms/inspection';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { useDebounceFn } from '@vueuse/core';
import {
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Select,
  Tag,
  Textarea,
} from 'ant-design-vue';
import dayjs from 'dayjs';
import { cloneDeep } from 'lodash-es';

import { getItpList, getItpProjectList } from '#/api/qms/planning';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import { getFormConfig, getProcessOptions } from '../config';
import BomItemSelect from './form/BomItemSelect.vue';
import TeamSelect from './form/TeamSelect.vue';
import InspectionItemsTable from './InspectionItemsTable.vue';

// Define local interface to match UI needs (checkItem/acceptanceCriteria are not in shared type)
interface LocalInspectionTaskResult
  extends QmsInspectionApi.InspectionTaskResult {
  checkItem?: string;
  acceptanceCriteria?: string;
}

const props = defineProps<{
  record?: QmsInspectionApi.InspectionRecord;
  type: string;
}>();

const { t } = useI18n();
const userStore = useUserStore();

const formState = reactive({
  workOrderNumber: '',
  projectName: '',
  itpProjectId: undefined as string | undefined,
  // ... common fields
  quantity: 1,
  inspector: '',
  inspectionDate: '',
  result: 'PASS',
  remarks: '',
  // ... dynamic fields
  supplierName: '',
  materialName: '',
  incomingType: undefined as string | undefined,
  processName: undefined as string | undefined,
  level1Component: '',
  level2Component: '',
  team: '',
  documents: '',
  packingListArchived: '是',

  items: [] as LocalInspectionTaskResult[],
});

const config = computed(() => getFormConfig(props.type, t));

// 根据进货类型决定供应商数据来源：机加成品件 -> 外协管理，其他 -> 供应商管理
const supplierCategory = computed(() => {
  return formState.incomingType === '机加成品件' ? 'Outsourcing' : 'Supplier';
});

// 进货类型变化时清空已选供应商，避免数据源不匹配
watch(
  () => formState.incomingType,
  (newVal, oldVal) => {
    if (oldVal !== undefined && newVal !== oldVal) {
      formState.supplierName = '';
    }
  },
);

// Store raw ITP items for filtering
const rawItpItems = ref<any[]>([]);

// Pre-parse quantitative items to avoid repeated JSON.parse inside filter loop
const parsedItpItems = computed(() => {
  return rawItpItems.value.map((item: any) => {
    let qItems: any[] = [];
    try {
      if (
        item.quantitativeItems &&
        typeof item.quantitativeItems === 'string'
      ) {
        qItems = JSON.parse(item.quantitativeItems);
      } else if (Array.isArray(item.quantitativeItems)) {
        qItems = item.quantitativeItems;
      }
    } catch (error) {
      console.error('Failed to parse quantitative items', error);
    }
    return {
      ...item,
      _parsedQItems: qItems,
    };
  });
});

// Filter items based on current form state
function filterItpItems() {
  if (parsedItpItems.value.length === 0) {
    formState.items = [];
    return;
  }

  let filtered = parsedItpItems.value;

  // Strict Filtering: If a filter criteria is enabled in config,
  // we require a value selected/entered to show matching items.
  // Otherwise, we show nothing to avoid confusion.

  // Filter by Process / Incoming Type
  if (config.value.showProcess && formState.processName) {
    filtered = filtered.filter(
      (item) => item.processStep === formState.processName,
    );
  } else if (config.value.showIncomingType && formState.incomingType) {
    // Map incoming type to ITP processStep
    filtered = filtered.filter(
      (item) => item.processStep === formState.incomingType,
    );
  }

  // Filter by Level 1 Component / Activity matching
  if (config.value.showLevel1 && formState.level1Component) {
    filtered = filtered.filter((item) =>
      item.activity.includes(formState.level1Component),
    );
  }

  // Map to inspection items format
  const mappedItems: LocalInspectionTaskResult[] = [];

  filtered.forEach((item: any) => {
    const qItems = (item._parsedQItems as any[]) || [];

    // Check if it's quantitative and has items
    if (item.isQuantitative && qItems.length > 0) {
      qItems.forEach((qItem) => {
        mappedItems.push({
          activity: item.activity,
          controlPoint: item.controlPoint,
          isQuantitative: true,
          itpItemId: item.id,
          checkItem: item.activity,
          standardValue: qItem.standardValue,
          upperTolerance: qItem.upperTolerance || 0,
          lowerTolerance: qItem.lowerTolerance || 0,
          uom: qItem.unit,
          acceptanceCriteria: item.acceptanceCriteria,
          result: 'PASS',
        } as LocalInspectionTaskResult);
      });
    } else {
      // Qualitative item
      mappedItems.push({
        activity: item.activity,
        controlPoint: item.controlPoint,
        isQuantitative: false,
        itpItemId: item.id,
        checkItem: item.activity,
        acceptanceCriteria: item.acceptanceCriteria,
        result: 'PASS',
      } as LocalInspectionTaskResult);
    }
  });

  formState.items = mappedItems;
}

// Watchers for filtering
// Watchers for filtering with debounce to improve performance
const debouncedFilter = useDebounceFn(() => {
  filterItpItems();
}, 200);

watch(
  () => [
    formState.processName,
    formState.level1Component,
    formState.incomingType,
  ],
  () => {
    debouncedFilter();
  },
);

// Ensure ITP items are loaded if itpProjectId is already set (e.g. on edit)
watch(
  () => formState.itpProjectId,
  (newId) => {
    if (newId) {
      loadItp();
    }
  },
  { immediate: true },
);

// Load ITP Items Logic (Simplified)
async function loadItp() {
  if (!formState.itpProjectId) return;
  try {
    const items = await getItpList({ projectId: formState.itpProjectId });
    rawItpItems.value = items || [];
    filterItpItems();
  } catch (error) {
    console.error(error);
  }
}

async function handleWorkOrderChange(val: any, opt: any) {
  if (opt?.item) {
    formState.projectName = opt.item.projectName;
    // Auto-find ITP project
    try {
      // Find ITP project by Work Order Number
      // Since current API returns all projects, we filter on client side
      // Ideally backend should support filtering
      const projects = await getItpProjectList();
      const matchedProject = projects.find((p) => p.workOrderId === val);

      if (matchedProject) {
        formState.itpProjectId = matchedProject.id;
        message.success(`已自动关联 ITP: ${matchedProject.projectName}`);
        await loadItp();
      } else {
        formState.itpProjectId = undefined;
        formState.items = [];
        // message.info('未找到关联的 ITP 计划');
      }
    } catch (error) {
      console.error(error);
    }
  }
}

watch(
  () => props.record,
  (val) => {
    if (val && Object.keys(val).length > 0) {
      Object.assign(formState, cloneDeep(val));
    } else {
      // Reset defaults
      Object.assign(formState, {
        workOrderNumber: '',
        projectName: '',
        itpProjectId: undefined,
        quantity: 1,
        inspector:
          userStore.userInfo?.username || userStore.userInfo?.realName || '',
        inspectionDate: dayjs().format('YYYY-MM-DD'),
        result: 'PASS',
        remarks: '',
        supplierName: '',
        materialName: '',
        incomingType: undefined,
        processName: undefined,
        level1Component: '',
        level2Component: '',
        team: '',
        documents: '',
        packingListArchived: '是',
        items: [],
      });
    }
  },
  { immediate: true },
);

defineExpose({
  getValues: () => formState,
  validate: () => {
    /* ... */
  },
});
</script>

<template>
  <Form layout="vertical" :model="formState">
    <div class="grid grid-cols-3 gap-4">
      <Form.Item :label="t('qms.workOrder.workOrderNumber')" required>
        <WorkOrderSelect
          v-model:value="formState.workOrderNumber"
          @change="handleWorkOrderChange"
        />
      </Form.Item>
      <Form.Item :label="t('qms.workOrder.projectName')">
        <Input v-model:value="formState.projectName" disabled />
      </Form.Item>
      <!-- Dynamic Fields -->
      <Form.Item
        v-if="config.showIncomingType"
        :label="t('qms.inspection.records.form.incomingType')"
      >
        <Select v-model:value="formState.incomingType">
          <Select.Option value="原材料">{{
            t('qms.inspection.records.options.process.rawMaterial')
          }}</Select.Option>
          <Select.Option value="外购件">{{
            t('qms.inspection.records.options.process.outsourced')
          }}</Select.Option>
          <Select.Option value="辅材">{{
            t('qms.inspection.records.options.process.auxiliary')
          }}</Select.Option>
          <Select.Option value="机加成品件">{{
            t('qms.inspection.records.options.process.machined')
          }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item
        v-if="config.showSupplier"
        :label="
          supplierCategory === 'Outsourcing'
            ? t('qms.outsourcing.entityName')
            : t('qms.supplier.name')
        "
      >
        <SupplierSelect
          v-model:value="formState.supplierName"
          :category="supplierCategory"
          :placeholder="
            supplierCategory === 'Outsourcing'
              ? t('afterSales.placeholder.selectSupplier')
              : t('afterSales.placeholder.selectSupplier')
          "
        />
      </Form.Item>
      <Form.Item v-if="config.showMaterial" :label="config.labels.materialName">
        <Input v-model:value="formState.materialName" />
      </Form.Item>

      <Form.Item
        v-if="config.showProcess"
        :label="t('qms.inspection.records.form.process')"
      >
        <Select
          v-model:value="formState.processName"
          :options="getProcessOptions(t)"
        />
      </Form.Item>
      <Form.Item
        v-if="config.showLevel1"
        :label="t('qms.inspection.records.form.level1')"
      >
        <BomItemSelect
          v-model:value="formState.level1Component"
          :work-order-number="formState.workOrderNumber"
        />
      </Form.Item>
      <Form.Item
        v-if="config.showLevel2"
        :label="t('qms.inspection.records.form.componentName')"
      >
        <Input v-model:value="formState.level2Component" />
      </Form.Item>
      <Form.Item
        v-if="config.showTeam"
        :label="t('qms.inspection.records.form.team')"
      >
        <TeamSelect v-model:value="formState.team" />
      </Form.Item>

      <Form.Item
        v-if="config.showDocuments"
        :label="t('qms.inspection.records.form.documents')"
      >
        <Input v-model:value="formState.documents" />
      </Form.Item>
      <Form.Item
        v-if="config.showPackingList"
        :label="t('qms.inspection.records.form.packingListArchived')"
      >
        <Select v-model:value="formState.packingListArchived">
          <Select.Option value="是">{{
            t('common.yes') || '是'
          }}</Select.Option>
          <Select.Option value="否">{{ t('common.no') || '否' }}</Select.Option>
        </Select>
      </Form.Item>

      <!-- Common -->
      <Form.Item :label="t('qms.workOrder.quantity')">
        <InputNumber v-model:value="formState.quantity" class="w-full" />
      </Form.Item>
      <Form.Item :label="t('qms.inspection.issues.reportDate')">
        <DatePicker
          v-model:value="formState.inspectionDate"
          value-format="YYYY-MM-DD"
          class="w-full"
        />
      </Form.Item>
      <Form.Item :label="t('qms.inspection.issues.reportedBy')">
        <Input v-model:value="formState.inspector" />
      </Form.Item>
    </div>

    <div v-if="formState.items.length > 0">
      <Divider orientation="left">{{
        t('qms.inspection.records.relatedItp')
      }}</Divider>
      <InspectionItemsTable v-model:data-source="formState.items" />
    </div>

    <!-- 备注 -->
    <Form.Item :label="t('qms.inspection.fields.remarks')">
      <Textarea
        v-model:value="formState.remarks"
        :placeholder="t('qms.inspection.records.form.placeholder.remarks')"
        :rows="2"
      />
    </Form.Item>

    <div class="mt-4 rounded bg-gray-50 p-4">
      <Form.Item :label="t('qms.inspection.records.form.overallResult')">
        <Select v-model:value="formState.result" class="w-32">
          <Select.Option value="PASS"
            ><Tag color="green">{{
              t('qms.inspection.resultValue.PASS')
            }}</Tag></Select.Option
          >
          <Select.Option value="FAIL"
            ><Tag color="red">{{
              t('qms.inspection.resultValue.FAIL')
            }}</Tag></Select.Option
          >
        </Select>
      </Form.Item>
    </div>
  </Form>
</template>
