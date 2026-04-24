<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  message,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createMetrologyBorrowMutation,
  createPublicMetrologyBorrowMutation,
  matchMetrologyBorrowInstruments,
  matchPublicMetrologyBorrowInstruments,
  returnPublicMetrologyBorrowMutation,
  returnMetrologyBorrowMutation,
} from '#/api/qms/metrology';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface Props {
  initialKeyword?: string;
  publicToken?: string;
  publicMode?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'success'): void;
}>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const searchKeyword = ref('');
const loading = ref(false);
const searchLoading = ref(false);
const matchedItems = ref<QmsMetrologyApi.MetrologyBorrowInstrumentMatchItem[]>(
  [],
);
const selectedInstrument =
  ref<null | QmsMetrologyApi.MetrologyBorrowInstrumentMatchItem>(null);

const borrowForm = reactive({
  borrowedAt: '',
  borrowerDepartment: '',
  borrowerName: '',
  expectedReturnAt: '',
  remark: '',
});

const returnForm = reactive({
  remark: '',
  returnedAt: '',
});

const matchColumns = [
  {
    dataIndex: 'instrumentName',
    title: t('qms.metrology.instrumentName'),
  },
  {
    dataIndex: 'instrumentCode',
    title: t('qms.metrology.instrumentCode'),
    width: 150,
  },
  {
    dataIndex: 'model',
    title: t('qms.metrology.model'),
    width: 120,
  },
  {
    dataIndex: 'inspectionStatusLabel',
    title: t('qms.metrology.inspectionStatus'),
    width: 110,
  },
  {
    dataIndex: 'borrowStatusLabel',
    title: t('qms.metrology.borrowStatus'),
    width: 110,
  },
  {
    dataIndex: 'action',
    title: t('common.action'),
    width: 100,
  },
];

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function resetState(nextKeyword?: string) {
  searchKeyword.value = nextKeyword || '';
  matchedItems.value = [];
  selectedInstrument.value = null;
  borrowForm.borrowedAt = todayText();
  borrowForm.borrowerDepartment = '';
  borrowForm.borrowerName = '';
  borrowForm.expectedReturnAt = '';
  borrowForm.remark = '';
  returnForm.remark = '';
  returnForm.returnedAt = todayText();
}

watch(
  () => props.initialKeyword,
  async (value) => {
    resetState(value || '');
    if (value) {
      await handleSearch();
    }
  },
  { immediate: true },
);

const currentMode = computed(() => {
  if (selectedInstrument.value?.borrowStatus === 'BORROWED') {
    return 'return';
  }
  return 'borrow';
});

const borrowDisabledReason = computed(() => {
  if (!selectedInstrument.value) {
    return t('qms.metrology.borrow.selectInstrumentFirst');
  }
  if (selectedInstrument.value.borrowStatus === 'BORROWED') {
    return t('qms.metrology.borrow.alreadyBorrowed');
  }

  const inspectionStatus = selectedInstrument.value.inspectionStatus;
  if (inspectionStatus === 'DISABLED') {
    return t('qms.metrology.borrow.disabledBlocked');
  }
  if (inspectionStatus === 'EXPIRED') {
    return t('qms.metrology.borrow.expiredBlocked');
  }
  if (!borrowForm.borrowedAt) {
    return t('qms.metrology.borrow.borrowedAtRequired');
  }
  if (!borrowForm.borrowerDepartment.trim()) {
    return t('qms.metrology.borrow.borrowerDepartmentRequired');
  }
  if (!borrowForm.borrowerName.trim()) {
    return t('qms.metrology.borrow.borrowerNameRequired');
  }

  return '';
});

const canBorrowSelected = computed(() => !borrowDisabledReason.value);

const canReturnSelected = computed(() =>
  Boolean(
    selectedInstrument.value?.borrowStatus === 'BORROWED' &&
      selectedInstrument.value.currentBorrowRecordId,
  ),
);

function getInspectionStatusColor(
  status: QmsMetrologyApi.MetrologyInspectionStatus,
) {
  switch (status) {
    case 'DISABLED': {
      return 'default';
    }
    case 'EXPIRED': {
      return 'red';
    }
    case 'VALID': {
      return 'green';
    }
    default: {
      return 'orange';
    }
  }
}

function getBorrowStatusColor(status: QmsMetrologyApi.MetrologyBorrowStatus) {
  return status === 'BORROWED' ? 'blue' : 'default';
}

/**
 * 统一二维码只负责把人带进借还入口，不承载量具身份。
 * 这里必须先匹配台账标准对象，再允许借/还，避免自由文本直接污染借用记录。
 */
async function handleSearch() {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    matchedItems.value = [];
    selectedInstrument.value = null;
    return;
  }

  searchLoading.value = true;
  try {
    matchedItems.value = props.publicMode
      ? await matchPublicMetrologyBorrowInstruments(keyword, props.publicToken)
      : await matchMetrologyBorrowInstruments(keyword);
    selectedInstrument.value = matchedItems.value[0] || null;
  } catch (error) {
    handleApiError(error, 'Match Metrology Borrow Instruments');
  } finally {
    searchLoading.value = false;
  }
}

function handleSelectInstrument(
  item: QmsMetrologyApi.MetrologyBorrowInstrumentMatchItem,
) {
  selectedInstrument.value = item;
  returnForm.returnedAt = todayText();
}

async function handleBorrowSubmit() {
  if (!selectedInstrument.value || !canBorrowSelected.value) {
    return;
  }

  loading.value = true;
  try {
    const payload = {
      borrowedAt: borrowForm.borrowedAt,
      borrowerDepartment: borrowForm.borrowerDepartment,
      borrowerName: borrowForm.borrowerName,
      expectedReturnAt: borrowForm.expectedReturnAt || null,
      instrumentId: selectedInstrument.value.id,
      remark: borrowForm.remark || null,
      ...(props.publicToken ? { token: props.publicToken } : {}),
    };
    if (props.publicMode) {
      await createPublicMetrologyBorrowMutation(payload);
    } else {
      await createMetrologyBorrowMutation(payload);
    }
    message.success(t('qms.metrology.borrow.borrowSuccess'));
    resetState('');
    emit('success');
  } catch (error) {
    handleApiError(error, 'Create Metrology Borrow');
  } finally {
    loading.value = false;
  }
}

async function handleReturnSubmit() {
  if (
    !selectedInstrument.value?.currentBorrowRecordId ||
    !canReturnSelected.value
  ) {
    return;
  }

  loading.value = true;
  try {
    const payload = {
      remark: returnForm.remark || null,
      returnedAt: returnForm.returnedAt,
      ...(props.publicToken ? { token: props.publicToken } : {}),
    };
    if (props.publicMode) {
      await returnPublicMetrologyBorrowMutation(
        selectedInstrument.value.currentBorrowRecordId,
        payload,
      );
    } else {
      await returnMetrologyBorrowMutation(
        selectedInstrument.value.currentBorrowRecordId,
        payload,
      );
    }
    message.success(t('qms.metrology.borrow.returnSuccess'));
    resetState('');
    emit('success');
  } catch (error) {
    handleApiError(error, 'Return Metrology Borrow');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Alert
      :message="t('qms.metrology.borrow.entryHint')"
      show-icon
      type="info"
    />

    <div class="flex gap-2">
      <Input
        v-model:value="searchKeyword"
        :placeholder="t('qms.metrology.borrow.entryPlaceholder')"
        @press-enter="handleSearch"
      />
      <Button :loading="searchLoading" type="primary" @click="handleSearch">
        {{ t('common.search') }}
      </Button>
    </div>

    <Table
      :columns="matchColumns"
      :data-source="matchedItems"
      :loading="searchLoading"
      :pagination="false"
      :row-key="
        (record: QmsMetrologyApi.MetrologyBorrowInstrumentMatchItem) =>
          record.id
      "
      :scroll="{ y: 220 }"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'inspectionStatusLabel'">
          <Tag :color="getInspectionStatusColor(record.inspectionStatus)">
            {{ record.inspectionStatusLabel }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'borrowStatusLabel'">
          <Tag :color="getBorrowStatusColor(record.borrowStatus)">
            {{ record.borrowStatusLabel }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Button
            size="small"
            type="link"
            @click="
              handleSelectInstrument(
                record as QmsMetrologyApi.MetrologyBorrowInstrumentMatchItem,
              )
            "
          >
            {{ t('common.select') }}
          </Button>
        </template>
      </template>
    </Table>

    <div
      v-if="selectedInstrument"
      class="rounded-2xl border border-gray-200 bg-gray-50 p-4"
    >
      <Descriptions :column="2" bordered size="small">
        <Descriptions.Item :label="t('qms.metrology.instrumentName')">
          {{ selectedInstrument.instrumentName }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.instrumentCode')">
          {{ selectedInstrument.instrumentCode }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.model')">
          {{ selectedInstrument.model || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.usingUnit')">
          {{ selectedInstrument.usingUnit || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.inspectionStatus')">
          <Tag
            :color="
              getInspectionStatusColor(selectedInstrument.inspectionStatus)
            "
          >
            {{ selectedInstrument.inspectionStatusLabel }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.borrowStatus')">
          <Tag :color="getBorrowStatusColor(selectedInstrument.borrowStatus)">
            {{ selectedInstrument.borrowStatusLabel }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.borrow.currentBorrower')">
          {{
            selectedInstrument.currentBorrowerName
              ? `${selectedInstrument.currentBorrowerDepartment || '-'} / ${selectedInstrument.currentBorrowerName}`
              : '-'
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.metrology.validUntil')">
          {{ selectedInstrument.validUntil || '-' }}
        </Descriptions.Item>
      </Descriptions>
    </div>

    <Alert
      v-if="selectedInstrument?.inspectionStatus === 'PENDING'"
      :message="t('qms.metrology.borrow.pendingHint')"
      show-icon
      type="warning"
    />

    <Alert
      v-if="
        selectedInstrument &&
        ['DISABLED', 'EXPIRED'].includes(selectedInstrument.inspectionStatus)
      "
      :message="t('qms.metrology.borrow.borrowBlocked')"
      show-icon
      type="error"
    />

    <Alert
      v-if="selectedInstrument?.borrowStatus === 'BORROWED'"
      :message="t('qms.metrology.borrow.returnHint')"
      show-icon
      type="info"
    />

    <Form
      v-if="selectedInstrument && currentMode === 'borrow'"
      :label-col="{ span: 5 }"
      :wrapper-col="{ span: 19 }"
      layout="horizontal"
    >
      <Form.Item :label="t('qms.metrology.borrow.borrowedAt')" required>
        <DatePicker
          v-model:value="borrowForm.borrowedAt"
          class="w-full"
          value-format="YYYY-MM-DD"
        />
      </Form.Item>
      <Form.Item :label="t('qms.metrology.borrow.borrowerDepartment')" required>
        <Input v-model:value="borrowForm.borrowerDepartment" />
      </Form.Item>
      <Form.Item :label="t('qms.metrology.borrow.borrowerName')" required>
        <Input v-model:value="borrowForm.borrowerName" />
      </Form.Item>
      <Form.Item :label="t('qms.metrology.borrow.expectedReturnAt')">
        <DatePicker
          v-model:value="borrowForm.expectedReturnAt"
          class="w-full"
          value-format="YYYY-MM-DD"
        />
      </Form.Item>
      <Form.Item :label="t('common.remark')">
        <Input.TextArea v-model:value="borrowForm.remark" :rows="3" />
      </Form.Item>
      <Form.Item :wrapper-col="{ offset: 5, span: 19 }">
        <Button
          :disabled="!canBorrowSelected"
          :loading="loading"
          type="primary"
          @click="handleBorrowSubmit"
        >
          {{ t('qms.metrology.borrow.actions.borrow') }}
        </Button>
        <div v-if="borrowDisabledReason" class="mt-2 text-sm text-gray-500">
          {{ borrowDisabledReason }}
        </div>
      </Form.Item>
    </Form>

    <Form
      v-else-if="selectedInstrument && currentMode === 'return'"
      :label-col="{ span: 5 }"
      :wrapper-col="{ span: 19 }"
      layout="horizontal"
    >
      <Form.Item :label="t('qms.metrology.borrow.returnedAt')" required>
        <DatePicker
          v-model:value="returnForm.returnedAt"
          class="w-full"
          value-format="YYYY-MM-DD"
        />
      </Form.Item>
      <Form.Item :label="t('common.remark')">
        <Input.TextArea v-model:value="returnForm.remark" :rows="3" />
      </Form.Item>
      <Form.Item :wrapper-col="{ offset: 5, span: 19 }">
        <Button
          :disabled="!canReturnSelected"
          :loading="loading"
          type="primary"
          @click="handleReturnSubmit"
        >
          {{ t('qms.metrology.borrow.actions.return') }}
        </Button>
      </Form.Item>
    </Form>
  </div>
</template>
