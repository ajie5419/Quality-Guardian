<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { InspectionIssue } from '#/api/qms/inspection';
import type { QmsWelderApi } from '#/api/qms/welder';
import type { SystemDeptApi } from '#/api/system/dept';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
  Statistic,
  Switch,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getInspectionIssues } from '#/api/qms/inspection';
import {
  createWelder,
  deleteWelder,
  getWelderListPage,
  importWelders,
  updateWelder,
} from '#/api/qms/welder';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { findNameById } from '#/types';
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
const detailVisible = ref(false);
const detailRecord = ref<QmsWelderApi.WelderItem>();
const stats = ref<QmsWelderApi.WelderStats>({
  averageScore: '0.0',
  certifiedCount: 0,
  examPassedCount: 0,
  total: 0,
  warningCount: 0,
});

const modalOpen = ref(false);
const ruleModalOpen = ref(false);
const deductionDetailOpen = ref(false);
const deductionLoading = ref(false);
const issueDetailOpen = ref(false);
const selectedIssueDetail = ref<InspectionIssue>();
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

interface DeductionIssueRow {
  deduction: number;
  id: string;
  index: number;
  ncNumber: string;
  partName: string;
  projectName: string;
  reportDate: string;
  runningTotal: number;
  severity: '一般' | '严重' | '轻微';
  sourceIssue: InspectionIssue;
}

const deductionRows = ref<DeductionIssueRow[]>([]);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deductionSummary = reactive({
  currentScore: 12,
  issueCount: 0,
  totalDeduction: 0,
});

const deductionTableColumns = [
  { title: '序号', dataIndex: 'index', width: 70 },
  { title: '项目名称', dataIndex: 'projectName', width: 220 },
  { title: '部件名称', dataIndex: 'partName', width: 220 },
  {
    title: '日期',
    dataIndex: 'reportDate',
    width: 140,
    customRender: ({ text }: { text: string }) =>
      text ? dayjs(text).format('YYYY-MM-DD') : '-',
  },
  { title: '严重度', dataIndex: 'severity', width: 120 },
  { title: '本次扣分', dataIndex: 'deduction', width: 100 },
  { title: '累计扣分', dataIndex: 'runningTotal', width: 100 },
];

const welderScoreRules = [
  {
    item: '1',
    rule: '初始积分',
    detail: '每名焊工初始积分 12 分。',
  },
  {
    item: '2',
    rule: '扣分触发',
    detail: '不合格项明确责任焊工时触发扣分。',
  },
  {
    item: '3',
    rule: '严重度扣分',
    detail: 'Minor 扣 1 分，Major 扣 2 分，Critical 扣 4 分。',
  },
  {
    item: '4',
    rule: '幂等原则',
    detail: '同一条不合格项只扣一次，重复编辑不重复扣分。',
  },
  {
    item: '5',
    rule: '月度保护',
    detail: '已取消单月最多扣 6 分的限制，不再做月封顶。',
  },
  {
    item: '6',
    rule: '积分下限',
    detail: '积分最低 0 分，不出现负分。',
  },
];

function isLikelyWelderCode(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /[A-Z0-9-]/i.test(text) && !/[\u4E00-\u9FFF]/.test(text);
}

function isLikelyWelderName(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /[\u4E00-\u9FFF]/.test(text);
}

function normalizeWelderIdentity(row: QmsWelderApi.WelderItem) {
  const welderCode = String(row.welderCode || '').trim();
  const name = String(row.name || '').trim();
  if (isLikelyWelderCode(name) && isLikelyWelderName(welderCode)) {
    return {
      displayName: welderCode,
      displayWelderCode: name,
    };
  }
  return {
    displayName: name,
    displayWelderCode: welderCode,
  };
}

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

function resolveDeductionBySeverity(severity: unknown) {
  const value = String(severity ?? '')
    .trim()
    .toLowerCase();
  if (value === 'critical' || value === '严重') return 4;
  if (value === 'major' || value === '一般' || value === '中等') return 2;
  return 1;
}

function mapSeverityLabel(severity: unknown): '一般' | '严重' | '轻微' {
  const value = String(severity ?? '')
    .trim()
    .toLowerCase();
  if (value === 'critical' || value === '严重') return '严重';
  if (value === 'major' || value === '一般' || value === '中等') return '一般';
  return '轻微';
}

function mapIssueStatusLabel(status: unknown) {
  const value = String(status ?? '')
    .trim()
    .toUpperCase();
  if (value === 'OPEN') return '待处理';
  if (value === 'IN_PROGRESS') return '处理中';
  if (value === 'RESOLVED') return '已解决';
  if (value === 'CLOSED') return '已关闭';
  return String(status || '-');
}

function readIssueField(issue: InspectionIssue | undefined, fieldName: string) {
  if (!issue) return '-';
  const value = (issue as unknown as Record<string, unknown>)[fieldName];
  const text = String(value ?? '').trim();
  return text || '-';
}

function formatDept(value: string | undefined) {
  if (!value) return '-';
  return findNameById(deptRawData.value, value) || value;
}

function resolveResponsibleDeptDisplay(issue: InspectionIssue | undefined) {
  if (!issue) return '-';
  const deptText = formatDept(issue.responsibleDepartment);
  const supplierName = String(issue.supplierName || '').trim();
  if (supplierName && (deptText.includes('外协') || deptText === '外协单位')) {
    return supplierName;
  }
  return deptText || '-';
}

async function loadIssuesByResponsibleWelder(keyword: string) {
  const allRows: InspectionIssue[] = [];
  let currentPage = 1;
  const pageSize = 200;

  while (true) {
    const result = await getInspectionIssues({
      page: currentPage,
      pageSize,
      responsibleWelder: keyword,
      sortBy: 'date',
      sortOrder: 'desc',
    });
    const items = Array.isArray(result.items) ? result.items : [];
    allRows.push(...items);
    if (allRows.length >= result.total || items.length < pageSize) {
      break;
    }
    currentPage += 1;
    if (currentPage > 20) {
      break;
    }
  }

  return allRows;
}

async function openDeductionDetail(row: QmsWelderApi.WelderItem) {
  const identity = normalizeWelderIdentity(row);
  const candidates = [
    ...new Set(
      [identity.displayWelderCode, identity.displayName]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ];
  if (candidates.length === 0) {
    message.warning('该焊工缺少可匹配的编号或姓名');
    return;
  }

  deductionLoading.value = true;
  deductionDetailOpen.value = true;
  deductionRows.value = [];
  deductionSummary.currentScore = row.score ?? 12;
  deductionSummary.issueCount = 0;
  deductionSummary.totalDeduction = 0;

  try {
    const rowsByKey = await Promise.all(
      candidates.map((keyword) => loadIssuesByResponsibleWelder(keyword)),
    );
    const mergedMap = new Map<string, InspectionIssue>();
    for (const rows of rowsByKey) {
      for (const issue of rows) {
        const key = String(issue.id || '');
        if (!key) continue;
        mergedMap.set(key, issue);
      }
    }

    const mergedRows = [...mergedMap.values()].sort((a, b) => {
      const timeA = new Date(String(a.reportDate || a.date || '')).getTime();
      const timeB = new Date(String(b.reportDate || b.date || '')).getTime();
      return timeA - timeB;
    });

    let runningTotal = 0;
    deductionRows.value = mergedRows.map((issue, index) => {
      const deduction = resolveDeductionBySeverity(issue.severity);
      runningTotal += deduction;
      return {
        deduction,
        id: String(issue.id || `${index}`),
        index: index + 1,
        ncNumber: String(issue.ncNumber || '-'),
        partName: String(issue.partName || '-'),
        projectName: String(issue.projectName || '-'),
        reportDate: String(issue.reportDate || issue.date || ''),
        runningTotal,
        severity: mapSeverityLabel(issue.severity),
        sourceIssue: issue,
      };
    });
    deductionSummary.issueCount = deductionRows.value.length;
    deductionSummary.totalDeduction = runningTotal;
  } catch (error) {
    handleApiError(error, 'Load Welder Deduction Detail');
    deductionDetailOpen.value = false;
  } finally {
    deductionLoading.value = false;
  }
}

onMounted(async () => {
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    handleApiError(error, 'Load Dept List');
  }
});

function openIssueDetail(record: DeductionIssueRow) {
  selectedIssueDetail.value = record.sourceIssue;
  issueDetailOpen.value = true;
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
  const identity = normalizeWelderIdentity(row);
  isEditMode.value = true;
  currentId.value = row.id;
  formState.name = identity.displayName;
  formState.welderCode = identity.displayWelderCode;
  formState.team = row.team || '';
  formState.examDate = row.examDate ? dayjs(row.examDate) : undefined;
  formState.examPassed = !!row.examPassed;
  formState.employmentStatus = row.employmentStatus || 'ON_DUTY';
  formState.certificationNo = row.certificationNo || '';
  formState.score = row.score ?? 12;
  modalOpen.value = true;
}

function openDetail(row: QmsWelderApi.WelderItem) {
  detailRecord.value = row;
  detailVisible.value = true;
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

function isHeaderLikeWelderRecord(params: { code?: string; name?: string }) {
  const name = String(params.name || '')
    .trim()
    .toLowerCase();
  const code = String(params.code || '')
    .trim()
    .toLowerCase();
  const combined = `${name} ${code}`;
  return (
    combined.includes('焊工编号') ||
    combined.includes('焊工姓名') ||
    combined.includes('姓名') ||
    combined.includes('最新') ||
    combined.includes('(姓名)') ||
    combined.includes('（姓名）') ||
    combined.includes('weldercode') ||
    combined.includes('weldername')
  );
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
  const welderCode = String(
    welderCodeValue ?? Object.values(row)[1] ?? '',
  ).trim();
  if (isHeaderLikeWelderRecord({ code: welderCode, name })) return null;
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
    welderCode,
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
      formatter: ({ row }: { row: QmsWelderApi.WelderItem }) =>
        normalizeWelderIdentity(row).displayWelderCode || '-',
    },
    {
      field: 'name',
      title: t('qms.welder.name'),
      minWidth: 120,
      formatter: ({ row }: { row: QmsWelderApi.WelderItem }) =>
        normalizeWelderIdentity(row).displayName || '-',
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
      field: '__action',
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
  cellClick: (params: {
    column?: { field?: string; type?: string };
    row?: QmsWelderApi.WelderItem;
  }) => {
    const row = params?.row;
    const column = params?.column;
    if (!row || !column) return;
    if (column.field === '__action') return;
    if (
      column.type === 'checkbox' ||
      column.type === 'radio' ||
      column.type === 'seq'
    ) {
      return;
    }
    openDetail(row);
  },
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
            <Button shape="round" @click="ruleModalOpen = true">规则</Button>
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

    <Modal
      v-model:open="ruleModalOpen"
      title="焊工积分规则"
      width="760px"
      :footer="null"
      @cancel="() => (ruleModalOpen = false)"
    >
      <Descriptions bordered :column="1" size="small">
        <Descriptions.Item
          v-for="item in welderScoreRules"
          :key="item.item"
          :label="`${item.item}. ${item.rule}`"
        >
          {{ item.detail }}
        </Descriptions.Item>
      </Descriptions>
    </Modal>

    <Drawer
      v-model:open="detailVisible"
      :title="`${t('qms.welder.name')}详情`"
      :width="720"
      placement="right"
    >
      <div class="mb-3 flex justify-end">
        <Button
          type="primary"
          :loading="deductionLoading"
          @click="detailRecord && openDeductionDetail(detailRecord)"
        >
          扣分明细
        </Button>
      </div>
      <Descriptions v-if="detailRecord" bordered :column="2" size="small">
        <Descriptions.Item :label="t('qms.welder.welderCode')">
          {{ normalizeWelderIdentity(detailRecord).displayWelderCode || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.name')">
          {{ normalizeWelderIdentity(detailRecord).displayName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.team')">
          {{ detailRecord.team || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.examDate')">
          {{
            detailRecord.examDate
              ? dayjs(detailRecord.examDate).format('YYYY-MM-DD')
              : '-'
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.employmentStatus')">
          {{
            detailRecord.employmentStatus === 'RESIGNED'
              ? t('qms.welder.resigned')
              : t('qms.welder.onDuty')
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.examPassed')">
          {{ detailRecord.examPassed ? t('common.yes') : t('common.no') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.certificationNo')">
          {{ detailRecord.certificationNo || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.welder.score')">
          {{ detailRecord.score ?? '-' }}
        </Descriptions.Item>
      </Descriptions>
    </Drawer>

    <Modal
      v-model:open="deductionDetailOpen"
      title="焊工扣分明细"
      width="900px"
      :footer="null"
      @cancel="() => (deductionDetailOpen = false)"
    >
      <div class="mb-3 flex items-center gap-3">
        <Tag color="blue">不合格项: {{ deductionSummary.issueCount }}</Tag>
        <Tag color="red">累计扣分: {{ deductionSummary.totalDeduction }}</Tag>
        <Tag :color="resolveScoreTagColor(deductionSummary.currentScore)">
          当前积分: {{ deductionSummary.currentScore }}
        </Tag>
      </div>
      <Table
        :columns="deductionTableColumns"
        :data-source="deductionRows"
        :loading="deductionLoading"
        :pagination="false"
        row-key="id"
        size="small"
        :scroll="{ y: 420 }"
        :custom-row="
          (record: DeductionIssueRow) => ({
            onClick: () => openIssueDetail(record),
            style: { cursor: 'pointer' },
          })
        "
      />
    </Modal>

    <Modal
      v-model:open="issueDetailOpen"
      title="不合格登记详情"
      width="980px"
      :footer="null"
      @cancel="() => (issueDetailOpen = false)"
    >
      <Descriptions
        v-if="selectedIssueDetail"
        bordered
        :column="2"
        size="small"
      >
        <Descriptions.Item label="不合格单号">
          {{ selectedIssueDetail.ncNumber || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          {{ mapIssueStatusLabel(selectedIssueDetail.status) }}
        </Descriptions.Item>
        <Descriptions.Item label="工单号">
          {{ selectedIssueDetail.workOrderNumber || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="项目名称">
          {{ selectedIssueDetail.projectName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="部件名称">
          {{ selectedIssueDetail.partName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="所属工序">
          {{ readIssueField(selectedIssueDetail, 'processName') }}
        </Descriptions.Item>
        <Descriptions.Item label="报告日期">
          {{
            selectedIssueDetail.reportDate
              ? dayjs(selectedIssueDetail.reportDate).format('YYYY-MM-DD')
              : '-'
          }}
        </Descriptions.Item>
        <Descriptions.Item label="检验员">
          {{ selectedIssueDetail.inspector || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="责任部门">
          {{ resolveResponsibleDeptDisplay(selectedIssueDetail) }}
        </Descriptions.Item>
        <Descriptions.Item label="责任焊工">
          {{ readIssueField(selectedIssueDetail, 'responsibleWelder') }}
        </Descriptions.Item>
        <Descriptions.Item label="缺陷分类">
          {{ selectedIssueDetail.defectType || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="二级分类">
          {{ selectedIssueDetail.defectSubtype || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="严重程度">
          {{ mapSeverityLabel(selectedIssueDetail.severity) }}
        </Descriptions.Item>
        <Descriptions.Item label="数量">
          {{ selectedIssueDetail.quantity ?? '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="损失金额">
          ￥{{ selectedIssueDetail.lossAmount ?? 0 }}
        </Descriptions.Item>
        <Descriptions.Item label="供应商">
          {{ selectedIssueDetail.supplierName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :span="2" label="问题描述">
          {{ selectedIssueDetail.description || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :span="2" label="原因分析">
          {{ selectedIssueDetail.rootCause || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :span="2" label="解决方案">
          {{ selectedIssueDetail.solution || '-' }}
        </Descriptions.Item>
      </Descriptions>
    </Modal>
  </Page>
</template>
