<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsWelderApi } from '#/api/qms/welder';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
  Statistic,
  Switch,
  Tag,
  Upload,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createWelder,
  deleteWelder,
  getWelderListPage,
  importWelders,
  updateWelder,
} from '#/api/qms/welder';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { readImportRowsFromFile } from '#/utils/import-sheet';
import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';
import TeamSelect from '#/views/qms/inspection/records/components/form/TeamSelect.vue';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canDelete, canEdit, canImport } =
  useQmsPermissions('QMS:Welder');
const canImportAction = computed(
  () => canImport.value || canCreate.value || canEdit.value,
);

const checkedRows = ref<QmsWelderApi.WelderItem[]>([]);
const stats = ref<QmsWelderApi.WelderStats>({
  averageScore: '0.0',
  certifiedCount: 0,
  examPassedCount: 0,
  total: 0,
  warningCount: 0,
});

const modalOpen = ref(false);
const isEditMode = ref(false);
const currentId = ref<string>('');
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
});

function resolveScoreTagColor(score: number) {
  if (score >= 10) return 'green';
  if (score >= 7) return 'gold';
  return 'red';
}

function resolveScoreLevel(score: number) {
  if (score >= 10) return t('qms.welder.scoreLevel.safe');
  if (score >= 7) return t('qms.welder.scoreLevel.warning');
  return t('qms.welder.scoreLevel.danger');
}

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsWelderApi.WelderItem>,
) {
  checkedRows.value = params.$grid.getCheckboxRecords() || [];
}

function resetForm() {
  formState.name = '';
  formState.welderCode = '';
  formState.team = '';
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
  isEditMode.value = true;
  currentId.value = row.id;
  formState.name = row.name || '';
  formState.welderCode = row.welderCode || '';
  formState.team = row.team || '';
  formState.examDate = row.examDate ? dayjs(row.examDate) : undefined;
  formState.examPassed = !!row.examPassed;
  formState.employmentStatus = row.employmentStatus || 'ON_DUTY';
  formState.certificationNo = row.certificationNo || '';
  formState.score = row.score ?? 12;
  modalOpen.value = true;
}

function handleDelete(row: QmsWelderApi.WelderItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk: async () => {
      try {
        await deleteWelder(row.id);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Delete Welder');
      }
    },
  });
}

function toBoolean(value: unknown) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return (
    text === '1' ||
    text === 'true' ||
    text === 'yes' ||
    text === 'y' ||
    text === '是' ||
    text === '通过'
  );
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeImportKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .replaceAll('_', '')
    .toLowerCase();
}

function pickImportValue(
  row: Record<string, unknown>,
  aliases: string[],
): unknown {
  const normalizedAliases = new Set(
    aliases.map((alias) => normalizeImportKey(alias)),
  );
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeImportKey(key))) {
      return value;
    }
  }
  return undefined;
}

function mapWelderImportRow(row: Record<string, unknown>) {
  const welderCodeValue = pickImportValue(row, [
    'welderCode',
    '焊工编号',
    '编号',
    'code',
  ]);
  const nameValue = pickImportValue(row, [
    'name',
    '焊工姓名',
    '姓名',
    'welderName',
    'welder_name',
  ]);
  const teamValue = pickImportValue(row, [
    'team',
    '所属班组',
    '班组',
    'group',
    'teamName',
    '所属车间',
  ]);
  const certificationNoValue = pickImportValue(row, [
    'certificationNo',
    '焊工证号',
    '证号',
    'certificateNo',
  ]);
  const examDateValue = pickImportValue(row, [
    'examDate',
    '入厂考试时间',
    '考试时间',
    '进厂考试时间',
  ]);
  const employmentStatusValue = pickImportValue(row, [
    'employmentStatus',
    '人员状态',
    '状态',
  ]);
  const examPassedValue = pickImportValue(row, [
    'examPassed',
    '进厂考试通过',
    '考试通过',
    'passed',
  ]);
  const scoreValue = pickImportValue(row, ['score', '积分', '评分']);

  const name = String(
    nameValue ??
      // 兜底：按列位置读取（A序号 B编号 C姓名 D班组）
      Object.values(row)[2] ??
      '',
  ).trim();
  const team = String(
    teamValue ??
      // 兜底：按列位置读取（A序号 B编号 C姓名 D班组）
      Object.values(row)[3] ??
      '',
  ).trim();
  if (!name || !team) return null;

  return {
    certificationNo: String(certificationNoValue ?? '').trim(),
    employmentStatus:
      String(employmentStatusValue ?? '').trim() === '离职'
        ? 'RESIGNED'
        : 'ON_DUTY',
    examDate: String(examDateValue ?? '').trim(),
    examPassed: toBoolean(examPassedValue ?? ''),
    name,
    score: toNumber(scoreValue ?? 12, 12),
    team,
    welderCode: String(welderCodeValue ?? Object.values(row)[1] ?? '').trim(),
  };
}

async function readWelderRowsFromFile(file: File) {
  const rows = await readImportRowsFromFile(file);
  if (rows.length === 0) return rows;

  const firstRowKeys = Object.keys(rows[0] || {});
  const hasExpectedHeader = firstRowKeys.some((key) =>
    ['焊工编号', '姓名', '焊工姓名', '所属班组', '班组'].some((header) =>
      String(key || '').includes(header),
    ),
  );
  if (hasExpectedHeader) return rows;

  // 兜底：按列位置读取（B=焊工编号, C=姓名, D=所属班组）
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return rows;
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return rows;

  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    header: 1,
    raw: false,
  }) as unknown[][];

  if (!Array.isArray(aoa) || aoa.length === 0) return rows;

  const normalized = (value: unknown) =>
    String(value ?? '').replaceAll(/\s+/g, '');
  let headerRowIndex = aoa.findIndex((line) => {
    const cells = new Set((line || []).map((cell) => normalized(cell)));
    return (
      cells.has('焊工编号') &&
      (cells.has('姓名') || cells.has('焊工姓名')) &&
      cells.has('所属班组')
    );
  });

  if (headerRowIndex < 0) {
    headerRowIndex = aoa.findIndex((line) => {
      const b = normalized(line?.[1]);
      const c = normalized(line?.[2]);
      const d = normalized(line?.[3]);
      return (
        b.includes('焊工编号') &&
        (c.includes('姓名') || c.includes('焊工姓名')) &&
        d.includes('所属班组')
      );
    });
  }

  if (headerRowIndex < 0) return rows;

  const fallbackRows: Record<string, unknown>[] = [];
  for (let index = headerRowIndex + 1; index < aoa.length; index++) {
    const line = aoa[index] || [];
    const welderCode = String(line[1] ?? '').trim();
    const name = String(line[2] ?? '').trim();
    const team = String(line[3] ?? '').trim();
    const examDate = String(line[4] ?? '').trim();
    const employmentStatus = String(line[5] ?? '').trim();
    const examPassed = String(line[6] ?? '').trim();
    const certificationNo = String(line[7] ?? '').trim();
    if (!welderCode && !name && !team) continue;

    fallbackRows.push({
      welderCode,
      name,
      team,
      examDate,
      employmentStatus,
      examPassed,
      certificationNo,
    });
  }

  return fallbackRows.length > 0 ? fallbackRows : rows;
}

async function handleImport(file: File) {
  try {
    const rows = await readWelderRowsFromFile(file);
    const items = rows
      .map((row) => mapWelderImportRow(row))
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (items.length === 0) {
      message.warning('未识别到可导入的焊工数据（请包含焊工姓名、所属班组）');
      return false;
    }

    const res = await importWelders({ items });
    const { errorCount } = resolveImportErrorCount(res, items.length);
    message.success(
      `导入完成：成功 ${res.successCount} 条，共 ${items.length} 条`,
    );
    if (errorCount > 0) {
      message.warning(buildImportWarningMessage(res, errorCount));
    }
    gridApi.reload();
    return false;
  } catch (error) {
    handleApiError(error, 'Import Welder');
    message.error('导入失败');
    return false;
  }
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
    };

    if (isEditMode.value && currentId.value) {
      await updateWelder(currentId.value, payload);
      message.success(t('common.saveSuccess'));
    } else {
      await createWelder(payload);
      message.success(t('common.createSuccess'));
    }
    modalOpen.value = false;
    gridApi.reload();
  } catch (error) {
    handleApiError(error, 'Save Welder');
  } finally {
    saving.value = false;
  }
}

const gridOptions = computed<VxeGridProps['gridOptions']>(() => ({
  checkboxConfig: {
    highlight: true,
    reserve: true,
  },
  columns: [
    { type: 'checkbox', width: 50 },
    { type: 'seq', title: t('common.seq'), width: 60 },
    {
      field: 'welderCode',
      title: t('qms.welder.welderCode'),
      minWidth: 120,
    },
    {
      field: 'name',
      title: t('qms.welder.name'),
      minWidth: 120,
    },
    {
      field: 'team',
      title: t('qms.welder.team'),
      minWidth: 120,
    },
    {
      field: 'examDate',
      title: t('qms.welder.examDate'),
      minWidth: 140,
      formatter: ({ cellValue }: { cellValue: string }) =>
        cellValue ? dayjs(cellValue).format('YYYY-MM-DD') : '-',
    },
    {
      field: 'employmentStatus',
      title: t('qms.welder.employmentStatus'),
      minWidth: 120,
      slots: { default: 'employmentStatus' },
    },
    {
      field: 'examPassed',
      title: t('qms.welder.examPassed'),
      minWidth: 120,
      slots: { default: 'examPassed' },
    },
    {
      field: 'certificationNo',
      title: t('qms.welder.certificationNo'),
      minWidth: 160,
    },
    {
      field: 'score',
      title: t('qms.welder.score'),
      width: 100,
      slots: { default: 'score' },
    },
    {
      field: 'scoreLevel',
      title: t('qms.welder.scoreLevel.label'),
      width: 120,
      slots: { default: 'scoreLevel' },
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
          onClick: ({
            code,
            row,
          }: {
            code: string;
            row: QmsWelderApi.WelderItem;
          }) => {
            if (code === 'edit') openEditModal(row);
            if (code === 'delete') handleDelete(row);
          },
        },
      },
    },
  ],
  pagerConfig: {
    pageSize: 20,
    pageSizes: [10, 20, 50, 100],
  },
  proxyConfig: {
    autoLoad: true,
    sort: true,
    ajax: {
      query: async (
        params: {
          page?: { currentPage?: number; pageSize?: number };
          sorts?: Array<{ field?: string; order?: string }>;
        },
        formValues: Record<string, unknown>,
      ) => {
        const { page, sorts } = params;
        const result = await getWelderListPage({
          keyword: formValues?.keyword as string,
          page: page?.currentPage,
          pageSize: page?.pageSize,
          sortBy: sorts?.[0]?.field,
          sortOrder: sorts?.[0]?.order as 'asc' | 'desc',
          employmentStatus:
            formValues?.employmentStatus as QmsWelderApi.WelderListParams['employmentStatus'],
          team: formValues?.team as string,
          welderCode: formValues?.welderCode as string,
        });
        if (result.stats) {
          stats.value = result.stats;
        }
        return result;
      },
    },
  },
  toolbarConfig: {
    custom: true,
    refresh: true,
    search: true,
    slots: { buttons: 'toolbar-actions' },
    zoom: true,
  },
}));

const gridEvents = {
  checkboxAll: onCheckChange,
  checkboxChange: onCheckChange,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions.value,
  gridEvents,
  formOptions: {
    schema: [
      {
        component: 'Input',
        fieldName: 'keyword',
        label: t('common.keyword'),
      },
      {
        component: 'Input',
        fieldName: 'welderCode',
        label: t('qms.welder.welderCode'),
      },
      {
        component: 'Select',
        componentProps: {
          options: [
            { label: t('qms.welder.onDuty'), value: 'ON_DUTY' },
            { label: t('qms.welder.resigned'), value: 'RESIGNED' },
          ],
        },
        fieldName: 'employmentStatus',
        label: t('qms.welder.employmentStatus'),
      },
      {
        component: 'Input',
        fieldName: 'team',
        label: t('qms.welder.team'),
      },
    ],
    submitOnChange: true,
  },
});
</script>

<template>
  <Page>
    <div class="space-y-4 p-4">
      <Row :gutter="16">
        <Col :span="6">
          <Card size="small">
            <Statistic
              :title="t('qms.welder.total')"
              :value="stats.total || 0"
            />
          </Card>
        </Col>
        <Col :span="6">
          <Card size="small">
            <Statistic
              :title="t('qms.welder.examPassedCount')"
              :value="stats.examPassedCount || 0"
            />
          </Card>
        </Col>
        <Col :span="6">
          <Card size="small">
            <Statistic
              :title="t('qms.welder.certifiedCount')"
              :value="stats.certifiedCount || 0"
            />
          </Card>
        </Col>
        <Col :span="6">
          <Card size="small">
            <Statistic
              :title="t('qms.welder.averageScore')"
              :value="stats.averageScore || 0"
            />
          </Card>
        </Col>
      </Row>

      <Grid :grid-api="gridApi" :grid-events="gridEvents">
        <template #examPassed="{ row }">
          <Tag :color="row.examPassed ? 'green' : 'red'">
            {{ row.examPassed ? t('common.yes') : t('common.no') }}
          </Tag>
        </template>
        <template #employmentStatus="{ row }">
          <Tag :color="row.employmentStatus === 'RESIGNED' ? 'red' : 'green'">
            {{
              row.employmentStatus === 'RESIGNED'
                ? t('qms.welder.resigned')
                : t('qms.welder.onDuty')
            }}
          </Tag>
        </template>
        <template #score="{ row }">
          <Tag :color="resolveScoreTagColor(row.score || 0)">
            {{ row.score ?? 0 }}
          </Tag>
        </template>
        <template #scoreLevel="{ row }">
          <Badge
            :status="
              (row.score || 0) >= 10
                ? 'success'
                : (row.score || 0) >= 7
                  ? 'warning'
                  : 'error'
            "
          />
          {{ resolveScoreLevel(row.score || 0) }}
        </template>
        <template #toolbar-actions>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              v-if="canCreate"
              type="primary"
              shape="round"
              @click="openCreateModal"
            >
              {{ t('common.create') }}
            </Button>
            <Upload
              accept=".csv,.xls,.xlsx"
              :before-upload="handleImport"
              :disabled="!canImportAction"
              :show-upload-list="false"
            >
              <Button shape="round" :disabled="!canImportAction">
                {{ t('common.import') }}
              </Button>
            </Upload>
            <Tag v-if="checkedRows.length > 0" color="blue">
              已选: {{ checkedRows.length }}
            </Tag>
            <Tag color="red">
              {{ t('qms.welder.warningCount') }}: {{ stats.warningCount || 0 }}
            </Tag>
          </div>
        </template>
      </Grid>
    </div>

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
  </Page>
</template>
