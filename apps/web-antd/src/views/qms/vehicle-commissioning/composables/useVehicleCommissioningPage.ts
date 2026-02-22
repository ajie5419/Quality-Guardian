import type {
  VehicleCommissioningDailyReport,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueStatus,
} from '@qgs/shared';

import type { WorkOrderItem } from '#/api/qms/work-order';

import { computed, onMounted, reactive, ref } from 'vue';

import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createVehicleCommissioningIssue,
  createVehicleCommissioningReport,
  getVehicleCommissioningIssueLogs,
  getVehicleCommissioningIssues,
  getVehicleCommissioningReportPreview,
  getVehicleCommissioningReports,
  updateVehicleCommissioningIssue,
} from '#/api/qms/vehicle-commissioning';

export function useVehicleCommissioningPage() {
  const loadingIssues = ref(false);
  const loadingReports = ref(false);
  const issues = ref<VehicleCommissioningIssue[]>([]);
  const reports = ref<VehicleCommissioningDailyReport[]>([]);
  const selectedIssueIds = ref<string[]>([]);
  const issueModalOpen = ref(false);
  const issueEditId = ref<string>('');
  const selectedWorkOrderValue = ref<string>();
  const selectedReportWorkOrderValue = ref<string>();
  const issueLogModalOpen = ref(false);
  const issueLogs = ref<
    Array<{
      action: string;
      createdAt: string;
      details: string;
      id: string;
      operator: string;
    }>
  >([]);
  const reportPreviewModalOpen = ref(false);
  const reportPreviewText = ref('');
  const reportPreviewTitle = ref('');

  const reportForm = reactive({
    date: dayjs().format('YYYY-MM-DD'),
    mainWorksText: '',
    notes: '',
    projectName: '',
    reportersText: '',
  });

  const issueForm = reactive<{
    assignee: string;
    date: string;
    description: string;
    partName: string;
    projectName: string;
    responsibleDepartment: string;
    severity: string;
    solution: string;
    status: VehicleCommissioningIssueStatus;
    workOrderNumber: string;
  }>({
    assignee: '',
    date: dayjs().format('YYYY-MM-DD'),
    description: '',
    partName: '',
    projectName: '',
    responsibleDepartment: '调试组',
    severity: 'minor',
    solution: '',
    status: 'OPEN',
    workOrderNumber: '',
  });

  const issueStatusOptions = [
    { label: '待处理', value: 'OPEN' },
    { label: '处理中', value: 'IN_PROGRESS' },
    { label: '待验证', value: 'RESOLVED' },
    { label: '已关闭', value: 'CLOSED' },
  ];

  function onIssueSelectionChange(keys: (number | string)[]) {
    selectedIssueIds.value = keys.map(String);
  }

  function normalizeProjectName(value?: string) {
    return String(value || '')
      .toLowerCase()
      .replaceAll(/\s+/g, '')
      .trim();
  }

  const severityOptions = [
    { label: '轻微', value: 'minor' },
    { label: '一般', value: 'major' },
    { label: '严重', value: 'critical' },
  ];

  const issuesByStatus = computed(() => {
    const stats = {
      CLOSED: 0,
      IN_PROGRESS: 0,
      OPEN: 0,
      RESOLVED: 0,
    };
    issues.value.forEach((item: VehicleCommissioningIssue) => {
      const key = item.status as keyof typeof stats;
      if (stats[key] !== undefined) stats[key]++;
    });
    return stats;
  });

  async function loadIssues() {
    loadingIssues.value = true;
    try {
      const data = await getVehicleCommissioningIssues({
        page: 1,
        pageSize: 200,
      });
      issues.value = data.items || [];
    } catch (error) {
      console.error(error);
      message.error('加载调试问题失败');
    } finally {
      loadingIssues.value = false;
    }
  }

  async function loadReports() {
    loadingReports.value = true;
    try {
      const data = await getVehicleCommissioningReports({
        page: 1,
        pageSize: 50,
      });
      reports.value = data.items || [];
    } catch (error) {
      console.error(error);
      message.error('加载日报失败');
    } finally {
      loadingReports.value = false;
    }
  }

  function openCreateIssue() {
    issueEditId.value = '';
    Object.assign(issueForm, {
      assignee: '',
      date: dayjs().format('YYYY-MM-DD'),
      description: '',
      partName: '',
      projectName: reportForm.projectName || '',
      responsibleDepartment: '调试组',
      severity: 'minor',
      solution: '',
      status: 'OPEN',
      workOrderNumber: '',
    });
    issueModalOpen.value = true;
    selectedWorkOrderValue.value = undefined;
  }

  function openEditIssue(row: VehicleCommissioningIssue) {
    issueEditId.value = row.id;
    Object.assign(issueForm, {
      assignee: row.assignee || '',
      date: row.date || dayjs().format('YYYY-MM-DD'),
      description: row.description || '',
      partName: row.partName || '',
      projectName: row.projectName || '',
      responsibleDepartment: row.responsibleDepartment || '调试组',
      severity: row.severity || 'minor',
      solution: row.solution || '',
      status: row.status || 'OPEN',
      workOrderNumber: row.workOrderNumber || '',
    });
    issueModalOpen.value = true;
    selectedWorkOrderValue.value = row.workOrderNumber || undefined;
  }

  function onWorkOrderChange(_val: unknown, option?: { item?: WorkOrderItem }) {
    const item = option?.item;
    if (!item) return;
    issueForm.workOrderNumber = item.workOrderNumber || '';
    if (!issueForm.projectName && item.projectName) {
      issueForm.projectName = item.projectName;
    }
  }

  function onReportWorkOrderChange(
    _val: unknown,
    option?: { item?: WorkOrderItem },
  ) {
    const item = option?.item;
    if (!item) return;
    if (item.projectName) {
      reportForm.projectName = item.projectName;
    }
  }

  async function submitIssue() {
    if (!issueForm.description.trim()) {
      message.warning('请填写问题描述');
      return;
    }
    if (!issueForm.projectName.trim()) {
      message.warning('请填写项目名称');
      return;
    }
    try {
      if (issueEditId.value) {
        await updateVehicleCommissioningIssue(issueEditId.value, {
          ...issueForm,
        });
        message.success('问题更新成功');
      } else {
        await createVehicleCommissioningIssue({
          ...issueForm,
        });
        message.success('问题创建成功');
      }
      issueModalOpen.value = false;
      await loadIssues();
    } catch (error) {
      console.error(error);
      message.error('保存问题失败');
    }
  }

  async function quickCloseIssue(row: VehicleCommissioningIssue) {
    try {
      await updateVehicleCommissioningIssue(row.id, {
        status: 'CLOSED',
      });
      message.success('问题已关闭');
      await loadIssues();
    } catch (error) {
      console.error(error);
      message.error('关闭问题失败');
    }
  }

  async function createReport() {
    const reporters = reportForm.reportersText
      .split(/[\s,，]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const mainWorks = reportForm.mainWorksText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!reportForm.projectName.trim()) {
      message.warning('请填写项目名称');
      return;
    }
    if (!reportForm.date) {
      message.warning('请选择日报日期');
      return;
    }
    if (reporters.length === 0) {
      message.warning('请填写汇报人');
      return;
    }
    if (mainWorks.length === 0) {
      message.warning('请填写主要工作');
      return;
    }

    const autoIssueIds =
      selectedIssueIds.value.length > 0
        ? selectedIssueIds.value
        : issues.value
            .filter(
              (item) =>
                normalizeProjectName(item.projectName).includes(
                  normalizeProjectName(reportForm.projectName),
                ) && item.status !== 'CLOSED',
            )
            .map((item) => item.id);

    try {
      await createVehicleCommissioningReport({
        date: reportForm.date,
        issueIds: autoIssueIds,
        mainWorks,
        notes: reportForm.notes,
        projectName: reportForm.projectName.trim(),
        reporters,
      });
      message.success('日报已生成并保存');
      await loadReports();
    } catch (error) {
      console.error(error);
      message.error('生成日报失败');
    }
  }

  async function getRealtimeReport(row: VehicleCommissioningDailyReport) {
    return getVehicleCommissioningReportPreview(row.id);
  }

  async function previewReportText(row: VehicleCommissioningDailyReport) {
    try {
      const realtime = await getRealtimeReport(row);
      reportPreviewTitle.value = `${realtime.projectName} - ${realtime.date} 日报`;
      reportPreviewText.value = realtime.reportText || '无内容';
      reportPreviewModalOpen.value = true;
    } catch (error) {
      console.error(error);
      message.error('加载日报预览失败');
    }
  }

  async function exportReportAsWord(row: VehicleCommissioningDailyReport) {
    try {
      const realtime = await getRealtimeReport(row);
      const blob = new Blob([realtime.reportText || ''], {
        type: 'application/msword;charset=utf-8',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `${realtime.projectName || '车辆调试'}-${realtime.date}.doc`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      message.error('导出Word失败');
    }
  }

  async function exportReportAsPdf(row: VehicleCommissioningDailyReport) {
    try {
      const realtime = await getRealtimeReport(row);
      reportPreviewTitle.value = `${realtime.projectName} - ${realtime.date} 日报`;
      reportPreviewText.value = realtime.reportText || '无内容';
      reportPreviewModalOpen.value = true;
      setTimeout(() => {
        window.print();
      }, 100);
    } catch (error) {
      console.error(error);
      message.error('导出PDF失败');
    }
  }

  async function viewIssueLogs(row: VehicleCommissioningIssue) {
    try {
      const logs = await getVehicleCommissioningIssueLogs(row.id);
      issueLogs.value = logs || [];
      issueLogModalOpen.value = true;
    } catch (error) {
      console.error(error);
      message.error('加载问题日志失败');
    }
  }

  onMounted(async () => {
    await Promise.all([loadIssues(), loadReports()]);
  });

  return {
    createReport,
    exportReportAsPdf,
    exportReportAsWord,
    issueEditId,
    issueForm,
    issueLogModalOpen,
    issueLogs,
    issueModalOpen,
    issueStatusOptions,
    issues,
    issuesByStatus,
    loadIssues,
    loadReports,
    loadingIssues,
    loadingReports,
    onIssueSelectionChange,
    onReportWorkOrderChange,
    onWorkOrderChange,
    openCreateIssue,
    openEditIssue,
    previewReportText,
    quickCloseIssue,
    reportForm,
    reportPreviewModalOpen,
    reportPreviewText,
    reportPreviewTitle,
    reports,
    selectedIssueIds,
    selectedReportWorkOrderValue,
    selectedWorkOrderValue,
    severityOptions,
    submitIssue,
    viewIssueLogs,
  };
}
