<script lang="ts" setup>
import type { QmsPlanningApi } from '#/api/qms/planning';
import type { Rule } from 'ant-design-vue/es/form';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
} from 'ant-design-vue';

import { createItp, updateItp } from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { CONTROL_POINT_MAP } from '../../constants';

const props = defineProps<{
  currentItemId: null | string;
  initialData: Partial<QmsPlanningApi.ItpItem>;
  isEditMode: boolean;
  open: boolean;
  selectedProjectId: null | string;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const confirmLoading = ref(false);
const formRef = ref();

const processOptions = [
  '外购件',
  '原材料',
  '辅材',
  '机加成品件',
  '下料',
  '组对',
  '焊接',
  '焊后尺寸',
  '外观',
  '整体拼装',
  '组装',
  '装配',
  '组拼',
  '打砂',
  '喷漆',
].map((opt) => ({ label: opt, value: opt }));

const controlPointOptions = computed(() =>
  Object.entries(CONTROL_POINT_MAP).map(([key, val]) => ({
    label: val.label,
    value: key,
  })),
);

const formState = reactive<Partial<QmsPlanningApi.ItpItem>>({
  processStep: '组对',
  activity: '',
  controlPoint: 'W',
  isQuantitative: false,
  frequency: '100%',
  verifyingDocument: '',
  acceptanceCriteria: '',
  quantitativeItems: [
    { standardValue: 0, upperTolerance: 0, lowerTolerance: 0, unit: '' },
  ],
});

const rules: Record<string, Rule[]> = {
  processStep: [
    { required: true, message: t('common.pleaseSelect'), trigger: 'change' },
  ],
  activity: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
  controlPoint: [
    { required: true, message: t('common.pleaseSelect'), trigger: 'change' },
  ],
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      Object.assign(formState, {
        processStep: props.initialData.processStep || '组对',
        activity: props.initialData.activity || '',
        controlPoint: props.initialData.controlPoint || 'W',
        isQuantitative: props.initialData.isQuantitative ?? false,
        frequency: props.initialData.frequency || '100%',
        verifyingDocument: props.initialData.verifyingDocument || '',
        acceptanceCriteria: props.initialData.acceptanceCriteria || '',
        quantitativeItems: props.initialData.quantitativeItems || [
          { standardValue: 0, upperTolerance: 0, lowerTolerance: 0, unit: '' },
        ],
      });
    } else {
      formRef.value?.resetFields();
    }
  },
);

function addQuantitativeItem() {
  if (!formState.quantitativeItems) formState.quantitativeItems = [];
  formState.quantitativeItems.push({
    standardValue: 0,
    upperTolerance: 0,
    lowerTolerance: 0,
    unit: '',
  });
}

function removeQuantitativeItem(index: number) {
  formState.quantitativeItems?.splice(index, 1);
}

async function handleOk() {
  if (!props.selectedProjectId) return;
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;

    const payload = { ...formState, projectId: props.selectedProjectId };
    await (props.isEditMode && props.currentItemId
      ? updateItp(props.currentItemId, payload as QmsPlanningApi.ItpItem)
      : createItp(payload as QmsPlanningApi.ItpItem));
    message.success(t('common.saveSuccess'));
    emit('success');
    emit('update:open', false);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'errorFields' in error)
      return;
    handleApiError(error, 'Save ITP Item');
    message.error(t('common.actionFailed'));
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="
      isEditMode
        ? t('qms.planning.itp.editStep')
        : t('qms.planning.itp.addStep')
    "
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    width="800px"
    destroy-on-close
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="pt-4"
    >
      <div class="grid grid-cols-2 gap-4">
        <Form.Item
          :label="t('qms.planning.itp.processStep')"
          name="processStep"
        >
          <Select
            v-model:value="formState.processStep"
            :options="processOptions"
          />
        </Form.Item>
        <Form.Item
          :label="t('qms.planning.itp.controlPoint.label')"
          name="controlPoint"
        >
          <Select
            v-model:value="formState.controlPoint"
            :options="controlPointOptions"
          />
        </Form.Item>
      </div>

      <Form.Item :label="t('qms.planning.itp.activity')" name="activity">
        <Input
          v-model:value="formState.activity"
          :placeholder="t('common.pleaseInput')"
        />
      </Form.Item>

      <Form.Item
        :label="t('qms.planning.itp.criteria')"
        name="acceptanceCriteria"
      >
        <Input.TextArea
          v-model:value="formState.acceptanceCriteria"
          :placeholder="t('common.pleaseInput')"
        />
      </Form.Item>

      <div class="grid grid-cols-2 gap-4">
        <Form.Item :label="t('qms.planning.itp.frequency')" name="frequency">
          <Input v-model:value="formState.frequency" />
        </Form.Item>
        <Form.Item
          :label="t('qms.planning.itp.verifyingDocument')"
          name="verifyingDocument"
        >
          <Input v-model:value="formState.verifyingDocument" />
        </Form.Item>
      </div>

      <Form.Item
        :label="t('qms.planning.itp.quantitative')"
        name="isQuantitative"
      >
        <Switch v-model:checked="formState.isQuantitative" />
      </Form.Item>

      <div
        v-if="formState.isQuantitative"
        class="space-y-2 rounded border bg-gray-50 p-4"
      >
        <div
          v-for="(item, index) in formState.quantitativeItems"
          :key="index"
          class="grid grid-cols-5 items-end gap-2"
        >
          <div>
            <label class="text-xs text-gray-500">{{
              t('qms.planning.itp.standardValue')
            }}</label>
            <InputNumber v-model:value="item.standardValue" class="w-full" />
          </div>
          <div>
            <label class="text-xs text-gray-500">上公差</label>
            <InputNumber v-model:value="item.upperTolerance" class="w-full" />
          </div>
          <div>
            <label class="text-xs text-gray-500">下公差</label>
            <InputNumber v-model:value="item.lowerTolerance" class="w-full" />
          </div>
          <div>
            <label class="text-xs text-gray-500">单位</label>
            <Input v-model:value="item.unit" class="w-full" />
          </div>
          <Button danger @click="removeQuantitativeItem(index)">-</Button>
        </div>
        <Button type="dashed" block @click="addQuantitativeItem"
          >+ {{ t('qms.planning.itp.quantitative') }}</Button
        >
      </div>
    </Form>
  </Modal>
</template>
