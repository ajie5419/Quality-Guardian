<script lang="ts" setup>
import type { QmsSupplierApi } from '#/api/qms/supplier';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { QMS_DICTIONARY_TYPE_KEYS } from '@qgs/shared';
import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createSupplierMutation,
  updateSupplierMutation,
} from '#/api/qms/supplier';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { useDictionaryOptions } from '../../shared/composables/useDictionaryOptions';
import { getFormSchema, mapDictionaryOptionsToSelect } from '../data';

interface OpenOptions {
  isUpdate: boolean;
  record?: QmsSupplierApi.SupplierItem;
  category: 'Outsourcing' | 'Supplier';
  values?: Partial<QmsSupplierApi.SupplierItem>;
}

const emit = defineEmits(['success']);
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const isUpdate = ref(false);
const recordId = ref<null | string>(null);
const currentCategory = ref<'Outsourcing' | 'Supplier'>('Supplier');

const [Form, formApi] = useVbenForm({
  schema: [], // Will be updated dynamically
  showDefaultActions: false,
});
const {
  options: supplierStatusOptions,
  loadOptions: loadSupplierStatusOptions,
} = useDictionaryOptions({
  dictType: QMS_DICTIONARY_TYPE_KEYS.supplierStatus,
  fallbackOptions: mapDictionaryOptionsToSelect(),
  mapOptions: mapDictionaryOptionsToSelect,
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

    const result =
      isUpdate.value && recordId.value
        ? await updateSupplierMutation(recordId.value, values)
        : await createSupplierMutation({
            ...values,
            category: currentCategory.value,
          });

    message.success(result.message || t('common.saveSuccess'));
    modalApi.close();
    emit('success');
  } catch (error) {
    handleApiError(error, 'Save Supplier');
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

  // Update schema based on category. Dictionary options take priority with local fallback.
  await loadSupplierStatusOptions();
  formApi.setState({
    schema: getFormSchema(category, supplierStatusOptions.value),
  });

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
