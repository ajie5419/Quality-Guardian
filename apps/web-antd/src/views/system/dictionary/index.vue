<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { DictionaryItem } from '#/api/system/dictionary';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  SelectOption,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createDictionary,
  deleteDictionary,
  getDictionaryList,
  updateDictionary,
} from '#/api/system/dictionary';
import { SysStatusEnum } from '#/api/system/enums';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useDictionaryTypeOptions } from '#/views/system/dictionary/composables/useDictionaryTypeOptions';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const { handleApiError } = useErrorHandler();

const canCreate = computed(
  () =>
    hasAccessByCodes(['System:Dictionary:Create']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:Dictionary:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canDelete = computed(
  () =>
    hasAccessByCodes(['System:Dictionary:Delete']) ||
    hasAccessByRoles(['super', 'admin']),
);

const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const {
  optionSet: dictTypeSet,
  options: dictTypeOptions,
  loadOptions: loadDictTypeOptions,
} = useDictionaryTypeOptions(handleApiError);
const dictTypeLabelMap = computed(
  () =>
    new Map(
      dictTypeOptions.value.map((item) => [String(item.value), item.label]),
    ),
);

const formState = reactive({
  dictType: '',
  dictKey: '',
  dictValue: '',
  remark: '',
  sort: 0,
  status: 1,
});

const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    { type: 'seq', title: t('common.seq'), width: 60 },
    {
      field: 'dictType',
      title: t('sys.dictionary.dictType'),
      minWidth: 150,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        dictTypeLabelMap.value.get(String(cellValue)) ||
        String(cellValue || ''),
    },
    {
      field: 'dictKey',
      title: t('sys.dictionary.dictKey'),
      minWidth: 140,
    },
    {
      field: 'dictValue',
      title: t('sys.dictionary.dictValue'),
      minWidth: 180,
    },
    {
      field: 'sort',
      title: t('sys.dictionary.sort'),
      width: 80,
    },
    {
      field: 'status',
      title: t('common.status'),
      width: 100,
      slots: { default: 'status' },
    },
    {
      field: 'remark',
      title: t('common.remark'),
      minWidth: 160,
    },
    {
      field: 'createdAt',
      title: t('common.createTime'),
      width: 180,
    },
    {
      field: 'updatedAt',
      title: t('common.updateTime'),
      width: 180,
    },
    {
      title: t('common.action'),
      width: 140,
      fixed: 'right',
      cellRender: {
        name: 'CellOperation',
        props: {
          options: [
            ...(canEdit.value ? ['edit'] : []),
            ...(canDelete.value ? ['delete'] : []),
          ],
          onClick: ({ code, row }: { code: string; row: DictionaryItem }) => {
            if (code === 'edit') handleEdit(row);
            if (code === 'delete') handleDelete(row);
          },
        },
      },
    },
  ],
  toolbarConfig: {
    export: true,
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  exportConfig: {
    remote: true,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  proxyConfig: {
    ajax: {
      query: async ({
        page,
      }: {
        page: { currentPage: number; pageSize: number };
      }) => {
        const res = await getDictionaryList({
          page: page.currentPage,
          pageSize: page.pageSize,
        });
        return res;
      },
      queryAll: async ({ formValues }: any) => {
        const res = await getDictionaryList({
          page: 1,
          pageSize: 100_000,
          ...formValues,
        });
        return { items: res.items || [] };
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions: gridOptions as any });

function handleOpenModal() {
  isEditMode.value = false;
  currentId.value = null;
  Object.assign(formState, {
    dictType: '',
    dictKey: '',
    dictValue: '',
    remark: '',
    sort: 0,
    status: 1,
  });
  isModalVisible.value = true;
}

function handleEdit(row: DictionaryItem) {
  isEditMode.value = true;
  currentId.value = row.id;
  Object.assign(formState, {
    dictType: row.dictType,
    dictKey: row.dictKey,
    dictValue: row.dictValue,
    remark: row.remark || '',
    sort: row.sort || 0,
    status: row.status ?? 1,
  });
  isModalVisible.value = true;
}

function handleDelete(row: DictionaryItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: `${t('common.confirmDelete')} "${row.dictType}/${row.dictKey}" ?`,
    onOk: async () => {
      try {
        await deleteDictionary(row.id);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Delete Dictionary');
      }
    },
  });
}

async function handleSubmit() {
  if (!formState.dictType.trim() || !formState.dictKey.trim()) {
    message.warning(t('common.pleaseCompleteInfo'));
    return;
  }
  if (!formState.dictValue.trim()) {
    message.warning(t('common.pleaseInput'));
    return;
  }
  if (!dictTypeSet.value.has(formState.dictType.trim())) {
    message.warning('Dictionary type is not allowed');
    return;
  }

  const payload = {
    dictType: formState.dictType,
    dictKey: formState.dictKey,
    dictValue: formState.dictValue,
    sort: Number(formState.sort || 0),
    status: Number(formState.status ?? 1),
    remark: formState.remark || '',
  };

  try {
    if (isEditMode.value && currentId.value) {
      await updateDictionary(currentId.value, payload);
      message.success(t('common.updateSuccess'));
    } else {
      await createDictionary(payload);
      message.success(t('common.addSuccess'));
    }
    isModalVisible.value = false;
    gridApi.reload();
  } catch (error) {
    handleApiError(
      error,
      isEditMode.value ? 'Update Dictionary' : 'Create Dictionary',
    );
  }
}

onMounted(() => {
  void loadDictTypeOptions();
});
</script>

<template>
  <Page>
    <Grid>
      <template #toolbar-actions>
        <Button v-if="canCreate" type="primary" @click="handleOpenModal">
          {{ t('common.add') }}
        </Button>
      </template>

      <template #status="{ row }">
        <span
          v-if="row.status === SysStatusEnum.ENABLED"
          class="text-green-500"
        >
          {{ t('common.enabled') }}
        </span>
        <span v-else class="text-red-500">{{ t('common.disabled') }}</span>
      </template>
    </Grid>

    <Modal
      v-model:open="isModalVisible"
      :title="isEditMode ? t('common.edit') : t('common.add')"
      width="560px"
      @ok="handleSubmit"
    >
      <Form layout="vertical" class="pt-4">
        <div class="grid grid-cols-2 gap-3">
          <FormItem :label="t('sys.dictionary.dictType')" required>
            <Select
              v-model:value="formState.dictType"
              :disabled="isEditMode"
              show-search
              :options="dictTypeOptions"
              :placeholder="t('sys.dictionary.dictTypePlaceholder')"
            />
          </FormItem>

          <FormItem :label="t('sys.dictionary.dictKey')" required>
            <Input
              v-model:value="formState.dictKey"
              :placeholder="t('sys.dictionary.dictKeyPlaceholder')"
            />
          </FormItem>

          <FormItem :label="t('sys.dictionary.dictValue')" required>
            <Input
              v-model:value="formState.dictValue"
              :placeholder="t('sys.dictionary.dictValuePlaceholder')"
            />
          </FormItem>

          <FormItem :label="t('sys.dictionary.sort')">
            <InputNumber
              v-model:value="formState.sort"
              :min="0"
              class="w-full"
            />
          </FormItem>

          <FormItem :label="t('common.status')">
            <Select v-model:value="formState.status">
              <SelectOption :value="1">{{ t('common.enabled') }}</SelectOption>
              <SelectOption :value="0">{{ t('common.disabled') }}</SelectOption>
            </Select>
          </FormItem>
        </div>

        <FormItem :label="t('common.remark')">
          <Input.TextArea
            v-model:value="formState.remark"
            :rows="3"
            :placeholder="t('sys.user.remarkPlaceholder')"
          />
        </FormItem>
        <div
          class="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700"
        >
          Dictionary updates are restricted to whitelisted `dictType` values to
          prevent invalid mappings.
        </div>
      </Form>
    </Modal>
  </Page>
</template>
