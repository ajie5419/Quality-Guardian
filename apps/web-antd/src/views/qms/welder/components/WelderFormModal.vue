<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { QmsWelderApi } from '#/api/qms/welder';

import { reactive, ref } from 'vue';

import { useI18n } from '@vben/locales';

import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { createWelder, updateWelder } from '#/api/qms/welder';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import TeamSelect from '#/views/qms/inspection/records/components/form/TeamSelect.vue';

import { normalizeWelderIdentity } from '../helpers';

const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const modalOpen = ref(false);
const isEditMode = ref(false);
const currentId = ref('');
const saving = ref(false);
const formState = reactive({
  certificationNo: '',
  employmentStatus: 'ON_DUTY' as 'ON_DUTY' | 'RESIGNED',
  examDate: undefined as Dayjs | undefined,
  examPassed: false,
  name: '',
  score: 12,
  team: '',
  welderCode: '',
  welding_method: '',
});

function resetForm() {
  formState.name = '';
  formState.welderCode = '';
  formState.team = '';
  formState.welding_method = '';
  formState.examDate = undefined;
  formState.examPassed = false;
  formState.employmentStatus = 'ON_DUTY';
  formState.certificationNo = '';
  formState.score = 12;
}

function openCreateModal() {
  isEditMode.value = false;
  currentId.value = '';
  resetForm();
  modalOpen.value = true;
}

function openEditModal(row: QmsWelderApi.WelderItem) {
  const identity = normalizeWelderIdentity(row);
  isEditMode.value = true;
  currentId.value = row.id;
  formState.name = identity.displayName;
  formState.welderCode = identity.displayWelderCode;
  formState.team = row.team || '';
  formState.welding_method = row.welding_method || '';
  formState.examDate = row.examDate ? dayjs(row.examDate) : undefined;
  formState.examPassed = !!row.examPassed;
  formState.employmentStatus = row.employmentStatus || 'ON_DUTY';
  formState.certificationNo = row.certificationNo || '';
  formState.score = row.score ?? 12;
  modalOpen.value = true;
}

async function handleModalOk() {
  try {
    if (!String(formState.name || '').trim()) {
      message.warning('请输入焊工姓名');
      return;
    }
    if (!String(formState.team || '').trim()) {
      message.warning('请输入所属班组');
      return;
    }
    saving.value = true;
    const payload = {
      certificationNo: formState.certificationNo || null,
      employmentStatus: formState.employmentStatus,
      examDate: formState.examDate
        ? formState.examDate.format('YYYY-MM-DD')
        : null,
      examPassed: formState.examPassed,
      name: formState.name,
      score: formState.score,
      team: formState.team,
      welderCode: formState.welderCode || null,
      welding_method: formState.welding_method || null,
    };

    if (isEditMode.value && currentId.value) {
      await updateWelder(currentId.value, payload);
      message.success(t('common.saveSuccess'));
    } else {
      await createWelder(payload);
      message.success(t('common.createSuccess'));
    }
    modalOpen.value = false;
    emit('saved');
  } catch (error) {
    handleApiError(error, 'Save Welder');
  } finally {
    saving.value = false;
  }
}

defineExpose({
  openCreateModal,
  openEditModal,
});
</script>

<template>
  <Modal
    v-model:open="modalOpen"
    :title="isEditMode ? t('common.edit') : t('common.create')"
    :confirm-loading="saving"
    @ok="handleModalOk"
    @cancel="() => (modalOpen = false)"
  >
    <Form :model="formState" layout="vertical">
      <Form.Item :label="t('qms.welder.welderCode')" name="welderCode">
        <Input v-model:value="formState.welderCode" />
      </Form.Item>
      <Form.Item
        :label="t('qms.welder.name')"
        name="name"
        :rules="[{ required: true, message: '请输入焊工姓名' }]"
      >
        <Input v-model:value="formState.name" />
      </Form.Item>
      <Form.Item
        :label="t('qms.welder.team')"
        name="team"
        :rules="[{ required: true, message: '请选择所属班组或外协单位' }]"
      >
        <TeamSelect v-model:value="formState.team" />
      </Form.Item>
      <Form.Item :label="t('qms.welder.welding_method')" name="welding_method">
        <Input
          v-model:value="formState.welding_method"
          placeholder="SMAW、GMAW、GTAW、FCAW"
        />
      </Form.Item>
      <Form.Item :label="t('qms.welder.examDate')" name="examDate">
        <DatePicker v-model:value="formState.examDate" style="width: 100%" />
      </Form.Item>
      <Form.Item
        :label="t('qms.welder.employmentStatus')"
        name="employmentStatus"
      >
        <Select
          v-model:value="formState.employmentStatus"
          :options="[
            { label: t('qms.welder.onDuty'), value: 'ON_DUTY' },
            { label: t('qms.welder.resigned'), value: 'RESIGNED' },
          ]"
        />
      </Form.Item>
      <Form.Item :label="t('qms.welder.examPassed')" name="examPassed">
        <Switch v-model:checked="formState.examPassed" />
      </Form.Item>
      <Form.Item
        :label="t('qms.welder.certificationNo')"
        name="certificationNo"
      >
        <Input v-model:value="formState.certificationNo" />
      </Form.Item>
      <Form.Item :label="t('qms.welder.score')" name="score">
        <InputNumber
          v-model:value="formState.score"
          :min="0"
          :max="12"
          style="width: 100%"
        />
      </Form.Item>
    </Form>
  </Modal>
</template>
