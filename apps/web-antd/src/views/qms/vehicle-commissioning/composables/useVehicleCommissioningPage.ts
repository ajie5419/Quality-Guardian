import type {
  Dept,
  VehicleCommissioningDailyReport,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueStatus,
} from '@qgs/shared';

import type { WorkOrderItem } from '#/api/qms/work-order';
import type { TreeSelectNode } from '#/types';
import type { UploadFileWithResponse } from '#/views/qms/inspection/issues/types';

import { computed, onMounted, reactive, ref } from 'vue';

import { downloadFileFromBlob } from '@vben/utils';

import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createVehicleCommissioningIssue,
  createVehicleCommissioningReport,
  exportVehicleCommissioningIssues,
  getVehicleCommissioningIssueLogs,
  getVehicleCommissioningIssues,
  getVehicleCommissioningReportPreview,
  getVehicleCommissioningReports,
  updateVehicleCommissioningIssue,
} from '#/api/qms/vehicle-commissioning';
import { getDeptList } from '#/api/system/dept';
import { convertToTreeSelectData } from '#/types';

type VehicleCommissioningIssueGroup = {
  children: VehicleCommissioningIssue[];
  id: string;
  isGroup: true;
  issueCount: number;
  openCount: number;
  projectName: string;
  workOrderNumber: string;
};

type VehicleCommissioningReportGroup = {
  children: VehicleCommissioningDailyReport[];
  id: string;
  isGroup: true;
  issueCount: number;
  projectName: string;
  reportCount: number;
  workOrderNumber: string;
};

export function useVehicleCommissioningPage() {
  const deptRawData = ref<Dept[]>([]);
  const deptTreeData = ref<TreeSelectNode[]>([]);
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
    workOrderNumber: '',
  });

  const issueForm = reactive<{
    claimNotes: string;
    claimStatus: string;
    date: string;
    description: string;
    isClaim: boolean;
    lossAmount: number;
    partName: string;
    photos: UploadFileWithResponse[];
    projectName: string;
    recoveredAmount: number;
    responsibleDepartment: string;
    severity: string;
    solution: string;
    status: VehicleCommissioningIssueStatus;
    workOrderNumber: string;
  }>({
    claimNotes: '',
    claimStatus: 'OPEN',
    date: dayjs().format('YYYY-MM-DD'),
    description: '',
    isClaim: false,
    lossAmount: 0,
    partName: '',
    photos: [],
    projectName: '',
    recoveredAmount: 0,
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

  const claimStatusOptions = [
    { label: '待处理', value: 'OPEN' },
    { label: '处理中', value: 'Processing' },
    { label: '已解决', value: 'Resolved' },
    { label: '已确认', value: 'Confirmed' },
  ];

  function onIssueSelectionChange(keys: (number | string)[]) {
    selectedIssueIds.value = keys
      .map(String)
      .filter((key) => !key.startsWith('group-'));
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

  function findDeptNameById(id: string) {
    const find = (items: Dept[]): string => {
      for (const item of items) {
        if (String(item.id) === id) return item.name;
        const childName = item.children ? find(item.children as Dept[]) : '';
        if (childName) return childName;
      }
      return '';
    };
    return find(deptRawData.value);
  }

  function resolveDepartmentValue(value?: string) {
    const raw = String(value || '').trim();
    if (!raw) return '调试组';
    const match = findDeptNameById(raw);
    return match || raw;
  }

  async function loadDeptData() {
    try {
      const data = await getDeptList();
      deptRawData.value = data;
      deptTreeData.value = convertToTreeSelectData(data);
    } catch (error) {
      console.error(error);
      message.error('加载部门列表失败');
    }
  }

  function normalizeUploadPhotos(photos?: string[]): UploadFileWithResponse[] {
    return (photos || []).map((url, index) => ({
      name: `photo-${index + 1}`,
      status: 'done',
      uid: `vehicle-photo-${index}-${url}`,
      url,
    }));
  }

  function resolveUploadedPhotoUrl(file: UploadFileWithResponse) {
    return file.response?.data?.url || file.url || file.thumbUrl || '';
  }

  function normalizePhotoUrls(files: UploadFileWithResponse[]) {
    return files.map((file) => resolveUploadedPhotoUrl(file)).filter(Boolean);
  }

  const groupedIssues = computed<VehicleCommissioningIssueGroup[]>(() => {
    const groups = new Map<string, VehicleCommissioningIssue[]>();
    for (const item of issues.value) {
      const key = item.workOrderNumber || '未关联工单';
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([workOrderNumber, children]) => {
      const projectNames = [
        ...new Set(children.map((item) => item.projectName).filter(Boolean)),
      ];
      return {
        children,
        id: `group-${workOrderNumber}`,
        isGroup: true,
        issueCount: children.length,
        openCount: children.filter((item) => item.status !== 'CLOSED').length,
        projectName: projectNames.join(' / ') || '-',
        workOrderNumber,
      };
    });
  });

  const groupedReports = computed<VehicleCommissioningReportGroup[]>(() => {
    const groups = new Map<string, VehicleCommissioningDailyReport[]>();
    for (const item of reports.value) {
      const key = item.workOrderNumber || '未关联工单';
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([workOrderNumber, children]) => {
      const projectNames = [
        ...new Set(children.map((item) => item.projectName).filter(Boolean)),
      ];
      return {
        children,
        id: `report-group-${workOrderNumber}`,
        isGroup: true,
        issueCount: children.reduce(
          (sum, item) => sum + (item.issueIds || []).length,
          0,
        ),
        projectName: projectNames.join(' / ') || '-',
        reportCount: children.length,
        workOrderNumber,
      };
    });
  });

  const projectTimeSummaries = computed(() => {
    const map = new Map<
      string,
      {
        issueCount: number;
        projectName: string;
        reportCount: number;
        workDates: Set<string>;
        workOrderNumbers: Set<string>;
      }
    >();
    const ensure = (projectName = '') => {
      const key = projectName || '未填写项目';
      const existing = map.get(key);
      if (existing) return existing;
      const summary = {
        issueCount: 0,
        projectName: key,
        reportCount: 0,
        workOrderNumbers: new Set<string>(),
        workDates: new Set<string>(),
      };
      map.set(key, summary);
      return summary;
    };

    for (const item of issues.value) {
      const summary = ensure(item.projectName || '');
      summary.issueCount += 1;
      if (item.date) summary.workDates.add(item.date);
      if (item.workOrderNumber) {
        summary.workOrderNumbers.add(item.workOrderNumber);
      }
    }
    for (const item of reports.value) {
      const summary = ensure(item.projectName || '');
      summary.reportCount += 1;
      if (item.date) summary.workDates.add(item.date);
      if (item.workOrderNumber) {
        summary.workOrderNumbers.add(item.workOrderNumber);
      }
    }

    return [...map.values()]
      .map((item) => {
        const dates = [...item.workDates].sort();
        return {
          firstDate: dates[0] || '-',
          issueCount: item.issueCount,
          lastDate: dates.at(-1) || '-',
          projectName: item.projectName,
          reportCount: item.reportCount,
          workDays: item.workDates.size,
          workOrderCount: item.workOrderNumbers.size,
        };
      })
      .sort((a, b) => b.workDays - a.workDays);
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
      message.error('加载调试验收问题失败');
    } finally {
      loadingIssues.value = false;
    }
  }

  async function loadReports() {
    loadingReports.value = true;
    try {
      const data = await getVehicleCommissioningReports({
        page: 1,
        pageSize: 200,
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
      claimNotes: '',
      claimStatus: 'OPEN',
      date: dayjs().format('YYYY-MM-DD'),
      description: '',
      isClaim: false,
      lossAmount: 0,
      partName: '',
      photos: [],
      projectName: reportForm.projectName || '',
      recoveredAmount: 0,
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
      claimNotes: row.claimNotes || '',
      claimStatus: row.claimStatus || 'OPEN',
      date: row.date || dayjs().format('YYYY-MM-DD'),
      description: row.description || '',
      isClaim: Boolean(row.isClaim),
      lossAmount: Number(row.lossAmount || 0),
      partName: row.partName || '',
      photos: normalizeUploadPhotos(row.photos),
      projectName: row.projectName || '',
      recoveredAmount: Number(row.recoveredAmount || 0),
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
    if (!item) {
      issueForm.workOrderNumber = '';
      return;
    }
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
    if (!item) {
      reportForm.workOrderNumber = '';
      return;
    }
    reportForm.workOrderNumber = item.workOrderNumber || '';
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
          photos: normalizePhotoUrls(issueForm.photos),
          responsibleDepartment: resolveDepartmentValue(
            issueForm.responsibleDepartment,
          ),
        });
        message.success('问题更新成功');
      } else {
        await createVehicleCommissioningIssue({
          ...issueForm,
          photos: normalizePhotoUrls(issueForm.photos),
          responsibleDepartment: resolveDepartmentValue(
            issueForm.responsibleDepartment,
          ),
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
                ) &&
                (!reportForm.workOrderNumber ||
                  item.workOrderNumber === reportForm.workOrderNumber) &&
                item.status !== 'CLOSED',
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
        workOrderNumber: reportForm.workOrderNumber || undefined,
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
      link.download = `${realtime.projectName || '调试验收'}-${realtime.date}.doc`;
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

  async function exportIssuesAsExcel(workOrderNumber?: string) {
    try {
      const blob = await exportVehicleCommissioningIssues(
        workOrderNumber ? { workOrderNumber } : undefined,
      );
      downloadFileFromBlob({
        fileName: workOrderNumber
          ? `${workOrderNumber}-commissioning-issues.xlsx`
          : 'commissioning-acceptance-issues.xlsx',
        source: blob,
      });
    } catch (error) {
      console.error(error);
      message.error('导出问题台账失败');
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
    await Promise.all([loadDeptData(), loadIssues(), loadReports()]);
  });

  return {
    claimStatusOptions,
    createReport,
    deptTreeData,
    exportIssuesAsExcel,
    exportReportAsPdf,
    exportReportAsWord,
    groupedIssues,
    groupedReports,
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
    projectTimeSummaries,
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
