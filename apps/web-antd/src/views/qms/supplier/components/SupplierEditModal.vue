<script lang="ts" setup>
import type { QmsSupplierApi } from '#/api/qms/supplier';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createSupplier, updateSupplier } from '#/api/qms/supplier';

import { getFormSchema } from '../data';

interface OpenOptions {
  isUpdate: boolean;
  record?: QmsSupplierApi.SupplierItem;
  category: 'Outsourcing' | 'Supplier';
  values?: Partial<QmsSupplierApi.SupplierItem>;
}

const emit = defineEmits(['success']);
const { t } = useI18n();

const isUpdate = ref(false);
const recordId = ref<null | string>(null);
const currentCategory = ref<'Outsourcing' | 'Supplier'>('Supplier');

const [Form, formApi] = useVbenForm({
  schema: [], // Will be updated dynamically
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  onConfirm: handleSubmit,
});

async function handleSubmit() {
  try {
    const { valid } = await formApi.validate();
    if (!valid) return;

    const values = await formApi.getValues();
    modalApi.setState({ confirmLoading: true });

    await (isUpdate.value && recordId.value
      ? updateSupplier(recordId.value, values)
      : createSupplier({ ...values, category: currentCategory.value }));

    message.success(t('common.saveSuccess'));
    modalApi.close();
    emit('success');
  } catch (error) {
    console.error('Submit failed:', error);
  } finally {
    modalApi.setState({ confirmLoading: false });
  }
}

async function open(options: OpenOptions) {
  const {
    isUpdate: update,
    record,
    category = 'Supplier',
    values: defaultValues,
  } = options;

  isUpdate.value = update;
  currentCategory.value = category;
  recordId.value = record?.id || null;

  // Update schema based on category
  formApi.setState({ schema: getFormSchema(category) });

  // Set title
  const entityName =
    category === 'Supplier'
      ? t('qms.supplier.entityName')
      : t('qms.outsourcing.entityName');
  const title = isUpdate.value
    ? `${t('common.edit')}${entityName}`
    : `${t('common.create')}${entityName}`;
  modalApi.setState({ title });

  modalApi.open();

  // Handle values after modal is open to ensure form is ready
  if (isUpdate.value && record) {
    await formApi.setValues(record);
  } else {
    await formApi.resetForm();
    if (defaultValues) {
      await formApi.setValues(defaultValues);
    }
  }
}

defineExpose({
  open,
});
</script>

<template>
  <Modal>
    <Form />
  </Modal>
</template>
