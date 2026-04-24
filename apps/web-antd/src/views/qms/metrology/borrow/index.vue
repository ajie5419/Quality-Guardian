<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  message,
  Modal,
  Space,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getMetrologyBorrowListPage,
  getMetrologyBorrowOverview,
  returnMetrologyBorrowMutation,
} from '#/api/qms/metrology';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';

import MetrologyBorrowEntryAccessCard from './components/MetrologyBorrowEntryAccessCard.vue';
import MetrologyBorrowMonthlyDistributionChart from './components/MetrologyBorrowMonthlyDistributionChart.vue';
import MetrologyBorrowOverviewCards from './components/MetrologyBorrowOverviewCards.vue';
import MetrologyBorrowUpcomingTable from './components/MetrologyBorrowUpcomingTable.vue';
import { getColumns, getSearchFormSchema } from './data';

const { t } = useI18n();
const router = useRouter();
const { handleApiError } = useErrorHandler();
const { canCreate, canList, hasAccessByCodes } = useQmsPermissions(
  'QMS:Metrology:Borrow',
);

const canCreateAction = computed(() => canCreate.value || canList.value);
const canReturnAction = computed(
  () => hasAccessByCodes(['QMS:Metrology:Borrow:Return']) || canList.value,
);
const latestQueryFormValues = ref<Record<string, unknown>>({});
const overviewLoading = ref(false);
const overview = ref<QmsMetrologyApi.MetrologyBorrowOverview>({
  monthlyDistribution: [],
  summary: {
    borrowedCount: 0,
    overdueCount: 0,
    todayBorrowedCount: 0,
    todayReturnedCount: 0,
    totalCount: 0,
    upcomingReturnCount: 0,
  },
  upcomingItems: [],
});

async function loadOverview() {
  overviewLoading.value = true;
  try {
    overview.value = await getMetrologyBorrowOverview({
      borrowerDepartment:
        String(latestQueryFormValues.value.borrowerDepartment || '').trim() ||
        undefined,
      borrowerName:
        String(latestQueryFormValues.value.borrowerName || '').trim() ||
        undefined,
      keyword:
        String(latestQueryFormValues.value.keyword || '').trim() || undefined,
    });
  } catch (error) {
    handleApiError(error, 'Load Metrology Borrow Overview');
  } finally {
    overviewLoading.value = false;
  }
}

const gridOptions = computed<VxeGridProps>(() => ({
  columns: getColumns(),
  height: 620,
  keepSource: true,
  pagerConfig: {
    pageSize: 20,
    pageSizes: [10, 20, 50, 100],
  },
  sortConfig: {
    remote: true,
    trigger: 'cell',
  },
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    custom: true,
    refresh: true,
    search: true,
    zoom: true,
  },
  proxyConfig: {
    autoLoad: true,
    sort: true,
    ajax: {
      query: async ({ page, sorts }, formValues) => {
        try {
          latestQueryFormValues.value = (formValues || {}) as Record<
            string,
            unknown
          >;
          await loadOverview();
          return await getMetrologyBorrowListPage({
            ...(formValues as Record<string, unknown>),
            page: page?.currentPage,
            pageSize: page?.pageSize,
            sortBy: sorts?.[0]?.field,
            sortOrder: sorts?.[0]?.order as 'asc' | 'desc' | undefined,
          });
        } catch (error) {
          handleApiError(error, 'Load Metrology Borrow List');
          return { items: [], total: 0 };
        }
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions:
    gridOptions.value as VxeGridProps<QmsMetrologyApi.MetrologyBorrowRecordItem>,
  formOptions: {
    schema: getSearchFormSchema(),
    submitOnChange: true,
  },
});

function getStatusColor(status: QmsMetrologyApi.MetrologyBorrowRecordStatus) {
  switch (status) {
    case 'OVERDUE': {
      return 'red';
    }
    case 'RETURN_PENDING': {
      return 'orange';
    }
    case 'RETURNED': {
      return 'green';
    }
    default: {
      return 'blue';
    }
  }
}

function openBorrowEntry(keyword = '') {
  void router.push({
    path: '/qms/metrology/borrow/entry',
    query: keyword ? { keyword } : undefined,
  });
}

function handleReturn(row: QmsMetrologyApi.MetrologyBorrowRecordItem) {
  if (row.status === 'RETURNED') {
    return;
  }
  const returnedAt = new Date().toISOString().slice(0, 10);
  void returnMetrologyBorrowMutation(row.id, {
    remark: row.remark || null,
    returnedAt,
  })
    .then(async () => {
      message.success(t('qms.metrology.borrow.returnSuccess'));
      await loadOverview();
      gridApi.query();
    })
    .catch((error) => {
      handleApiError(error, 'Return Metrology Borrow');
    });
}

function handleOverviewOpen(payload: {
  status?: QmsMetrologyApi.MetrologyBorrowRecordStatus;
}) {
  const nextFormValues = {
    ...latestQueryFormValues.value,
    ...(payload.status ? { status: payload.status } : { status: undefined }),
  };
  latestQueryFormValues.value = nextFormValues;
  gridApi.formApi?.setValues(nextFormValues);
  gridApi.query();
}

function handleToolbarManual() {
  openBorrowEntry();
}

function handleToolbarScan() {
  openBorrowEntry();
}

function handleUpcomingOpen(record: QmsMetrologyApi.MetrologyBorrowRecordItem) {
  openBorrowEntry(record.instrumentCode);
}

function handleOpenOverdue() {
  handleOverviewOpen({ status: 'OVERDUE' });
}

function confirmReturn(row: QmsMetrologyApi.MetrologyBorrowRecordItem) {
  Modal.confirm({
    title:
      row.status === 'RETURN_PENDING'
        ? t('qms.metrology.borrow.actions.confirmReceived')
        : t('qms.metrology.borrow.actions.return'),
    content: `${row.instrumentName} / ${row.instrumentCode}`,
    onOk() {
      handleReturn(row);
    },
  });
}
</script>

<template>
  <Page :title="t('qms.metrology.borrow.title')">
    <div class="m-4 flex flex-col gap-5">
      <MetrologyBorrowOverviewCards
        :loading="overviewLoading"
        :summary="overview.summary"
        @open="handleOverviewOpen"
      />

      <Alert
        v-if="Number(overview.summary.overdueCount || 0) > 0"
        :message="
          t('qms.metrology.borrow.overdueReminder', {
            count: overview.summary.overdueCount,
          })
        "
        show-icon
        type="warning"
      >
        <template #action>
          <Button size="small" type="primary" @click="handleOpenOverdue">
            {{ t('qms.metrology.borrow.viewOverdue') }}
          </Button>
        </template>
      </Alert>

      <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,2fr)_420px]">
        <div class="min-w-0">
          <MetrologyBorrowMonthlyDistributionChart
            :data="overview.monthlyDistribution"
          />
        </div>
        <div class="flex min-w-0 flex-col gap-4">
          <MetrologyBorrowEntryAccessCard />
          <MetrologyBorrowUpcomingTable
            :items="overview.upcomingItems"
            :loading="overviewLoading"
            @open="handleUpcomingOpen"
          />
        </div>
      </div>

      <Card :body-style="{ padding: '16px' }" class="rounded-2xl shadow-sm">
        <Grid>
          <template #toolbar-actions>
            <Space>
              <Button
                v-if="canCreateAction"
                type="primary"
                @click="handleToolbarScan"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:scan-line" />
                </template>
                {{ t('qms.metrology.borrow.actions.scan') }}
              </Button>
              <Button v-if="canCreateAction" @click="handleToolbarManual">
                {{ t('qms.metrology.borrow.actions.manual') }}
              </Button>
            </Space>
          </template>

          <template #status="{ row }">
            <Tag :color="getStatusColor(row.status)">
              {{ row.statusLabel }}
            </Tag>
          </template>

          <template #action="{ row }">
            <Button
              v-if="canReturnAction && row.status !== 'RETURNED'"
              type="link"
              @click="confirmReturn(row)"
            >
              {{
                row.status === 'RETURN_PENDING'
                  ? t('qms.metrology.borrow.actions.confirmReceived')
                  : t('qms.metrology.borrow.actions.return')
              }}
            </Button>
          </template>
        </Grid>
      </Card>
    </div>
  </Page>
</template>
