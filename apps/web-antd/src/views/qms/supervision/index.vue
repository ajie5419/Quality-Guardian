<script lang="ts" setup>
import type {
  SupervisionDailyReport,
  SupervisionIssue,
  SupervisionPlanTask,
  SupervisionPlanTaskSummary,
  SupervisionProject,
  User,
} from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createSupervisionIssue,
  createSupervisionIssueAction,
  createSupervisionProject,
  createSupervisionReport,
  deleteSupervisionReport,
  getSupervisionIssueActions,
  getSupervisionIssues,
  getSupervisionPlanTasks,
  getSupervisionProjects,
  getSupervisionReports,
  importSupervisionPlanTasks,
  updateSupervisionIssue,
  updateSupervisionProject,
} from '#/api/qms/supervision';
import { getUserList } from '#/api/system/user';
import QmsFileUpload from '#/views/qms/shared/components/QmsFileUpload.vue';
import SupplierSelect from '#/views/qms/shared/components/SupplierSelect.vue';
import { getUploadResponse } from '#/views/qms/shared/utils/upload-file';

import DeadlineBoard from './components/DeadlineBoard.vue';
import GanttTaskEditor from './components/GanttTaskEditor.vue';

type ProjectFormState = {
  plannedEndAt?: dayjs.Dayjs;
  plannedStartAt?: dayjs.Dayjs;
  projectName: string;
  supervisor: string;
  supplierName: string;
};

type ReportFormState = {
  attachments: UploadFile[];
  completedMilestone: string;
  coordinationNeeded: string;
  issueSummary: string;
  location: string;
  manpower: number;
  progressPercent: number;
  projectId: string;
  reportDate: dayjs.Dayjs;
  reporter: string;
  taskId: string;
  taskNextPlan: string;
  taskProgressPercent: number;
  taskRiskReason: string;
  taskStatus: string;
  taskWorkContent: string;
  tomorrowPlan: string;
  weather: string;
  workContent: string;
};

type ReportTaskDraft = {
  completedQuantity: number;
  dailyQuantity: number;
  enabled: boolean;
  nextPlan: string;
  photos: UploadFile[];
  plannedQuantity: number;
  progressPercent: number;
  quantityUnit: string;
  riskReason: string;
  status: SupervisionPlanTask['status'];
  task: SupervisionPlanTask;
  workContent: string;
};

type IssueFormState = {
  affectsProgress: boolean;
  correctiveAction: string;
  description: string;
  dueAt?: dayjs.Dayjs;
  estimatedLoss: number;
  isClaim: boolean;
  issueType: string;
  photos: UploadFile[];
  projectId: string;
  rectificationPhotos: UploadFile[];
  responsibleUnit: string;
  severity: string;
  status: SupervisionIssue['status'];
  verifyResult: string;
};

const projects = ref<SupervisionProject[]>([]);
const reports = ref<SupervisionDailyReport[]>([]);
const issues = ref<SupervisionIssue[]>([]);
const planTasks = ref<SupervisionPlanTask[]>([]);
const planTaskSummary = ref<SupervisionPlanTaskSummary>({
  delayed: 0,
  done: 0,
  dueSoon: 0,
  inProgress: 0,
  notStarted: 0,
  progressPercent: 0,
  total: 0,
});
const issueActions = ref<any[]>([]);
const users = ref<User[]>([]);
const loadingProjects = ref(false);
const loadingReports = ref(false);
const loadingIssues = ref(false);
const loadingPlanTasks = ref(false);
const importingPlanTasks = ref(false);
const activeTab = ref('projects');
const ganttView = ref('focus');
const projectTypeFilter = ref('');
const selectedPlanProjectId = ref('');

const projectDrawerOpen = ref(false);
const projectDetailDrawerOpen = ref(false);
const reportDrawerOpen = ref(false);
const issueDrawerOpen = ref(false);
const actionDrawerOpen = ref(false);
const editingProjectId = ref('');
const editingIssueId = ref('');
const detailProject = ref<SupervisionProject>();

const projectForm = reactive<ProjectFormState>({
  projectName: '',
  supplierName: '',
  supervisor: '',
});

const reportForm = reactive<ReportFormState>({
  attachments: [],
  completedMilestone: '',
  coordinationNeeded: '',
  issueSummary: '',
  location: '',
  manpower: 0,
  progressPercent: 0,
  projectId: '',
  reportDate: dayjs(),
  reporter: '',
  taskId: '',
  taskNextPlan: '',
  taskProgressPercent: 0,
  taskRiskReason: '',
  taskStatus: 'IN_PROGRESS',
  taskWorkContent: '',
  tomorrowPlan: '',
  weather: '',
  workContent: '',
});
const reportTaskDrafts = ref<ReportTaskDraft[]>([]);

const issueForm = reactive<IssueFormState>({
  affectsProgress: false,
  correctiveAction: '',
  description: '',
  estimatedLoss: 0,
  isClaim: false,
  issueType: 'QUALITY',
  photos: [],
  projectId: '',
  rectificationPhotos: [],
  responsibleUnit: '',
  severity: 'major',
  status: 'OPEN',
  verifyResult: '',
});

const actionForm = reactive({
  actionType: 'FOLLOW_UP',
  attachments: [] as UploadFile[],
  description: '',
  rectificationPhotos: [] as UploadFile[],
  status: 'IN_PROGRESS' as SupervisionIssue['status'],
  verifyResult: '',
});

const projectTypeOptions = [
  { color: 'blue', label: '模具产品', value: 'MOLD' },
  { color: 'green', label: '路桥产品', value: 'BRIDGE' },
  { color: 'purple', label: '车辆产品', value: 'VEHICLE' },
];

const projectStatusOptions = [
  { label: '计划中', value: 'PLANNED' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '暂停', value: 'PAUSED' },
  { label: '已完成', value: 'COMPLETED' },
];
const issueStatusOptions = [
  { label: '待处理', value: 'OPEN' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '待验证', value: 'VERIFYING' },
  { label: '已关闭', value: 'CLOSED' },
];
const severityOptions = [
  { label: '轻微', value: 'minor' },
  { label: '一般', value: 'major' },
  { label: '严重', value: 'critical' },
];
const issueTypeOptions = [
  { label: '质量', value: 'QUALITY' },
  { label: '进度', value: 'PROGRESS' },
  { label: '资料', value: 'DOCUMENT' },
  { label: '安全', value: 'SAFETY' },
];
const planTaskStatusOptions = [
  { color: 'default', label: '未开始', value: 'NOT_STARTED' },
  { color: 'blue', label: '进行中', value: 'IN_PROGRESS' },
  { color: 'purple', label: '有风险', value: 'RISK' },
  { color: 'orange', label: '临期', value: 'DUE_SOON' },
  { color: 'red', label: '已延期', value: 'DELAYED' },
  { color: 'green', label: '已完成', value: 'DONE' },
];
const reportTaskStatusOptions = [
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '有风险', value: 'RISK' },
  { label: '已延期', value: 'DELAYED' },
  { label: '已完成', value: 'DONE' },
];
const ganttViewOptions = [
  { label: '关注', value: 'focus' },
  { label: '阶段', value: 'stage' },
  { label: '时间轴', value: 'timeline' },
  { label: '全部任务', value: 'all' },
  { label: '编辑', value: 'edit' },
];

const projectOptions = computed(() =>
  projects.value.map((item) => ({
    label: `${item.projectName}${item.supplierName ? ` / ${item.supplierName}` : ''}`,
    value: item.id,
  })),
);
const visibleProjects = computed(() =>
  projectTypeFilter.value
    ? projects.value.filter(
        (item) => item.projectType === projectTypeFilter.value,
      )
    : projects.value,
);

const userOptions = computed(() =>
  users.value.map((user) => ({
    label: user.realName || user.username,
    value: user.realName || user.username,
  })),
);

const openIssues = computed(() =>
  issues.value.filter((item) => item.status !== 'CLOSED'),
);
const todayReports = computed(() =>
  reports.value.filter(
    (item) => item.reportDate === dayjs().format('YYYY-MM-DD'),
  ),
);
const selectedPlanProject = computed(() =>
  projects.value.find((item) => item.id === selectedPlanProjectId.value),
);
const focusPlanTasks = computed(() => ({
  delayed: planTasks.value.filter((task) => task.status === 'DELAYED'),
  dueSoon: planTasks.value.filter((task) => task.status === 'DUE_SOON'),
  inProgress: planTasks.value.filter((task) => task.status === 'IN_PROGRESS'),
}));
const reportFocusTasks = computed(() => {
  const score: Record<string, number> = {
    DELAYED: 0,
    RISK: 1,
    IN_PROGRESS: 2,
    DUE_SOON: 3,
    NOT_STARTED: 4,
    DONE: 5,
  };
  return [...planTasks.value]
    .filter((task) => !task.isSummary && task.status !== 'DONE')
    .sort((left, right) => {
      const leftScore = score[left.status] ?? 9;
      const rightScore = score[right.status] ?? 9;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return (left.plannedEndAt || '').localeCompare(right.plannedEndAt || '');
    });
});
const activeReportTaskDrafts = computed(() =>
  reportTaskDrafts.value.filter((draft) => draft.enabled),
);
const reportTaskGroups = computed(() => {
  const drafts = reportTaskDrafts.value;
  if (drafts.length === 0) return [];
  const topLevelTasks = planTasks.value.filter(
    (t) => t.isSummary && (!t.parentId || (t.outlineLevel ?? 1) === 1),
  );
  if (topLevelTasks.length === 0) {
    return [{ children: drafts, title: '全部节点' }];
  }
  const childIds = new Map<string, Set<string>>();
  function collectLeafIds(parentId: string): Set<string> {
    if (childIds.has(parentId)) return childIds.get(parentId)!;
    const ids = new Set<string>();
    for (const t of planTasks.value) {
      if (t.parentId === parentId) {
        if (t.isSummary) {
          for (const id of collectLeafIds(t.id)) ids.add(id);
        } else {
          ids.add(t.id);
        }
      }
    }
    childIds.set(parentId, ids);
    return ids;
  }
  const groups: Array<{ children: typeof drafts; title: string }> = [];
  const assigned = new Set<string>();
  for (const top of topLevelTasks) {
    const leafIds = collectLeafIds(top.id);
    const children = drafts.filter((d) => leafIds.has(d.task.id));
    if (children.length > 0) {
      groups.push({ children, title: top.taskName });
      children.forEach((d) => assigned.add(d.task.id));
    }
  }
  const unassigned = drafts.filter((d) => !assigned.has(d.task.id));
  if (unassigned.length > 0) {
    groups.push({ children: unassigned, title: '其他' });
  }
  return groups;
});
const planTaskGroups = computed(() => {
  const flat = planTasks.value;
  if (flat.length === 0) return [];
  const childrenByParent = new Map<string, SupervisionPlanTask[]>();
  for (const task of flat) {
    if (task.parentId) {
      const list = childrenByParent.get(task.parentId) ?? [];
      list.push(task);
      childrenByParent.set(task.parentId, list);
    }
  }
  const roots = flat.filter(
    (task) => !task.parentId || (task.outlineLevel ?? 1) === 1,
  );
  if (roots.length === 0) {
    return [{ children: flat, summary: undefined, title: '全部任务' }];
  }
  return roots.map((root) => {
    const collect = (parent: SupervisionPlanTask): SupervisionPlanTask[] => {
      const direct = childrenByParent.get(parent.id) ?? [];
      if (direct.length === 0) return [parent];
      const leaves: SupervisionPlanTask[] = [];
      for (const child of direct) {
        leaves.push(...collect(child));
      }
      return leaves;
    };
    const leaves = root.isSummary ? collect(root) : [root];
    return {
      children: leaves,
      summary: root.isSummary ? root : undefined,
      title: root.taskName,
    };
  });
});
const timelineBounds = computed(() => {
  const fallbackStart = dayjs();
  const starts: dayjs.Dayjs[] = [];
  const ends: dayjs.Dayjs[] = [];
  for (const task of planTasks.value) {
    if (task.plannedStartAt) starts.push(dayjs(task.plannedStartAt));
    if (task.plannedEndAt) ends.push(dayjs(task.plannedEndAt));
  }
  let start = starts[0] ?? fallbackStart;
  for (const item of starts.slice(1)) {
    if (item.isBefore(start)) start = item;
  }
  let end = ends[0] ?? start.add(1, 'day');
  for (const item of ends.slice(1)) {
    if (item.isAfter(end)) end = item;
  }
  return {
    days: Math.max(1, end.endOf('day').diff(start.startOf('day'), 'day') + 1),
    end,
    start,
  };
});
const timelineMonths = computed(() => {
  const months: string[] = [];
  let cursor = timelineBounds.value.start.startOf('month');
  const end = timelineBounds.value.end.endOf('month');
  while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
    months.push(cursor.format('YYYY年M月'));
    cursor = cursor.add(1, 'month');
  }
  return months;
});

function statusLabel(value?: string) {
  return (
    [...projectStatusOptions, ...issueStatusOptions].find(
      (item) => item.value === value,
    )?.label ||
    value ||
    '-'
  );
}

function projectStatusColor(value?: string) {
  if (value === 'COMPLETED') return 'green';
  if (value === 'IN_PROGRESS') return 'blue';
  if (value === 'PAUSED') return 'orange';
  return 'default';
}

function issueStatusColor(value?: string) {
  if (value === 'CLOSED') return 'green';
  if (value === 'VERIFYING') return 'purple';
  if (value === 'IN_PROGRESS') return 'blue';
  return 'orange';
}

function planTaskLabel(value?: string) {
  return (
    planTaskStatusOptions.find((item) => item.value === value)?.label ||
    value ||
    '-'
  );
}

function planTaskColor(value?: string) {
  return (
    planTaskStatusOptions.find((item) => item.value === value)?.color ||
    'default'
  );
}

function formatPlanTaskDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-';
}

function timelineBarStyle(task: SupervisionPlanTask) {
  const startAt = task.plannedStartAt ? dayjs(task.plannedStartAt) : null;
  const endAt = task.plannedEndAt ? dayjs(task.plannedEndAt) : startAt;
  if (!startAt || !endAt) {
    return { left: '0%', width: '2%' };
  }
  const offset = Math.max(
    0,
    startAt
      .startOf('day')
      .diff(timelineBounds.value.start.startOf('day'), 'day'),
  );
  const duration = Math.max(
    1,
    endAt.endOf('day').diff(startAt.startOf('day'), 'day') + 1,
  );
  return {
    left: `${(offset / timelineBounds.value.days) * 100}%`,
    width: `${Math.max(2, (duration / timelineBounds.value.days) * 100)}%`,
  };
}

function timelineBarClass(status?: string) {
  if (status === 'DELAYED') return 'bg-red-500';
  if (status === 'DUE_SOON') return 'bg-orange-500';
  if (status === 'DONE') return 'bg-green-500';
  if (status === 'IN_PROGRESS') return 'bg-blue-500';
  return 'bg-gray-300';
}

function taskReportReason(task: SupervisionPlanTask) {
  if (task.status === 'DELAYED') return '已延期';
  if (task.status === 'RISK') return '存在风险';
  if (task.status === 'IN_PROGRESS') return '进行中';
  if (task.status === 'DUE_SOON') return '临近计划完成';
  if (task.plannedStartAt && dayjs(task.plannedStartAt).isBefore(dayjs())) {
    return '应启动';
  }
  return '计划节点';
}

function isTaskAutoSelected(task: SupervisionPlanTask) {
  return ['DELAYED', 'DUE_SOON', 'IN_PROGRESS', 'RISK'].includes(task.status);
}

function makeReportTaskDraft(task: SupervisionPlanTask): ReportTaskDraft {
  return {
    completedQuantity: task.completedQuantity || 0,
    dailyQuantity: 0,
    enabled: isTaskAutoSelected(task),
    nextPlan: '',
    photos: [],
    plannedQuantity: task.plannedQuantity || 1,
    progressPercent: task.progressPercent || 0,
    quantityUnit: task.quantityUnit || '项',
    riskReason: task.riskReason || '',
    status:
      task.status === 'DUE_SOON' || task.status === 'NOT_STARTED'
        ? 'IN_PROGRESS'
        : task.status,
    task,
    workContent: '',
  };
}

function syncReportTaskDrafts() {
  const existing = new Map(
    reportTaskDrafts.value.map((draft) => [draft.task.id, draft]),
  );
  reportTaskDrafts.value = reportFocusTasks.value.map((task) => {
    const draft = existing.get(task.id);
    if (!draft) return makeReportTaskDraft(task);
    draft.task = task;
    return draft;
  });
}

function calculateDraftProgress(draft: ReportTaskDraft) {
  const planned = Number(draft.plannedQuantity || 0);
  if (planned <= 0) return 0;
  const completed = Number(draft.completedQuantity || 0);
  return Math.min(100, Math.max(0, Math.round((completed / planned) * 100)));
}

function handleDraftDailyQuantityChange(draft: ReportTaskDraft) {
  const current = Number(draft.task.completedQuantity || 0);
  const planned = Number(draft.plannedQuantity || 0);
  const daily = Number(draft.dailyQuantity || 0);
  draft.completedQuantity = Math.min(
    planned || current + daily,
    current + daily,
  );
  draft.progressPercent = calculateDraftProgress(draft);
}

function handleDraftCompletedQuantityChange(draft: ReportTaskDraft) {
  draft.completedQuantity = Math.min(
    Number(draft.plannedQuantity || 0),
    Math.max(0, Number(draft.completedQuantity || 0)),
  );
  draft.progressPercent = calculateDraftProgress(draft);
  if (draft.progressPercent >= 100) {
    draft.status = 'DONE';
  }
}

function projectTableRow(record: SupervisionProject) {
  return {
    class: 'clickable-row',
    onClick: () => openProjectDetail(record),
  };
}

function openProjectDetail(project: SupervisionProject) {
  detailProject.value = project;
  projectDetailDrawerOpen.value = true;
}

async function openProjectPlan(project: SupervisionProject) {
  selectedPlanProjectId.value = project.id;
  activeTab.value = 'gantt';
  await loadPlanTasks(project.id);
}

async function handleReportProjectChange() {
  selectedPlanProjectId.value = reportForm.projectId;
  reportForm.taskId = '';
  await loadPlanTasks(reportForm.projectId);
  syncReportTaskDrafts();
}

function toDate(value?: dayjs.Dayjs | string) {
  if (!value) return undefined;
  return typeof value === 'string'
    ? dayjs(value).format('YYYY-MM-DD')
    : value.format('YYYY-MM-DD');
}

function toUploadFiles(urls: string[]) {
  return (urls || []).map((url, index) => ({
    name: `file-${index + 1}`,
    status: 'done',
    uid: `supervision-${index}-${url}`,
    url,
  })) as UploadFile[];
}

function uploadUrls(files: UploadFile[]) {
  return files
    .map((file) => {
      const response = getUploadResponse(file);
      return String(file.url || response?.data?.url || '').trim();
    })
    .filter(Boolean);
}

async function handlePlanTaskImport(file: UploadFile) {
  if (!selectedPlanProjectId.value) {
    message.warning('请选择监造项目');
    return;
  }
  const response = getUploadResponse(file);
  const fileUrl = String(file.url || response?.data?.url || '').trim();
  const storedName = fileUrl.split('/').pop() || '';
  const fileName = String(
    response?.data?.originalName || file.name || '',
  ).trim();
  if (!fileUrl) {
    message.error('计划文件上传结果无效');
    return;
  }
  importingPlanTasks.value = true;
  try {
    const data = await importSupervisionPlanTasks(selectedPlanProjectId.value, {
      fileName,
      fileUrl,
      storedName,
    });
    planTasks.value = data.items || [];
    planTaskSummary.value = data.summary;
    message.success(`已导入 ${data.summary.total} 条甘特任务`);
    await loadProjects();
  } finally {
    importingPlanTasks.value = false;
  }
}

async function loadProjects() {
  loadingProjects.value = true;
  try {
    const data = await getSupervisionProjects({ page: 1, pageSize: 100 });
    projects.value = data.items || [];
  } finally {
    loadingProjects.value = false;
  }
}

async function loadReports() {
  loadingReports.value = true;
  try {
    const data = await getSupervisionReports({ page: 1, pageSize: 100 });
    reports.value = data.items || [];
  } finally {
    loadingReports.value = false;
  }
}

function editReport(record: SupervisionDailyReport) {
  reportForm.projectId = record.projectId;
  reportForm.reporter = record.reporter;
  reportForm.workContent = record.workContent || '';
  reportForm.reportDate = dayjs(record.reportDate);
  reportDrawerOpen.value = true;
}

function deleteReport(record: SupervisionDailyReport) {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除 ${record.reportDate} 的日报？`,
    okType: 'danger',
    async onOk() {
      try {
        await deleteSupervisionReport(record.id);
        message.success('日报已删除');
        await loadReports();
      } catch (error: any) {
        message.error(error?.message || '删除失败');
      }
    },
  });
}

async function loadIssues() {
  loadingIssues.value = true;
  try {
    const data = await getSupervisionIssues({ page: 1, pageSize: 100 });
    issues.value = data.items || [];
  } finally {
    loadingIssues.value = false;
  }
}

async function loadPlanTasks(projectId = selectedPlanProjectId.value) {
  if (!projectId) {
    planTasks.value = [];
    planTaskSummary.value = {
      delayed: 0,
      done: 0,
      dueSoon: 0,
      inProgress: 0,
      notStarted: 0,
      progressPercent: 0,
      total: 0,
    };
    return;
  }
  loadingPlanTasks.value = true;
  try {
    const data = await getSupervisionPlanTasks(projectId);
    planTasks.value = data.items || [];
    planTaskSummary.value = data.summary;
    if (reportDrawerOpen.value && reportForm.projectId === projectId) {
      syncReportTaskDrafts();
    }
  } finally {
    loadingPlanTasks.value = false;
  }
}

async function loadUsers() {
  const data = await getUserList({ page: 1, pageSize: 200 });
  users.value = data.items || [];
}

async function refreshAll() {
  await Promise.all([loadProjects(), loadReports(), loadIssues(), loadUsers()]);
  if (!selectedPlanProjectId.value && projects.value[0]?.id) {
    selectedPlanProjectId.value = projects.value[0].id;
  }
  await loadPlanTasks();
}

function resetProjectForm() {
  Object.assign(projectForm, {
    plannedEndAt: undefined,
    plannedStartAt: undefined,
    projectName: '',
    supplierName: '',
    supervisor: '',
  });
  editingProjectId.value = '';
}

async function openProjectDrawer(record?: SupervisionProject) {
  resetProjectForm();
  if (record) {
    editingProjectId.value = record.id;
    Object.assign(projectForm, {
      plannedEndAt: record.plannedEndAt
        ? dayjs(record.plannedEndAt)
        : undefined,
      plannedStartAt: record.plannedStartAt
        ? dayjs(record.plannedStartAt)
        : undefined,
      projectName: record.projectName,
      supplierName: record.supplierName || '',
      supervisor: record.supervisor || '',
    });
  }
  projectDrawerOpen.value = true;
}

function buildProjectPayload() {
  return {
    plannedEndAt: toDate(projectForm.plannedEndAt),
    plannedStartAt: toDate(projectForm.plannedStartAt),
    projectName: projectForm.projectName,
    supplierName: projectForm.supplierName,
    supervisor: projectForm.supervisor,
  };
}

async function submitProject() {
  if (!projectForm.projectName.trim()) {
    message.warning('项目名称不能为空');
    return;
  }
  const payload = buildProjectPayload();
  editingProjectId.value
    ? await updateSupervisionProject(editingProjectId.value, payload)
    : await createSupervisionProject(payload);
  projectDrawerOpen.value = false;
  message.success('监造项目已保存');
  await refreshAll();
}

function openReportDrawer(project?: SupervisionProject) {
  Object.assign(reportForm, {
    attachments: [],
    completedMilestone: project?.stage || '',
    coordinationNeeded: '',
    issueSummary: '',
    location: project?.location || '',
    manpower: 0,
    progressPercent: project?.progressPercent || 0,
    projectId: project?.id || '',
    reportDate: dayjs(),
    reporter: project?.supervisor || '',
    taskId: '',
    taskNextPlan: '',
    taskProgressPercent: 0,
    taskRiskReason: '',
    taskStatus: 'IN_PROGRESS',
    taskWorkContent: '',
    tomorrowPlan: '',
    weather: '',
    workContent: '',
  });
  reportTaskDrafts.value = [];
  if (project?.id) {
    selectedPlanProjectId.value = project.id;
    loadPlanTasks(project.id).then(syncReportTaskDrafts);
  }
  reportDrawerOpen.value = true;
}

async function submitReport() {
  if (!reportForm.projectId || !reportForm.reporter.trim()) {
    message.warning('监造项目和监造人员不能为空');
    return;
  }
  const selectedDrafts = activeReportTaskDrafts.value;
  if (selectedDrafts.length === 0) {
    message.warning('请选择至少一个甘特节点进行汇报');
    return;
  }
  await createSupervisionReport({
    attachments: uploadUrls(reportForm.attachments),
    completedMilestone: reportForm.completedMilestone,
    coordinationNeeded: reportForm.coordinationNeeded,
    issueSummary: reportForm.issueSummary,
    location: reportForm.location,
    manpower: reportForm.manpower,
    progressPercent: reportForm.progressPercent,
    projectId: reportForm.projectId,
    reportDate: reportForm.reportDate.format('YYYY-MM-DD'),
    reporter: reportForm.reporter,
    taskUpdates: selectedDrafts.map((draft) => ({
      completedQuantity: draft.completedQuantity,
      dailyQuantity: draft.dailyQuantity,
      nextPlan: draft.nextPlan,
      photos: uploadUrls(draft.photos),
      plannedQuantity: draft.plannedQuantity,
      progressPercent: draft.progressPercent,
      quantityUnit: draft.quantityUnit,
      riskReason: draft.riskReason,
      status: draft.status,
      taskId: draft.task.id,
      taskName: draft.task.taskName,
      taskNo: draft.task.taskNo,
      workContent: draft.workContent,
    })),
    tomorrowPlan: reportForm.tomorrowPlan,
    weather: reportForm.weather,
    workContent: reportForm.workContent,
  });
  reportDrawerOpen.value = false;
  message.success('监造日报已提交');
  await Promise.all([refreshAll(), loadPlanTasks(reportForm.projectId)]);
}

function resetIssueForm() {
  Object.assign(issueForm, {
    affectsProgress: false,
    correctiveAction: '',
    description: '',
    dueAt: undefined,
    estimatedLoss: 0,
    isClaim: false,
    issueType: 'QUALITY',
    photos: [],
    projectId: '',
    rectificationPhotos: [],
    responsibleUnit: '',
    severity: 'major',
    status: 'OPEN',
    verifyResult: '',
  });
  editingIssueId.value = '';
}

function openIssueDrawer(
  record?: SupervisionIssue,
  project?: SupervisionProject,
) {
  resetIssueForm();
  if (record) {
    editingIssueId.value = record.id;
    Object.assign(issueForm, {
      affectsProgress: record.affectsProgress,
      correctiveAction: record.correctiveAction || '',
      description: record.description,
      dueAt: record.dueAt ? dayjs(record.dueAt) : undefined,
      estimatedLoss: record.estimatedLoss || 0,
      isClaim: record.isClaim,
      issueType: record.issueType || 'QUALITY',
      photos: toUploadFiles(record.photos || []),
      projectId: record.projectId,
      rectificationPhotos: toUploadFiles(record.rectificationPhotos || []),
      responsibleUnit: record.responsibleUnit || '',
      severity: record.severity || 'major',
      status: record.status,
      verifyResult: record.verifyResult || '',
    });
  } else if (project) {
    issueForm.projectId = project.id;
    issueForm.responsibleUnit = project.supplierName || '';
  }
  issueDrawerOpen.value = true;
}

async function submitIssue() {
  if (!issueForm.projectId || !issueForm.description.trim()) {
    message.warning('监造项目和问题描述不能为空');
    return;
  }
  const payload = {
    affectsProgress: issueForm.affectsProgress,
    correctiveAction: issueForm.correctiveAction,
    description: issueForm.description,
    dueAt: toDate(issueForm.dueAt),
    estimatedLoss: issueForm.estimatedLoss,
    isClaim: issueForm.isClaim,
    issueType: issueForm.issueType,
    photos: uploadUrls(issueForm.photos),
    projectId: issueForm.projectId,
    rectificationPhotos: uploadUrls(issueForm.rectificationPhotos),
    responsibleUnit: issueForm.responsibleUnit,
    severity: issueForm.severity,
    status: issueForm.status,
    verifyResult: issueForm.verifyResult,
  };
  await (editingIssueId.value
    ? updateSupervisionIssue(editingIssueId.value, payload)
    : createSupervisionIssue(payload));
  issueDrawerOpen.value = false;
  message.success('监造问题已保存');
  await refreshAll();
}

async function openActionDrawer(issue: SupervisionIssue) {
  editingIssueId.value = issue.id;
  Object.assign(actionForm, {
    actionType: 'FOLLOW_UP',
    attachments: [],
    description: '',
    rectificationPhotos: toUploadFiles(issue.rectificationPhotos || []),
    status: issue.status === 'OPEN' ? 'IN_PROGRESS' : issue.status,
    verifyResult: issue.verifyResult || '',
  });
  issueActions.value = await getSupervisionIssueActions(issue.id);
  actionDrawerOpen.value = true;
}

async function submitAction() {
  if (!editingIssueId.value) return;
  await createSupervisionIssueAction(editingIssueId.value, {
    actionType: actionForm.actionType,
    attachments: uploadUrls(actionForm.attachments),
    description: actionForm.description,
    rectificationPhotos: uploadUrls(actionForm.rectificationPhotos),
    status: actionForm.status,
    verifyResult: actionForm.verifyResult,
  });
  actionDrawerOpen.value = false;
  message.success('处理记录已保存');
  await refreshAll();
}

onMounted(refreshAll);
</script>

<template>
  <Page content-class="p-3 md:p-4">
    <div class="space-y-4">
      <Tabs v-model:active-key="activeTab">
        <Tabs.TabPane key="projects" tab="监造项目">
          <Card>
            <div
              class="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
            >
              <Space wrap>
                <Button type="primary" @click="openProjectDrawer()">
                  新建项目
                </Button>
                <Select
                  v-model:value="projectTypeFilter"
                  allow-clear
                  class="w-[180px]"
                  placeholder="项目类型"
                  :options="projectTypeOptions"
                />
                <Button @click="refreshAll">刷新</Button>
              </Space>
              <div class="text-xs text-gray-500">监造项目管理</div>
            </div>

            <div class="hidden md:block">
              <Table
                row-key="id"
                :data-source="visibleProjects"
                :loading="loadingProjects"
                :pagination="{ pageSize: 10 }"
                :custom-row="projectTableRow"
              >
                <Table.Column title="项目" width="240">
                  <template #default="{ record }">
                    <span class="font-medium">{{ record.projectName }}</span>
                  </template>
                </Table.Column>
                <Table.Column
                  title="供应商"
                  data-index="supplierName"
                  width="160"
                />
                <Table.Column
                  title="监造员"
                  data-index="supervisor"
                  width="120"
                />
                <Table.Column title="进度" width="160">
                  <template #default="{ record }">
                    <Progress :percent="record.progressPercent" size="small" />
                  </template>
                </Table.Column>
                <Table.Column title="状态" width="100">
                  <template #default="{ record }">
                    <Tag :color="projectStatusColor(record.status)">
                      {{ statusLabel(record.status) }}
                    </Tag>
                  </template>
                </Table.Column>
                <Table.Column title="问题" width="100">
                  <template #default="{ record }">
                    {{ record.openIssueCount || 0 }} /
                    {{ record.totalIssueCount || 0 }}
                  </template>
                </Table.Column>
                <Table.Column title="操作" width="160" fixed="right">
                  <template #default="{ record }">
                    <Space @click.stop>
                      <Button
                        size="small"
                        type="link"
                        @click="openProjectPlan(record)"
                      >
                        甘特
                      </Button>
                      <Button
                        size="small"
                        type="link"
                        @click="openProjectDrawer(record)"
                      >
                        编辑
                      </Button>
                    </Space>
                  </template>
                </Table.Column>
              </Table>
            </div>

            <div class="space-y-3 md:hidden">
              <Card
                v-for="record in visibleProjects"
                :key="record.id"
                size="small"
                class="mobile-card"
                @click="openProjectDetail(record)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="font-medium">{{ record.projectName }}</div>
                    <div class="text-xs text-gray-500">
                      {{ record.supplierName || '-' }}
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <Tag :color="projectStatusColor(record.status)">
                      {{ statusLabel(record.status) }}
                    </Tag>
                  </div>
                </div>
                <Progress class="mt-2" :percent="record.progressPercent" />
                <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div class="text-gray-400">监造</div>
                    <div>{{ record.supervisor || '-' }}</div>
                  </div>
                  <div>
                    <div class="text-gray-400">问题</div>
                    <div>
                      {{ record.openIssueCount || 0 }} /
                      {{ record.totalIssueCount || 0 }}
                    </div>
                  </div>
                </div>
                <div class="mt-3 flex gap-2" @click.stop>
                  <Button block size="small" @click="openProjectPlan(record)">
                    计划
                  </Button>
                  <Button block size="small" @click="openReportDrawer(record)">
                    日报
                  </Button>
                  <Button
                    block
                    size="small"
                    @click="openIssueDrawer(undefined, record)"
                  >
                    问题
                  </Button>
                  <Button block size="small" @click="openProjectDrawer(record)">
                    编辑
                  </Button>
                </div>
              </Card>
            </div>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="gantt" tab="甘特计划">
          <Card>
            <div
              class="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
            >
              <Space wrap>
                <Select
                  v-model:value="selectedPlanProjectId"
                  class="min-w-[260px]"
                  show-search
                  :filter-option="true"
                  :options="projectOptions"
                  @change="() => loadPlanTasks()"
                />
                <QmsFileUpload
                  accept=".xls,.xlsx"
                  button-text="导入Excel计划"
                  :disabled="!selectedPlanProjectId || importingPlanTasks"
                  :max-count="1"
                  @uploaded="handlePlanTaskImport"
                />
                <Button @click="loadPlanTasks()">刷新</Button>
              </Space>
              <div class="text-xs text-gray-500">
                导入后按当前日期自动计算进行中、临期、延期和完成状态
              </div>
            </div>

            <div
              v-if="!selectedPlanProject"
              class="py-8 text-center text-gray-400"
            >
              请先创建或选择监造项目
            </div>

            <template v-else>
              <div class="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
                <div class="rounded bg-gray-50 px-3 py-2 text-center">
                  <div class="text-xs text-gray-500">任务</div>
                  <div class="font-semibold">{{ planTaskSummary.total }}</div>
                </div>
                <div
                  class="rounded bg-blue-50 px-3 py-2 text-center text-blue-700"
                >
                  <div class="text-xs">进行中</div>
                  <div class="font-semibold">
                    {{ planTaskSummary.inProgress }}
                  </div>
                </div>
                <div
                  class="rounded bg-orange-50 px-3 py-2 text-center text-orange-700"
                >
                  <div class="text-xs">临期</div>
                  <div class="font-semibold">{{ planTaskSummary.dueSoon }}</div>
                </div>
                <div
                  class="rounded bg-red-50 px-3 py-2 text-center text-red-700"
                >
                  <div class="text-xs">延期</div>
                  <div class="font-semibold">{{ planTaskSummary.delayed }}</div>
                </div>
                <div
                  class="rounded bg-green-50 px-3 py-2 text-center text-green-700"
                >
                  <div class="text-xs">完成</div>
                  <div class="font-semibold">{{ planTaskSummary.done }}</div>
                </div>
                <div
                  class="rounded bg-cyan-50 px-3 py-2 text-center text-cyan-700"
                >
                  <div class="text-xs">平均进度</div>
                  <div class="font-semibold">
                    {{ planTaskSummary.progressPercent }}%
                  </div>
                </div>
              </div>

              <div class="mb-3 flex justify-end">
                <Segmented
                  v-model:value="ganttView"
                  :options="ganttViewOptions"
                />
              </div>

              <div
                v-if="planTasks.length === 0"
                class="py-8 text-center text-gray-400"
              >
                暂无甘特计划
              </div>

              <div v-else-if="ganttView === 'focus'" class="space-y-4">
                <div
                  v-for="section in [
                    {
                      key: 'inProgress',
                      title: '正在执行',
                      items: focusPlanTasks.inProgress,
                      color: 'blue',
                    },
                    {
                      key: 'dueSoon',
                      title: '临期任务',
                      items: focusPlanTasks.dueSoon,
                      color: 'orange',
                    },
                    {
                      key: 'delayed',
                      title: '延期任务',
                      items: focusPlanTasks.delayed,
                      color: 'red',
                    },
                  ]"
                  :key="section.key"
                >
                  <div class="mb-2 flex items-center justify-between">
                    <div class="font-medium">{{ section.title }}</div>
                    <Tag :color="section.color">{{ section.items.length }}</Tag>
                  </div>
                  <div class="grid grid-cols-1 gap-2 lg:grid-cols-3">
                    <Card
                      v-for="task in section.items.slice(0, 9)"
                      :key="task.id"
                      size="small"
                      class="gantt-task-card"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <div class="font-medium">
                            {{ task.taskNo }} {{ task.taskName }}
                          </div>
                          <div class="mt-1 text-xs text-gray-500">
                            {{ formatPlanTaskDate(task.plannedStartAt) }} 至
                            {{ formatPlanTaskDate(task.plannedEndAt) }}
                          </div>
                        </div>
                        <Tag :color="planTaskColor(task.status)">
                          {{ planTaskLabel(task.status) }}
                        </Tag>
                      </div>
                      <Progress
                        class="mt-2"
                        :percent="task.progressPercent"
                        size="small"
                      />
                      <div class="mt-1 text-xs text-gray-500">
                        前置任务：{{ task.predecessorText || '-' }}
                      </div>
                    </Card>
                    <div
                      v-if="section.items.length === 0"
                      class="rounded border border-dashed px-3 py-6 text-center text-sm text-gray-400"
                    >
                      暂无{{ section.title }}
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="ganttView === 'stage'" class="space-y-3">
                <Card
                  v-for="group in planTaskGroups"
                  :key="group.title"
                  size="small"
                  class="gantt-stage-card"
                >
                  <div class="mb-2 flex items-center justify-between">
                    <div class="min-w-0">
                      <div class="font-medium">{{ group.title }}</div>
                      <div v-if="group.summary" class="text-xs text-gray-500">
                        {{ formatPlanTaskDate(group.summary.plannedStartAt) }}
                        至
                        {{ formatPlanTaskDate(group.summary.plannedEndAt) }}
                        · 汇总进度
                        {{ group.summary.progressPercent }}%
                      </div>
                    </div>
                    <Tag>{{ group.children.length }} 项</Tag>
                  </div>
                  <div class="space-y-2">
                    <div
                      v-for="task in group.children"
                      :key="task.id"
                      class="rounded bg-gray-50 px-3 py-2"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="truncate text-sm font-medium">
                            {{ task.taskNo }} {{ task.taskName }}
                          </div>
                          <div class="text-xs text-gray-500">
                            {{ formatPlanTaskDate(task.plannedStartAt) }} 至
                            {{ formatPlanTaskDate(task.plannedEndAt) }}
                          </div>
                        </div>
                        <Tag :color="planTaskColor(task.status)">
                          {{ planTaskLabel(task.status) }}
                        </Tag>
                      </div>
                      <Progress
                        class="mt-1"
                        :percent="task.progressPercent"
                        size="small"
                      />
                    </div>
                  </div>
                </Card>
              </div>

              <div v-else-if="ganttView === 'timeline'" class="hidden md:block">
                <div class="overflow-x-auto rounded border">
                  <div class="min-w-[980px]">
                    <div
                      class="grid grid-cols-[260px_1fr] border-b bg-gray-50 text-xs text-gray-500"
                    >
                      <div class="px-3 py-2">任务</div>
                      <div
                        class="grid"
                        :style="{
                          gridTemplateColumns: `repeat(${timelineMonths.length}, minmax(120px, 1fr))`,
                        }"
                      >
                        <div
                          v-for="month in timelineMonths"
                          :key="month"
                          class="border-l px-2 py-2"
                        >
                          {{ month }}
                        </div>
                      </div>
                    </div>
                    <div
                      v-for="task in planTasks"
                      :key="task.id"
                      class="grid grid-cols-[260px_1fr] border-b last:border-b-0"
                    >
                      <div class="px-3 py-2 text-sm">
                        <div class="truncate font-medium">
                          {{ task.taskNo }} {{ task.taskName }}
                        </div>
                        <div class="text-xs text-gray-500">
                          {{ task.durationText || '-' }}
                        </div>
                      </div>
                      <div class="relative my-3 h-7 border-l bg-gray-50">
                        <div
                          class="absolute top-1 h-5 rounded px-2 text-[11px] leading-5 text-white"
                          :class="timelineBarClass(task.status)"
                          :style="timelineBarStyle(task)"
                        >
                          {{ task.progressPercent }}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="ganttView === 'timeline'" class="space-y-3 md:hidden">
                <Card
                  v-for="task in planTasks"
                  :key="task.id"
                  size="small"
                  class="mobile-card"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="font-medium">
                        {{ task.taskNo }} {{ task.taskName }}
                      </div>
                      <div class="text-xs text-gray-500">
                        {{ formatPlanTaskDate(task.plannedStartAt) }} 至
                        {{ formatPlanTaskDate(task.plannedEndAt) }}
                      </div>
                    </div>
                    <Tag :color="planTaskColor(task.status)">
                      {{ planTaskLabel(task.status) }}
                    </Tag>
                  </div>
                  <Progress class="mt-2" :percent="task.progressPercent" />
                </Card>
              </div>

              <div v-else-if="ganttView === 'all'">
                <Table
                  row-key="id"
                  :data-source="planTasks"
                  :loading="loadingPlanTasks || importingPlanTasks"
                  :pagination="{ pageSize: 20 }"
                  :scroll="{ x: 1120 }"
                >
                  <Table.Column title="标识号" data-index="taskNo" width="90" />
                  <Table.Column title="任务名称" data-index="taskName" />
                  <Table.Column title="工期" width="100">
                    <template #default="{ record }">
                      {{ record.durationText || record.durationDays || '-' }}
                    </template>
                  </Table.Column>
                  <Table.Column title="计划开始" width="150">
                    <template #default="{ record }">
                      {{ formatPlanTaskDate(record.plannedStartAt) }}
                    </template>
                  </Table.Column>
                  <Table.Column title="计划完成" width="150">
                    <template #default="{ record }">
                      {{ formatPlanTaskDate(record.plannedEndAt) }}
                    </template>
                  </Table.Column>
                  <Table.Column title="进度" width="150">
                    <template #default="{ record }">
                      <Progress
                        :percent="record.progressPercent"
                        size="small"
                      />
                    </template>
                  </Table.Column>
                  <Table.Column title="状态" width="110">
                    <template #default="{ record }">
                      <Tag :color="planTaskColor(record.status)">
                        {{ planTaskLabel(record.status) }}
                      </Tag>
                    </template>
                  </Table.Column>
                  <Table.Column
                    title="前置任务"
                    data-index="predecessorText"
                    width="120"
                  />
                </Table>
              </div>

              <div v-else-if="ganttView === 'edit'">
                <GanttTaskEditor
                  :project-id="selectedPlanProjectId"
                  :reporter="selectedPlanProject?.supervisor || ''"
                  :tasks="planTasks"
                  @refresh="loadPlanTasks(selectedPlanProjectId)"
                />
              </div>
            </template>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="reports" tab="现场日报">
          <Card>
            <div class="mb-3 flex items-center justify-between">
              <Space wrap>
                <Button type="primary" @click="openReportDrawer()">
                  新建日报
                </Button>
                <Button @click="loadReports">刷新</Button>
              </Space>
              <div class="text-xs text-gray-500">
                今日已提交 {{ todayReports.length }} 条
              </div>
            </div>
            <div class="hidden md:block">
              <Table
                row-key="id"
                :data-source="reports"
                :loading="loadingReports"
                :pagination="{ pageSize: 10 }"
              >
                <Table.Column
                  title="日期"
                  data-index="reportDate"
                  width="120"
                />
                <Table.Column
                  title="项目"
                  data-index="projectName"
                  width="160"
                />
                <Table.Column
                  title="监造员"
                  data-index="reporter"
                  width="100"
                />
                <Table.Column title="推进节点">
                  <template #default="{ record }">
                    <div
                      v-if="(record.taskUpdates || []).length > 0"
                      class="space-y-1"
                    >
                      <div
                        v-for="item in record.taskUpdates || []"
                        :key="item.id || item.taskId"
                        class="flex items-center gap-2 text-sm"
                      >
                        <Tag :color="planTaskColor(item.status)" size="small">
                          {{ planTaskLabel(item.status) }}
                        </Tag>
                        <span class="truncate">{{
                          item.taskName || item.taskNo
                        }}</span>
                        <span class="whitespace-nowrap text-xs text-gray-500">
                          {{
                            Math.max(
                              0,
                              item.progressPercent -
                                Math.round(
                                  ((item.dailyQuantity || 0) /
                                    (item.plannedQuantity || 1)) *
                                    100,
                                ),
                            )
                          }}% → {{ item.progressPercent }}%
                        </span>
                        <span
                          v-if="item.dailyQuantity"
                          class="whitespace-nowrap text-xs text-green-600"
                        >
                          +{{ item.dailyQuantity }}{{ item.quantityUnit || '' }}
                        </span>
                      </div>
                    </div>
                    <span v-else class="text-gray-400">-</span>
                  </template>
                </Table.Column>
                <Table.Column
                  title="工作内容"
                  data-index="workContent"
                  width="200"
                  ellipsis
                />
                <Table.Column title="操作" width="120" fixed="right">
                  <template #default="{ record }">
                    <Space>
                      <Button
                        size="small"
                        type="link"
                        @click="editReport(record)"
                        >编辑</Button
                      >
                      <Button
                        size="small"
                        type="link"
                        danger
                        @click="deleteReport(record)"
                        >删除</Button
                      >
                    </Space>
                  </template>
                </Table.Column>
              </Table>
            </div>
            <div class="space-y-3 md:hidden">
              <Card v-for="record in reports" :key="record.id" size="small">
                <div class="flex items-center justify-between">
                  <div class="font-medium">{{ record.projectName }}</div>
                  <span class="text-xs text-gray-500">{{
                    record.reportDate
                  }}</span>
                </div>
                <div class="mt-1 text-xs text-gray-500">
                  {{ record.reporter }}
                </div>
                <div
                  v-if="(record.taskUpdates || []).length > 0"
                  class="mt-2 space-y-1"
                >
                  <div
                    v-for="item in record.taskUpdates || []"
                    :key="item.id || item.taskId"
                    class="flex items-center gap-2 text-sm"
                  >
                    <Tag :color="planTaskColor(item.status)" size="small">
                      {{ planTaskLabel(item.status) }}
                    </Tag>
                    <span class="truncate">{{
                      item.taskName || item.taskNo
                    }}</span>
                    <span class="text-xs text-gray-500">
                      {{
                        Math.max(
                          0,
                          item.progressPercent -
                            Math.round(
                              ((item.dailyQuantity || 0) /
                                (item.plannedQuantity || 1)) *
                                100,
                            ),
                        )
                      }}% → {{ item.progressPercent }}%
                    </span>
                    <span
                      v-if="item.dailyQuantity"
                      class="text-xs text-green-600"
                      >+{{ item.dailyQuantity }}</span
                    >
                  </div>
                </div>
                <div
                  v-if="record.workContent"
                  class="mt-2 text-sm text-gray-600"
                >
                  {{ record.workContent }}
                </div>
              </Card>
            </div>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="issues" tab="问题闭环">
          <Card>
            <div class="mb-3 flex items-center justify-between">
              <Space wrap>
                <Button type="primary" @click="openIssueDrawer()">
                  新建问题
                </Button>
                <Button @click="loadIssues">刷新</Button>
              </Space>
              <div class="text-xs text-gray-500">
                未闭环 {{ openIssues.length }} 条
              </div>
            </div>
            <div class="hidden md:block">
              <Table
                row-key="id"
                :data-source="issues"
                :loading="loadingIssues"
                :pagination="{ pageSize: 10 }"
                :scroll="{ x: 1200 }"
              >
                <Table.Column title="编号" data-index="issueNo" width="140" />
                <Table.Column
                  title="项目"
                  data-index="projectName"
                  width="170"
                />
                <Table.Column title="描述" data-index="description" />
                <Table.Column
                  title="责任单位"
                  data-index="responsibleUnit"
                  width="140"
                />
                <Table.Column title="照片" width="90">
                  <template #default="{ record }">
                    <Tag v-if="record.photos?.length" color="blue">
                      {{ record.photos.length }} 张
                    </Tag>
                    <span v-else>-</span>
                  </template>
                </Table.Column>
                <Table.Column title="索赔" width="90">
                  <template #default="{ record }">
                    <Tag :color="record.isClaim ? 'red' : 'default'">
                      {{ record.isClaim ? '是' : '否' }}
                    </Tag>
                  </template>
                </Table.Column>
                <Table.Column title="状态" width="110">
                  <template #default="{ record }">
                    <Tag :color="issueStatusColor(record.status)">
                      {{ statusLabel(record.status) }}
                    </Tag>
                  </template>
                </Table.Column>
                <Table.Column title="操作" width="170" fixed="right">
                  <template #default="{ record }">
                    <Space>
                      <Button
                        size="small"
                        type="link"
                        @click="openIssueDrawer(record)"
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        type="link"
                        @click="openActionDrawer(record)"
                      >
                        处理
                      </Button>
                    </Space>
                  </template>
                </Table.Column>
              </Table>
            </div>
            <div class="space-y-3 md:hidden">
              <Card v-for="record in issues" :key="record.id" size="small">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="font-medium">{{ record.projectName }}</div>
                    <div class="text-xs text-gray-500">
                      {{ record.issueNo }}
                    </div>
                  </div>
                  <Tag :color="issueStatusColor(record.status)">
                    {{ statusLabel(record.status) }}
                  </Tag>
                </div>
                <div class="mt-2 text-sm">{{ record.description }}</div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <Tag>{{ record.responsibleUnit || '-' }}</Tag>
                  <Tag :color="record.isClaim ? 'red' : 'default'">
                    {{ record.isClaim ? '索赔' : '不索赔' }}
                  </Tag>
                  <Tag v-if="record.affectsProgress" color="orange"
                    >影响进度</Tag
                  >
                </div>
                <div v-if="record.photos?.length" class="mt-2 flex gap-2">
                  <Image
                    v-for="url in record.photos.slice(0, 3)"
                    :key="url"
                    :src="url"
                    :width="56"
                    :height="56"
                    class="rounded object-cover"
                  />
                </div>
                <div class="mt-3 flex gap-2">
                  <Button block size="small" @click="openActionDrawer(record)">
                    处理
                  </Button>
                  <Button block size="small" @click="openIssueDrawer(record)">
                    编辑
                  </Button>
                </div>
              </Card>
            </div>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane key="deadline" tab="纳期管控">
          <DeadlineBoard />
        </Tabs.TabPane>
      </Tabs>
    </div>

    <Drawer
      v-model:open="projectDetailDrawerOpen"
      title="监造项目详情"
      width="640"
    >
      <div v-if="detailProject" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-lg font-semibold">
              {{ detailProject.projectName }}
            </div>
          </div>
          <Space wrap>
            <Tag :color="projectStatusColor(detailProject.status)">
              {{ statusLabel(detailProject.status) }}
            </Tag>
          </Space>
        </div>

        <Progress :percent="detailProject.progressPercent" />

        <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-2">
          <div class="rounded bg-blue-50 px-3 py-2 text-blue-700">
            <div class="text-xs">未闭环问题</div>
            <div class="font-semibold">
              {{ detailProject.openIssueCount || 0 }} /
              {{ detailProject.totalIssueCount || 0 }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <div class="text-xs text-gray-500">供应商</div>
            <div>{{ detailProject.supplierName || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">监造人员</div>
            <div>{{ detailProject.supervisor || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">计划周期</div>
            <div>
              {{ detailProject.plannedStartAt || '-' }} 至
              {{ detailProject.plannedEndAt || '-' }}
            </div>
          </div>
        </div>

        <div>
          <div class="text-xs text-gray-500">项目说明</div>
          <div class="mt-1 whitespace-pre-wrap text-sm">
            {{ detailProject.summary || '-' }}
          </div>
        </div>
      </div>
      <template #footer>
        <Space>
          <Button @click="projectDetailDrawerOpen = false">关闭</Button>
          <Button
            v-if="detailProject"
            @click="
              projectDetailDrawerOpen = false;
              openProjectPlan(detailProject);
            "
          >
            甘特计划
          </Button>
          <Button
            v-if="detailProject"
            type="primary"
            @click="
              projectDetailDrawerOpen = false;
              openProjectDrawer(detailProject);
            "
          >
            编辑
          </Button>
        </Space>
      </template>
    </Drawer>

    <Drawer
      v-model:open="projectDrawerOpen"
      :title="editingProjectId ? '编辑监造项目' : '新建监造项目'"
      width="480"
    >
      <Form layout="vertical">
        <Form.Item label="项目名称" required>
          <Input
            v-model:value="projectForm.projectName"
            placeholder="输入项目名称"
          />
        </Form.Item>
        <Form.Item label="供应商">
          <SupplierSelect
            v-model:value="projectForm.supplierName"
            category="Supplier"
          />
        </Form.Item>
        <Form.Item label="监造员">
          <Select
            v-model:value="projectForm.supervisor"
            show-search
            allow-clear
            :options="userOptions"
            placeholder="选择监造员"
          />
        </Form.Item>
        <div class="grid grid-cols-2 gap-3">
          <Form.Item label="计划开始">
            <DatePicker
              v-model:value="projectForm.plannedStartAt"
              class="w-full"
            />
          </Form.Item>
          <Form.Item label="计划结束">
            <DatePicker
              v-model:value="projectForm.plannedEndAt"
              class="w-full"
            />
          </Form.Item>
        </div>
      </Form>
      <template #footer>
        <Space>
          <Button @click="projectDrawerOpen = false">取消</Button>
          <Button type="primary" @click="submitProject">保存</Button>
        </Space>
      </template>
    </Drawer>

    <Drawer
      v-model:open="reportDrawerOpen"
      title="提交节点推进日报"
      width="860"
    >
      <Form layout="vertical">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Form.Item label="监造项目" required>
            <Select
              v-model:value="reportForm.projectId"
              show-search
              :filter-option="true"
              :options="projectOptions"
              @change="handleReportProjectChange"
            />
          </Form.Item>
          <Form.Item label="日报日期">
            <DatePicker v-model:value="reportForm.reportDate" class="w-full" />
          </Form.Item>
          <Form.Item label="监造人员" required>
            <Input v-model:value="reportForm.reporter" />
          </Form.Item>
          <Form.Item label="现场地点">
            <Input v-model:value="reportForm.location" />
          </Form.Item>
          <Form.Item label="天气">
            <Input v-model:value="reportForm.weather" />
          </Form.Item>
          <Form.Item label="现场人数">
            <InputNumber
              v-model:value="reportForm.manpower"
              class="w-full"
              :min="0"
            />
          </Form.Item>
        </div>
        <div class="mb-4 rounded border border-blue-100 bg-blue-50 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-medium">今日节点推进</div>
              <div class="mt-1 text-xs text-gray-500">
                已按延期、风险、进行中、临期排序，提交后自动更新甘特节点状态
              </div>
            </div>
            <Tag color="blue"
              >已选择 {{ activeReportTaskDrafts.length }} 个</Tag
            >
          </div>
        </div>
        <div
          v-if="loadingPlanTasks"
          class="mb-4 rounded border border-dashed p-6 text-center text-gray-500"
        >
          正在加载甘特节点
        </div>
        <div
          v-else-if="reportTaskDrafts.length === 0"
          class="mb-4 rounded border border-dashed p-6 text-center text-gray-500"
        >
          当前项目暂无可推进的甘特节点
        </div>
        <div v-else class="mb-4 space-y-4">
          <div v-for="group in reportTaskGroups" :key="group.title">
            <div class="mb-2 text-sm font-medium text-gray-600">
              {{ group.title }}
            </div>
            <div class="space-y-3">
              <div
                v-for="draft in group.children"
                :key="draft.task.id"
                class="rounded border p-3"
                :class="
                  draft.enabled ? 'border-blue-200 bg-white' : 'bg-gray-50'
                "
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <Switch v-model:checked="draft.enabled" size="small" />
                      <span class="font-medium">
                        {{ draft.task.taskNo }} {{ draft.task.taskName }}
                      </span>
                      <Tag :color="planTaskColor(draft.task.status)">
                        {{ planTaskLabel(draft.task.status) }}
                      </Tag>
                      <Tag>{{ taskReportReason(draft.task) }}</Tag>
                    </div>
                    <div class="mt-1 text-xs text-gray-500">
                      计划
                      {{ formatPlanTaskDate(draft.task.plannedStartAt) }} 至
                      {{ formatPlanTaskDate(draft.task.plannedEndAt) }}
                      · 数量 {{ draft.task.completedQuantity || 0 }}/{{
                        draft.plannedQuantity
                      }}{{ draft.quantityUnit }}
                      <span v-if="draft.task.lastReportAt">
                        · 上次汇报
                        {{ formatPlanTaskDate(draft.task.lastReportAt) }}
                      </span>
                    </div>
                  </div>
                  <div class="w-32">
                    <Progress
                      :percent="draft.task.progressPercent"
                      size="small"
                    />
                  </div>
                </div>
                <div
                  class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[120px_120px_120px_120px_1fr]"
                >
                  <Form.Item label="本次状态">
                    <Select
                      v-model:value="draft.status"
                      :disabled="!draft.enabled"
                      :options="reportTaskStatusOptions"
                    />
                  </Form.Item>
                  <Form.Item label="今日完成">
                    <InputNumber
                      v-model:value="draft.dailyQuantity"
                      class="w-full"
                      :disabled="!draft.enabled"
                      :min="0"
                      @change="() => handleDraftDailyQuantityChange(draft)"
                    />
                  </Form.Item>
                  <Form.Item label="累计完成">
                    <InputNumber
                      v-model:value="draft.completedQuantity"
                      class="w-full"
                      :disabled="!draft.enabled"
                      :max="draft.plannedQuantity"
                      :min="0"
                      @change="() => handleDraftCompletedQuantityChange(draft)"
                    />
                  </Form.Item>
                  <Form.Item label="计划数量">
                    <InputNumber
                      v-model:value="draft.plannedQuantity"
                      class="w-full"
                      :disabled="!draft.enabled"
                      :min="0.01"
                      @change="() => handleDraftCompletedQuantityChange(draft)"
                    />
                  </Form.Item>
                  <Form.Item label="风险原因">
                    <Input
                      v-model:value="draft.riskReason"
                      :disabled="!draft.enabled"
                    />
                  </Form.Item>
                </div>
                <div
                  class="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-500"
                >
                  <span>单位：{{ draft.quantityUnit }}</span>
                  <span>系统进度：{{ draft.progressPercent }}%</span>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Form.Item label="今日完成内容">
                    <Input.TextArea
                      v-model:value="draft.workContent"
                      :disabled="!draft.enabled"
                      :rows="3"
                    />
                  </Form.Item>
                  <Form.Item label="下一步计划">
                    <Input.TextArea
                      v-model:value="draft.nextPlan"
                      :disabled="!draft.enabled"
                      :rows="3"
                    />
                  </Form.Item>
                </div>
                <Form.Item label="节点照片">
                  <QmsFileUpload
                    v-model:file-list="draft.photos"
                    accept="image/*"
                    button-text="上传节点照片"
                    :disabled="!draft.enabled"
                    multiple
                  />
                </Form.Item>
              </div>
            </div>
          </div>
        </div>
        <Form.Item label="工作内容">
          <Input.TextArea
            v-model:value="reportForm.workContent"
            :rows="3"
            placeholder="描述今日现场工作情况"
          />
        </Form.Item>
        <Form.Item label="现场照片">
          <QmsFileUpload
            v-model:file-list="reportForm.attachments"
            accept="image/*"
            button-text="上传照片"
            multiple
          />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="reportDrawerOpen = false">取消</Button>
          <Button type="primary" @click="submitReport">提交</Button>
        </Space>
      </template>
    </Drawer>

    <Drawer
      v-model:open="issueDrawerOpen"
      :title="editingIssueId ? '编辑监造问题' : '新建监造问题'"
      width="640"
    >
      <Form layout="vertical">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Form.Item label="监造项目" required>
            <Select
              v-model:value="issueForm.projectId"
              show-search
              :filter-option="true"
              :options="projectOptions"
            />
          </Form.Item>
          <Form.Item label="问题类型">
            <Select
              v-model:value="issueForm.issueType"
              :options="issueTypeOptions"
            />
          </Form.Item>
          <Form.Item label="严重程度">
            <Select
              v-model:value="issueForm.severity"
              :options="severityOptions"
            />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              v-model:value="issueForm.status"
              :options="issueStatusOptions"
            />
          </Form.Item>
          <Form.Item label="责任单位">
            <Input v-model:value="issueForm.responsibleUnit" />
          </Form.Item>
          <Form.Item label="截止日期">
            <DatePicker v-model:value="issueForm.dueAt" class="w-full" />
          </Form.Item>
          <Form.Item label="预计损失">
            <InputNumber
              v-model:value="issueForm.estimatedLoss"
              class="w-full"
              :min="0"
            />
          </Form.Item>
          <Form.Item label="是否索赔">
            <Switch
              v-model:checked="issueForm.isClaim"
              checked-children="是"
              un-checked-children="否"
            />
          </Form.Item>
          <Form.Item label="影响进度">
            <Switch
              v-model:checked="issueForm.affectsProgress"
              checked-children="是"
              un-checked-children="否"
            />
          </Form.Item>
        </div>
        <Form.Item label="问题描述" required>
          <Input.TextArea v-model:value="issueForm.description" :rows="4" />
        </Form.Item>
        <Form.Item label="整改要求">
          <Input.TextArea
            v-model:value="issueForm.correctiveAction"
            :rows="3"
          />
        </Form.Item>
        <Form.Item label="验证结果">
          <Input.TextArea v-model:value="issueForm.verifyResult" :rows="3" />
        </Form.Item>
        <Form.Item label="问题照片">
          <QmsFileUpload
            v-model:file-list="issueForm.photos"
            accept="image/*"
            button-text="上传照片"
            list-type="picture-card"
            multiple
          />
        </Form.Item>
        <Form.Item label="整改照片">
          <QmsFileUpload
            v-model:file-list="issueForm.rectificationPhotos"
            accept="image/*"
            button-text="上传照片"
            list-type="picture-card"
            multiple
          />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="issueDrawerOpen = false">取消</Button>
          <Button type="primary" @click="submitIssue">保存</Button>
        </Space>
      </template>
    </Drawer>

    <Drawer v-model:open="actionDrawerOpen" title="问题处理记录" width="620">
      <div class="mb-4 space-y-2">
        <div
          v-for="item in issueActions"
          :key="item.id"
          class="rounded border px-3 py-2"
        >
          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>{{ item.actionType }}</span>
            <span>{{ item.createdAt }}</span>
          </div>
          <div class="mt-1 text-sm">{{ item.description || '-' }}</div>
        </div>
        <div v-if="issueActions.length === 0" class="text-sm text-gray-400">
          暂无处理记录
        </div>
      </div>
      <Form layout="vertical">
        <Form.Item label="处理类型">
          <Select
            v-model:value="actionForm.actionType"
            :options="[
              { label: '跟进', value: 'FOLLOW_UP' },
              { label: '整改', value: 'RECTIFICATION' },
              { label: '验证', value: 'VERIFY' },
            ]"
          />
        </Form.Item>
        <Form.Item label="处理说明">
          <Input.TextArea v-model:value="actionForm.description" :rows="4" />
        </Form.Item>
        <Form.Item label="更新状态">
          <Select
            v-model:value="actionForm.status"
            :options="issueStatusOptions"
          />
        </Form.Item>
        <Form.Item label="验证结果">
          <Input.TextArea v-model:value="actionForm.verifyResult" :rows="3" />
        </Form.Item>
        <Form.Item label="整改照片">
          <QmsFileUpload
            v-model:file-list="actionForm.rectificationPhotos"
            accept="image/*"
            button-text="上传照片"
            list-type="picture-card"
            multiple
          />
        </Form.Item>
        <Form.Item label="附件">
          <QmsFileUpload
            v-model:file-list="actionForm.attachments"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            button-text="上传附件"
            multiple
          />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="actionDrawerOpen = false">取消</Button>
          <Button type="primary" @click="submitAction">保存</Button>
        </Space>
      </template>
    </Drawer>
  </Page>
</template>

<style scoped>
:deep(.ant-drawer-content-wrapper) {
  max-width: 100vw;
}

.mobile-card :deep(.ant-card-body) {
  padding: 12px;
}

.clickable-row {
  cursor: pointer;
}

@media (max-width: 768px) {
  :deep(.ant-drawer-content-wrapper) {
    width: 100vw !important;
  }
}
</style>
