<script lang="ts" setup>
import type { WorkOrderItem } from '@qgs/shared';

import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { TreeSelectNode } from '#/types';

import { computed, ref, toRef, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { QUALITY_CLASSIFICATION_SCOPE } from '@qgs/shared';
import { Form, message, Modal } from 'ant-design-vue';

import { useQualityClassificationOptions } from '../../shared/composables/useQualityClassificationOptions';
import { useAfterSalesForm } from '../composables/useAfterSalesForm';
import { useStatusOptions } from '../constants';
import AfterSalesBasicInfo from './AfterSalesBasicInfo.vue';
import AfterSalesDescription from './AfterSalesDescription.vue';
import AfterSalesIssueDetails from './AfterSalesIssueDetails.vue';
import AfterSalesPhotoUpload from './AfterSalesPhotoUpload.vue';
import AfterSalesProductInfo from './AfterSalesProductInfo.vue';
import AfterSalesResponsibility from './AfterSalesResponsibility.vue';
import AfterSalesStatus from './AfterSalesStatus.vue';

const props = defineProps<{
  deptTreeData: TreeSelectNode[];
  initialData?: QmsAfterSalesApi.AfterSalesItem;
  isEditMode: boolean;
  open: boolean;
  statusOptions?: Array<{ color: string; label: string; value: string }>;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { statusOptions: fallbackStatusOptions } = useStatusOptions();
const statusOptions = computed(
  () => props.statusOptions ?? fallbackStatusOptions.value,
);
const formRef = ref();

const openRef = toRef(props, 'open');
const isEditModeRef = toRef(props, 'isEditMode');
const {
  loadOptions: loadProductOptions,
  options: productClassificationOptions,
} = useQualityClassificationOptions(
  QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
);
const { loadOptions: loadDefectOptions, options: defectClassificationOptions } =
  useQualityClassificationOptions(
    QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
  );

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
  defectOptions: defectClassificationOptions,
  open: openRef,
  isEditMode: isEditModeRef,
  productOptions: productClassificationOptions,
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
    if (!val) return;
    void Promise.all([loadProductOptions(), loadDefectOptions()])
      .then(() => {
        if (props.isEditMode && props.initialData) {
          initFromData(props.initialData);
        }
      })
      .catch(() => message.error(t('common.dataLoadFailed')));
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
            :product-categories="productClassificationOptions"
            :product-subtypes="currentProductSubtypes"
            @product-type-change="handleProductTypeChange"
          />

          <AfterSalesIssueDetails
            v-model:form-state="formState"
            :defect-categories="defectClassificationOptions"
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

          <AfterSalesPhotoUpload v-model:photos="formState.photos" />
        </div>
      </div>
    </Form>
  </Modal>
</template>
