<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { QMS_DICTIONARY_TYPE_KEYS } from '@qgs/shared';
import { Button, FormItem, message } from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenForm } from '#/adapter/form';
import {
  createSupplierMutation,
  updateSupplierMutation,
} from '#/api/qms/supplier';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import QmsFileUpload from '#/views/qms/shared/components/QmsFileUpload.vue';
import { normalizeUploadFileList } from '#/views/qms/shared/utils/upload-file';

import { useDictionaryOptions } from '../../shared/composables/useDictionaryOptions';
import { getFormSchema, mapDictionaryOptionsToSelect } from '../data';

interface OpenOptions {
  isUpdate: boolean;
  record?: QmsSupplierApi.SupplierItem;
  category: 'Outsourcing' | 'Supplier';
  values?: Partial<QmsSupplierApi.SupplierItem>;
}

interface SupplierAdmissionDocumentPayload {
  fileId?: string;
  name: string;
  size: number;
  thumbUrl?: string;
  type?: string;
  url: string;
}

const emit = defineEmits(['success']);
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const isUpdate = ref(false);
const recordId = ref<null | string>(null);
const currentCategory = ref<'Outsourcing' | 'Supplier'>('Supplier');
const admissionFileList = ref<UploadFile[]>([]);

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
    const admissionDocuments =
      normalizeUploadFileList<SupplierAdmissionDocumentPayload>(
        admissionFileList.value,
        t('qms.supplier.admissionDocuments'),
      );
    if (admissionDocuments.length === 0) {
      message.warning(
        t('ui.formRules.required', [t('qms.supplier.admissionDocuments')]),
      );
      return;
    }
    const payload = {
      ...values,
      admissionDocuments,
    };
    modalApi.setState({ confirmLoading: true });

    const result =
      isUpdate.value && recordId.value
        ? await updateSupplierMutation(recordId.value, payload)
        : await createSupplierMutation({
            ...payload,
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

function parseAdmissionDocuments(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed;
    return parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

function normalizeAdmissionFileList(value: unknown): UploadFile[] {
  return parseAdmissionDocuments(value)
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const url = String(record.url || '').trim();
      const name = String(record.name || record.originalName || url).trim();
      if (!url || !name) return null;
      const fileId = String(record.fileId || '').trim();
      return {
        uid: fileId || `${url}-${index}`,
        name,
        status: 'done',
        url,
        response: {
          code: 0,
          data: {
            fileId: fileId || undefined,
            originalName: name,
            size: Number(record.size || 0),
            thumbUrl: String(record.thumbUrl || '') || undefined,
            type: String(record.type || '') || undefined,
            url,
          },
        },
      } satisfies UploadFile;
    })
    .filter(Boolean) as UploadFile[];
}

function buildFormValues(record: QmsSupplierApi.SupplierItem) {
  return {
    ...record,
    recognizedAt: record.recognizedAt ? dayjs(record.recognizedAt) : undefined,
  };
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
    admissionFileList.value = normalizeAdmissionFileList(
      record.admissionDocuments,
    );
    await formApi.setValues(buildFormValues(record));
  } else {
    await formApi.resetForm();
    admissionFileList.value = [];
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
    <FormItem
      :label="t('qms.supplier.admissionDocuments')"
      class="supplier-admission-form-item mt-4"
      required
    >
      <div class="supplier-admission-upload">
        <QmsFileUpload v-model:file-list="admissionFileList" multiple>
          <Button>
            <template #icon>
              <span class="i-lucide-upload"></span>
            </template>
            {{ t('qms.supplier.uploadAdmissionDocuments') }}
          </Button>
        </QmsFileUpload>
      </div>
    </FormItem>
  </Modal>
</template>

<style scoped>
.supplier-admission-form-item {
  margin-left: 0;
}

.supplier-admission-upload {
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
}

.supplier-admission-upload :deep(.ant-upload-list) {
  margin-top: 8px;
}
</style>
