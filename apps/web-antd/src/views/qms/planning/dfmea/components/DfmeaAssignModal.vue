<script lang="ts" setup>
import type { Rule } from 'ant-design-vue/es/form';

import type { SystemUserApi } from '#/api/system/user';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Input, message, Modal, Select } from 'ant-design-vue';

import { createTask } from '#/api/qms/task-dispatch';

const props = defineProps<{
  open: boolean;
  targetId: null | string;
  targetName: string;
  userList: SystemUserApi.User[];
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive({
  title: '',
  leaderId: '',
});

const rules: Record<string, Rule[]> = {
  title: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
  leaderId: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [t('common.responsible')]),
      trigger: 'change',
    },
  ],
};

const userOptions = computed(() =>
  props.userList.map((user) => ({
    label: user.realName || user.username,
    value: user.id,
  })),
);

watch(
  () => props.open,
  (val) => {
    if (val) {
      const now = new Date();
      formState.title = `${props.targetName} - ${now.getMonth() + 1}${now.getDate()} 批次`;
      formState.leaderId = '';
    } else {
      formRef.value?.resetFields();
    }
  },
);

async function handleOk() {
  if (!props.targetId) return;
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;

    await createTask({
      assigneeId: formState.leaderId,
      dfmeaId: props.targetId,
      level: 1,
      priority: 3,
      title: formState.title,
      type: 'DFMEA_ACTION',
    });
    message.success(t('qms.planning.itp.assignSuccess'));
    emit('success');
    emit('update:open', false);
  } catch (error: unknown) {
    if ((error as any)?.errorFields) return;
    console.error('Assign DFMEA Error:', error);
    message.error(t('common.actionFailed'));
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('qms.planning.dfmea.assignLeader')"
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    destroy-on-close
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="pt-4"
    >
      <Form.Item :label="t('qms.planning.itp.taskSubject')" name="title">
        <Input v-model:value="formState.title" />
      </Form.Item>
      <Form.Item :label="t('common.responsible')" name="leaderId">
        <Select
          v-model:value="formState.leaderId"
          class="w-full"
          show-search
          option-filter-prop="label"
          :options="userOptions"
        />
      </Form.Item>
    </Form>
  </Modal>
</template>
