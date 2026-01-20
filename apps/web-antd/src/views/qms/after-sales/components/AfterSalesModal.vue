<script lang="ts" setup>
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { TreeSelectNode } from '#/types';

import { computed, toRef, watch, ref } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Modal } from 'ant-design-vue';

import { useAfterSalesForm } from '../composables/useAfterSalesForm';
import { useStatusOptions } from '../constants';
import AfterSalesBasicInfo from './AfterSalesBasicInfo.vue';
import AfterSalesDescription from './AfterSalesDescription.vue';
import AfterSalesIssueDetails from './AfterSalesIssueDetails.vue';
import AfterSalesProductInfo from './AfterSalesProductInfo.vue';
import AfterSalesResponsibility from './AfterSalesResponsibility.vue';
import AfterSalesStatus from './AfterSalesStatus.vue';

const props = defineProps<{
  deptTreeData: TreeSelectNode[];
  initialData?: QmsAfterSalesApi.AfterSalesItem;
  isEditMode: boolean;
  open: boolean;
  supplierList: QmsSupplierApi.SupplierItem[];
  workOrderList: QmsWorkOrderApi.WorkOrderItem[];
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { statusOptions } = useStatusOptions();
const formRef = ref();

const rules = computed(() => ({
  workOrderNumber: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.afterSales.form.workOrderNumber')]) }],
  customerName: [{ required: true, message: t('ui.formRules.required', [t('qms.afterSales.form.customerName')]) }],
  partName: [{ required: true, message: t('ui.formRules.required', [t('qms.afterSales.form.partName')]) }],
  issueDate: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.afterSales.form.issueDate')]) }],
  location: [{ required: true, message: t('ui.formRules.required', [t('qms.afterSales.form.location')]) }],
  severity: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.afterSales.form.severity')]) }],
  defectType: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.afterSales.form.defectType')]) }],
  quantity: [{ required: true, message: t('ui.formRules.required', [t('qms.afterSales.form.quantity')]) }],
  responsibleDept: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.afterSales.form.responsibleDept')]) }],
  status: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.afterSales.form.status')]) }],
  issueDescription: [{ required: true, message: t('ui.formRules.required', [t('qms.afterSales.form.issueDescription')]) }],
}));

const openRef = toRef(props, 'open');
const isEditModeRef = toRef(props, 'isEditMode');

const {
  formState,
  currentProductSubtypes,
  currentDefectSubtypes,
  initFromData,
  submit,
  handleProductTypeChange,
  handleDefectTypeChange,
  handleWorkOrderChange,
  checkIsPurchasingDept,
} = useAfterSalesForm({
  open: openRef,
  isEditMode: isEditModeRef,
  onSuccess: () => emit('success'),
  onClose: () => emit('update:open', false),
});

// 是否为采购部门
const isPurchasingDept = computed(() => checkIsPurchasingDept(props.deptTreeData));

// 监听编辑模式数据
watch(
  () => props.open,
  (val) => {
    if (val && props.isEditMode && props.initialData) {
      initFromData(props.initialData);
    }
  },
);

async function handleOk() {
  try {
    await formRef.value.validate();
    submit();
  } catch (error) {
    // validation failed
  }
}

function handleCancel() {
  emit('update:open', false);
}

function onWorkOrderChange(val: string | number) {
  handleWorkOrderChange(val, props.workOrderList);
}
</script>

<template>
  <Modal
    :open="open"
    :title="isEditMode ? t('qms.afterSales.form.edit') : t('qms.afterSales.form.create')"
    width="1000px"
    @cancel="handleCancel"
    @ok="handleOk"
  >
    <Form ref="formRef" :model="formState" :rules="rules" layout="vertical" class="pt-2">
      <div class="grid max-h-[650px] grid-cols-1 gap-4 overflow-y-auto p-1 md:grid-cols-2">
        <!-- 左侧列 -->
        <div class="space-y-4">
          <AfterSalesBasicInfo
            v-model:form-state="formState"
            :dept-tree-data="deptTreeData"
            :work-order-list="workOrderList"
            @work-order-change="onWorkOrderChange"
          />

          <AfterSalesProductInfo
            v-model:form-state="formState"
            :product-subtypes="currentProductSubtypes"
            @product-type-change="handleProductTypeChange"
          />

          <AfterSalesIssueDetails
            v-model:form-state="formState"
            :defect-subtypes="currentDefectSubtypes"
            @defect-type-change="handleDefectTypeChange"
          />
        </div>

        <!-- 右侧列 -->
        <div class="space-y-4">
          <AfterSalesResponsibility
            v-model:form-state="formState"
            :dept-tree-data="deptTreeData"
            :supplier-list="supplierList"
            :is-purchasing-dept="isPurchasingDept"
          />

          <AfterSalesStatus
            v-model:form-state="formState"
            :status-options="statusOptions"
          />

          <AfterSalesDescription v-model:form-state="formState" />
        </div>
      </div>
    </Form>
  </Modal>
</template>
