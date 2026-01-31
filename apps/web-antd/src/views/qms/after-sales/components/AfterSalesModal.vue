<script lang="ts" setup>
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { WorkOrderItem } from '#/api/qms/work-order';
import type { TreeSelectNode } from '#/types';

import { computed, ref, toRef, watch } from 'vue';

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
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { statusOptions } = useStatusOptions();
const formRef = ref();

const openRef = toRef(props, 'open');
const isEditModeRef = toRef(props, 'isEditMode');

const {
  formState,
  currentProductSubtypes,
  currentDefectSubtypes,
  rules,
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
const isPurchasingDept = computed(() =>
  checkIsPurchasingDept(props.deptTreeData),
);

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
  } catch {
    // validation failed
  }
}

function handleCancel() {
  emit('update:open', false);
}

function onWorkOrderChange(val: number | string, item?: WorkOrderItem) {
  handleWorkOrderChange(val, item);
}
</script>

<template>
  <Modal
    :open="open"
    :title="
      isEditMode
        ? t('qms.afterSales.form.edit')
        : t('qms.afterSales.form.create')
    "
    width="1000px"
    @cancel="handleCancel"
    @ok="handleOk"
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="pt-2"
    >
      <div
        class="grid max-h-[650px] grid-cols-1 gap-4 overflow-y-auto p-1 md:grid-cols-2"
      >
        <!-- 左侧列 -->
        <div class="space-y-4">
          <AfterSalesBasicInfo
            v-model:form-state="formState"
            :dept-tree-data="deptTreeData"
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
