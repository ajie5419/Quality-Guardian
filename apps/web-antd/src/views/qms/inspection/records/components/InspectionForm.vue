<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from '@vben/locales';
import { Form, Input, DatePicker, Select, InputNumber, Divider, Tag } from 'ant-design-vue';
import WorkOrderSelect from './form/WorkOrderSelect.vue';
import SupplierSelect from './form/SupplierSelect.vue';
import TeamSelect from './form/TeamSelect.vue';
import BomItemSelect from './form/BomItemSelect.vue';
import InspectionItemsTable from './InspectionItemsTable.vue';
import { getFormConfig, PROCESS_OPTIONS } from '../config';
import { getItpList, getItpProjectList } from '#/api/qms/planning';
import { message } from 'ant-design-vue';
import { useUserStore } from '@vben/stores';
import dayjs from 'dayjs';

const props = defineProps<{
  type: string;
  record?: any;
}>();

const emit = defineEmits(['update:record']);

const { t } = useI18n();
const userStore = useUserStore();

const formState = reactive({
  workOrderNumber: '',
  projectName: '',
  itpProjectId: undefined,
  // ... common fields
  quantity: 1,
  inspector: '',
  inspectionDate: '',
  result: 'PASS',
  // ... dynamic fields
  supplierName: '',
  materialName: '',
  incomingType: undefined,
  processName: undefined,
  level1Component: '',
  team: '',
  documents: '',
  packingListArchived: '是',
  
  items: [] as any[],
});

const config = computed(() => getFormConfig(props.type));

// Store raw ITP items for filtering
const rawItpItems = ref<any[]>([]);

// Filter items based on current form state
function filterItpItems() {
  if (!rawItpItems.value.length) {
    formState.items = [];
    return;
  }

  let filtered = rawItpItems.value;

  // Strict Filtering: If a filter criteria is enabled in config, 
  // we require a value selected/entered to show matching items.
  // Otherwise, we show nothing to avoid confusion.

  // Filter by Process
  if (config.value.showProcess) {
    if (!formState.processName) {
      formState.items = [];
      return;
    }
    filtered = filtered.filter(item => item.processStep === formState.processName);
  }

  // Filter by Level 1 Component / Activity matching
  if (config.value.showLevel1) {
    if (!formState.level1Component) {
      formState.items = [];
      return;
    }
    filtered = filtered.filter(item => item.activity.includes(formState.level1Component));
  }

  // Map to inspection items format
  const mappedItems: any[] = [];
  
  filtered.forEach((item: any) => {
    // Parse quantitative items if they exist
    let qItems: any[] = [];
    try {
      if (item.quantitativeItems && typeof item.quantitativeItems === 'string') {
        qItems = JSON.parse(item.quantitativeItems);
      } else if (Array.isArray(item.quantitativeItems)) {
        qItems = item.quantitativeItems;
      }
    } catch (e) {
      console.error('Failed to parse quantitative items', e);
    }

    // Check if it's quantitative and has items
    if (item.isQuantitative && qItems.length > 0) {
      qItems.forEach((qItem) => {
        mappedItems.push({
          checkItem: item.activity,
          standardValue: qItem.standardValue,
          upperTolerance: qItem.upperTolerance,
          lowerTolerance: qItem.lowerTolerance,
          uom: qItem.unit,
          acceptanceCriteria: item.acceptanceCriteria, // Include criteria as supplementary info
          result: 'PASS'
        });
      });
    } else {
      // Qualitative item
      mappedItems.push({
        checkItem: item.activity,
        acceptanceCriteria: item.acceptanceCriteria,
        result: 'PASS'
      });
    }
  });

  formState.items = mappedItems;
}

// Watchers for filtering
watch(
  () => [formState.processName, formState.level1Component],
  () => {
    filterItpItems();
  }
);

// Load ITP Items Logic (Simplified)
async function loadItp() {
  if (!formState.itpProjectId) return;
  try {
    const items = await getItpList({ projectId: formState.itpProjectId });
    rawItpItems.value = items;
    filterItpItems();
  } catch(e) {
    console.error(e);
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
      const matchedProject = projects.find(p => p.workOrderId === val);
      
      if (matchedProject) {
        formState.itpProjectId = matchedProject.id;
        message.success(`已自动关联 ITP: ${matchedProject.projectName}`);
        await loadItp();
      } else {
        formState.itpProjectId = undefined;
        formState.items = [];
        // message.info('未找到关联的 ITP 计划');
      }
    } catch (e) {
      console.error(e);
    }
  }
}

watch(() => props.record, (val) => {
  if (val && Object.keys(val).length > 0) {
    Object.assign(formState, val);
  } else {
    // Reset defaults
    Object.assign(formState, {
      workOrderNumber: '',
      projectName: '',
      itpProjectId: undefined,
      quantity: 1,
      inspector: userStore.userInfo?.realName || userStore.userInfo?.username || '',
      inspectionDate: dayjs().format('YYYY-MM-DD'),
      result: 'PASS',
      supplierName: '',
      materialName: '',
      incomingType: undefined,
      processName: undefined,
      level1Component: '',
      team: '',
      documents: '',
      packingListArchived: '是',
      items: [] as any[],
    });
  }
}, { immediate: true });

defineExpose({
  getValues: () => formState,
  validate: () => { /* ... */ }
});
</script>

<template>
  <Form layout="vertical" :model="formState">
    <div class="grid grid-cols-3 gap-4">
      <Form.Item label="工单号" required>
        <WorkOrderSelect v-model:value="formState.workOrderNumber" @change="handleWorkOrderChange" />
      </Form.Item>
      <Form.Item label="项目名称">
        <Input v-model:value="formState.projectName" disabled />
      </Form.Item>
      <!-- Dynamic Fields -->
      <Form.Item v-if="config.showIncomingType" label="进货类型">
        <Select v-model:value="formState.incomingType">
          <Select.Option value="原材料">原材料</Select.Option>
          <Select.Option value="外购件">外购件</Select.Option>
          <Select.Option value="辅材">辅材</Select.Option>
          <Select.Option value="机加成品件">机加成品件</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item v-if="config.showSupplier" label="供应商">
        <SupplierSelect v-model:value="formState.supplierName" />
      </Form.Item>
      <Form.Item v-if="config.showMaterial" label="物料名称">
        <Input v-model:value="formState.materialName" />
      </Form.Item>

      <Form.Item v-if="config.showProcess" label="工序">
        <Select v-model:value="formState.processName" :options="PROCESS_OPTIONS" />
      </Form.Item>
      <Form.Item v-if="config.showLevel1" label="一级部件">
        <BomItemSelect v-model:value="formState.level1Component" :work-order-number="formState.workOrderNumber" />
      </Form.Item>
      <Form.Item v-if="config.showTeam" label="班组">
        <TeamSelect v-model:value="formState.team" />
      </Form.Item>

      <Form.Item v-if="config.showDocuments" label="随箱资料">
        <Input v-model:value="formState.documents" />
      </Form.Item>
      <Form.Item v-if="config.showPackingList" label="装箱单归档">
        <Select v-model:value="formState.packingListArchived">
          <Select.Option value="是">是</Select.Option>
          <Select.Option value="否">否</Select.Option>
        </Select>
      </Form.Item>
      
      <!-- Common -->
      <Form.Item label="数量">
        <InputNumber v-model:value="formState.quantity" class="w-full" />
      </Form.Item>
      <Form.Item label="检验日期">
        <DatePicker v-model:value="formState.inspectionDate" value-format="YYYY-MM-DD" class="w-full" />
      </Form.Item>
      <Form.Item label="检验员">
        <Input v-model:value="formState.inspector" />
      </Form.Item>
    </div>

    <div v-if="formState.items.length > 0">
      <Divider orientation="left">检验项目 (ITP)</Divider>
      <InspectionItemsTable v-model:dataSource="formState.items" />
    </div>

    <div class="mt-4 p-4 bg-gray-50 rounded">
      <Form.Item label="最终结果">
        <Select v-model:value="formState.result" class="w-32">
          <Select.Option value="PASS"><Tag color="green">{{ t('qms.inspection.resultValue.PASS') }}</Tag></Select.Option>
          <Select.Option value="FAIL"><Tag color="red">{{ t('qms.inspection.resultValue.FAIL') }}</Tag></Select.Option>
        </Select>
      </Form.Item>
    </div>
  </Form>
</template>
