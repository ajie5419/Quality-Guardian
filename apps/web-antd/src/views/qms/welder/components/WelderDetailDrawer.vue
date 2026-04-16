<script lang="ts" setup>
import type { InspectionIssue } from '#/api/qms/inspection';
import type { QmsWelderApi } from '#/api/qms/welder';
import type { SystemDeptApi } from '#/api/system/dept';

import { onMounted, reactive, ref } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Button,
  Descriptions,
  Drawer,
  message,
  Modal,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getInspectionIssues } from '#/api/qms/inspection';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { findNameById } from '#/types';

import { normalizeWelderIdentity, resolveScoreTagColor } from '../helpers';

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

const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const detailVisible = ref(false);
const detailRecord = ref<QmsWelderApi.WelderItem>();
const deductionDetailOpen = ref(false);
const deductionLoading = ref(false);
const issueDetailOpen = ref(false);
const selectedIssueDetail = ref<InspectionIssue>();
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

function openDetail(row: QmsWelderApi.WelderItem) {
  detailRecord.value = row;
  detailVisible.value = true;
}

function openIssueDetail(record: DeductionIssueRow) {
  selectedIssueDetail.value = record.sourceIssue;
  issueDetailOpen.value = true;
}

onMounted(async () => {
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    handleApiError(error, 'Load Dept List');
  }
});

defineExpose({ openDetail });
</script>

<template>
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
      <Descriptions.Item :label="t('qms.welder.welding_method')">
        {{ detailRecord.welding_method || '-' }}
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
    <Descriptions v-if="selectedIssueDetail" bordered :column="2" size="small">
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
</template>
