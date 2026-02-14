<script lang="ts" setup>
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { QmsPlanningApi } from '#/api/qms/planning';

import { computed, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import { useDebounceFn } from '@vueuse/core';
import { Divider, message } from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenForm } from '#/adapter/form';
import { getItpList, getItpProjectList } from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import BomItemSelect from './form/BomItemSelect.vue';
import TeamSelect from './form/TeamSelect.vue';
import { getFormSchema } from './formData';
import InspectionItemsTable from './InspectionItemsTable.vue';

// Define local interface for quantitative items from ITP
interface QuantitativeItem {
  standardValue?: number;
  upperTolerance?: number;
  lowerTolerance?: number;
  unit?: string;
}

// And ItpItem with parsed quantitative items
interface ExtendedItpItem extends QmsPlanningApi.ItpItem {
  _parsedQItems?: QuantitativeItem[];
}

// Define local interface to match UI needs
interface LocalInspectionTaskResult
  extends QmsInspectionApi.InspectionTaskResult {
  checkItem?: string;
  acceptanceCriteria?: string;
}

const props = defineProps<{
  record?: QmsInspectionApi.InspectionRecord;
  type: string;
}>();

const userStore = useUserStore();
const { handleApiError } = useErrorHandler();

// Reactive items list that remains separate from Vben Form for easy filtering/management
const inspectionItems = ref<LocalInspectionTaskResult[]>([]);
const rawItpItems = ref<QmsPlanningApi.ItpItem[]>([]);

// Local reactive state for form values to ensure filtering logic is reactive
const activeValues = ref<Record<string, unknown>>({});

const [Form, formApi] = useVbenForm({
  handleSubmit: () => {}, // Handled by parent
  schema: getFormSchema(props.type),
  showDefaultActions: false,
  wrapperClass: 'grid grid-cols-3 gap-x-4 gap-y-1',
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
  },
  handleValuesChange: (vals) => {
    activeValues.value = vals;
  },
});

// Pre-parse quantitative items
const parsedItpItems = computed<ExtendedItpItem[]>(() => {
  return (rawItpItems.value as ExtendedItpItem[]).map((item) => {
    let qItems: QuantitativeItem[] = [];
    try {
      if (
        item.quantitativeItems &&
        typeof item.quantitativeItems === 'string'
      ) {
        qItems = JSON.parse(item.quantitativeItems);
      } else if (Array.isArray(item.quantitativeItems)) {
        qItems = item.quantitativeItems as QuantitativeItem[];
      }
    } catch (error) {
      handleApiError(error, 'Parse ITP Quantitative Items');
    }
    return { ...item, _parsedQItems: qItems };
  });
});

// Filter items based on current form values
async function filterItpItems() {
  const values = activeValues.value;
  if (!values || parsedItpItems.value.length === 0) {
    inspectionItems.value = [];
    return;
  }

  let filtered = parsedItpItems.value;

  // Relaxed filtering for ITP items
  if (props.type === 'process' && values.processName) {
    filtered = filtered.filter(
      (item) => item.processStep === values.processName,
    );
  } else if (
    props.type === 'incoming' && // Attempt to filter by incoming type
    values.incomingType
  ) {
    const matched = filtered.filter(
      (item) => item.processStep === values.incomingType,
    );
    if (matched.length > 0) {
      filtered = matched;
    }
  }

  // Level 1 Component filtering
  if (props.type === 'process' && values.level1Component) {
    filtered = filtered.filter((item) =>
      item.activity?.includes(values.level1Component as string),
    );
  }

  const mappedItems: LocalInspectionTaskResult[] = [];
  filtered.forEach((item) => {
    const qItems = item._parsedQItems || [];
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

  inspectionItems.value = mappedItems;
}

const debouncedFilter = useDebounceFn(() => {
  filterItpItems();
}, 200);

// Watch for form state changes to refilter ITP items
watch(
  () => activeValues.value,
  () => {
    debouncedFilter();
  },
  { deep: true },
);

async function loadItp(itpProjectId?: string) {
  if (!itpProjectId) {
    rawItpItems.value = [];
    inspectionItems.value = [];
    return;
  }
  try {
    const items = await getItpList({ projectId: itpProjectId });
    rawItpItems.value = items || [];
    await filterItpItems();
  } catch (error) {
    handleApiError(error, 'Load ITP Items');
  }
}

async function handleWorkOrderChange(
  val: string | undefined,
  option: { item?: { projectName: string; workOrderNumber: string } },
) {
  try {
    // Explicitly set field value to ensure synchronization
    formApi.setFieldValue('workOrderNumber', val);

    const projects = await getItpProjectList();
    const workOrderNumber = option?.item?.workOrderNumber;

    // Primarily use project name from work order as requested
    const projectNameFromWO = option?.item?.projectName || '';

    // Robust matching for ITP plan
    const matchedProject = projects.find(
      (p) =>
        p.workOrderId === val ||
        (workOrderNumber && p.workOrderNumber === workOrderNumber) ||
        p.workOrderNumber === val,
    );

    if (matchedProject) {
      // Prioritize WO project name, fallback to ITP project name
      await formApi.setValues({
        projectName: projectNameFromWO || matchedProject.projectName,
        itpProjectId: matchedProject.id,
      });
      message.success(`已自动关联 ITP: ${matchedProject.projectName}`);
      await loadItp(matchedProject.id);
    } else {
      await formApi.setValues({
        projectName: projectNameFromWO,
        itpProjectId: undefined,
      });
      rawItpItems.value = [];
      inspectionItems.value = [];
    }

    // Clear validation error after setting values
    setTimeout(() => {
      formApi.validateField('workOrderNumber');
    }, 200);
  } catch (error) {
    handleApiError(error, 'Handle Work Order Change');
  }
}

async function handleSupplierChange(val: string | undefined) {
  formApi.setFieldValue('supplierName', val);
  setTimeout(() => {
    formApi.validateField('supplierName');
  }, 200);
}

function clearFieldValidator(fieldName: string) {
  setTimeout(() => {
    formApi.validateField(fieldName);
  }, 200);
}

watch(
  () => props.type,
  (newType) => {
    formApi.setState({ schema: getFormSchema(newType) });
  },
  { immediate: true },
);

// Watch for incomingType changes to switch Supplier/Outsourcing
watch(
  () => activeValues.value.incomingType,
  (newVal, oldVal) => {
    if (props.type === 'incoming') {
      const isMachined = newVal === '机加成品件';
      formApi.updateSchema([
        {
          fieldName: 'supplierName',
          componentProps: {
            category: isMachined ? 'Outsourcing' : 'Supplier',
            placeholder: isMachined ? '请选择外协单位' : '请选择供应商',
          },
        },
        {
          fieldName: 'hasDocuments',
          show: true,
        },
      ] as unknown as Parameters<typeof formApi.updateSchema>[0]);

      // Clear value if type changes and it's not the initial load (optimization)
      if (newVal !== oldVal && oldVal !== undefined) {
        formApi.setFieldValue('supplierName', undefined);
      }
    }
  },
);

watch(
  () => props.record,
  async (val) => {
    if (val && Object.keys(val).length > 0) {
      const record = val as QmsInspectionApi.DetailedInspectionRecord & {
        itpProjectId?: string;
      };
      await formApi.setValues(val);
      activeValues.value = val as unknown as Record<string, unknown>; // Sync local state
      if (record.items)
        inspectionItems.value = record.items as LocalInspectionTaskResult[];
      if (record.itpProjectId) await loadItp(record.itpProjectId);
    } else {
      await formApi.resetForm();
      const defaultInspector =
        userStore.userInfo?.username || userStore.userInfo?.realName || '';
      const initialVals = {
        inspector: defaultInspector,
        inspectionDate: dayjs().format('YYYY-MM-DD'),
        quantity: 1,
        result: 'PASS',
      };
      await formApi.setValues(initialVals);
      activeValues.value = initialVals; // Sync local state
      rawItpItems.value = [];
      inspectionItems.value = [];
    }
  },
  { immediate: true },
);

defineExpose({
  getValues: async () => {
    const values = await formApi.getValues();
    return { ...values, items: inspectionItems.value };
  },
  validate: async () => {
    const { valid } = await formApi.validate();
    if (!valid) throw new Error('Form validation failed');

    if (inspectionItems.value.length > 0) {
      const unfilled = inspectionItems.value.filter(
        (i) =>
          i.measuredValue === undefined ||
          i.measuredValue === null ||
          String(i.measuredValue) === '' ||
          !i.result,
      );
      if (unfilled.length > 0) {
        message.warning(
          `请补全关联 ITP 的实测值和判定结果 (剩余 ${unfilled.length} 项)`,
        );
        throw new Error('ITP items incomplete');
      }
    }
    return true;
  },
});
</script>

<template>
  <Form>
    <!-- Slot for WorkOrderSelect -->
    <template #workOrderNumber="slotProps">
      <WorkOrderSelect v-bind="slotProps" @change="handleWorkOrderChange" />
    </template>

    <!-- Slot for SupplierSelect -->
    <template #supplierName="slotProps">
      <SupplierSelect v-bind="slotProps" @change="handleSupplierChange" />
    </template>

    <!-- Slot for BomItemSelect -->
    <template #level1Component="slotProps">
      <BomItemSelect
        v-bind="slotProps"
        :work-order-number="activeValues?.workOrderNumber"
        @change="
          (val) => {
            formApi.setFieldValue('level1Component', val);
            clearFieldValidator('level1Component');
          }
        "
      />
    </template>

    <!-- Slot for TeamSelect -->
    <template #team="slotProps">
      <TeamSelect
        v-bind="slotProps"
        @change="
          (val) => {
            formApi.setFieldValue('team', val);
            clearFieldValidator('team');
          }
        "
      />
    </template>

    <!-- Slot for the ITP items table -->
    <template #itemsSlot>
      <div v-if="inspectionItems.length > 0" class="mt-2">
        <Divider orientation="left">关联 ITP</Divider>
        <InspectionItemsTable v-model:data-source="inspectionItems" />
      </div>
    </template>
  </Form>
</template>
