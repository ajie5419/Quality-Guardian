<script lang="ts" setup>
import type { SupervisionPlanTask } from '@qgs/shared';

import { computed, reactive, ref } from 'vue';

import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createSupervisionIssue,
  createSupervisionPlanTask,
  createSupervisionReport,
  deleteSupervisionPlanTask,
  reorderSupervisionPlanTasks,
  updateSupervisionPlanTask,
} from '#/api/qms/supervision';

import { formatPlanTaskDate, planTaskColor, planTaskLabel } from '../constants';

const props = defineProps<{
  projectId: string;
  reporter: string;
  tasks: SupervisionPlanTask[];
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const drawerOpen = ref(false);
const editingTask = ref<null | SupervisionPlanTask>(null);
const submitting = ref(false);

const form = reactive({
  durationDays: undefined as number | undefined,
  parentId: '' as string,
  plannedEndAt: undefined as dayjs.Dayjs | undefined,
  plannedQuantity: 1,
  plannedStartAt: undefined as dayjs.Dayjs | undefined,
  predecessorText: '',
  quantityUnit: '项',
  resourceName: '',
  taskName: '',
  taskNo: '',
  weight: 1,
});

const treeData = computed(() => {
  const map = new Map<string, SupervisionPlanTask & { children: any[] }>();
  for (const task of props.tasks) {
    map.set(task.id, { ...task, children: [] });
  }
  const roots: Array<SupervisionPlanTask & { children: any[] }> = [];
  for (const task of props.tasks) {
    const node = map.get(task.id)!;
    if (task.parentId && map.has(task.parentId)) {
      map.get(task.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
});

const parentOptions = computed(() => {
  return props.tasks
    .filter((t) => !editingTask.value || t.id !== editingTask.value.id)
    .map((t) => ({
      label: `${t.taskNo} ${t.taskName}`,
      value: t.id,
    }));
});

const columns = [
  { dataIndex: 'taskNo', title: '编号', width: 80 },
  { dataIndex: 'taskName', title: '任务名称', ellipsis: true },
  { dataIndex: 'plannedStartAt', title: '计划开始', width: 110 },
  { dataIndex: 'plannedEndAt', title: '计划完成', width: 110 },
  { dataIndex: 'progressPercent', title: '进度', width: 70 },
  { dataIndex: 'status', title: '状态', width: 80 },
  { key: 'actions', title: '操作', width: 200 },
];

function resetForm() {
  Object.assign(form, {
    durationDays: undefined,
    parentId: '',
    plannedEndAt: undefined,
    plannedQuantity: 1,
    plannedStartAt: undefined,
    predecessorText: '',
    quantityUnit: '项',
    resourceName: '',
    taskName: '',
    taskNo: '',
    weight: 1,
  });
}

function openCreate(parentId?: string) {
  resetForm();
  editingTask.value = null;
  if (parentId) form.parentId = parentId;
  drawerOpen.value = true;
}

function openEdit(task: SupervisionPlanTask) {
  editingTask.value = task;
  Object.assign(form, {
    durationDays: task.durationDays,
    parentId: task.parentId || '',
    plannedEndAt: task.plannedEndAt ? dayjs(task.plannedEndAt) : undefined,
    plannedQuantity: task.plannedQuantity || 1,
    plannedStartAt: task.plannedStartAt
      ? dayjs(task.plannedStartAt)
      : undefined,
    predecessorText: task.predecessorText || '',
    quantityUnit: task.quantityUnit || '项',
    resourceName: task.resourceName || '',
    taskName: task.taskName,
    taskNo: task.taskNo,
    weight: task.weight || 1,
  });
  drawerOpen.value = true;
}

async function handleSubmit() {
  if (!form.taskNo.trim() || !form.taskName.trim()) {
    message.warning('标识号和任务名称不能为空');
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      durationDays: form.durationDays,
      parentId: form.parentId || undefined,
      plannedEndAt: form.plannedEndAt?.toISOString(),
      plannedQuantity: form.plannedQuantity,
      plannedStartAt: form.plannedStartAt?.toISOString(),
      predecessorText: form.predecessorText || undefined,
      quantityUnit: form.quantityUnit,
      resourceName: form.resourceName || undefined,
      taskName: form.taskName.trim(),
      taskNo: form.taskNo.trim(),
      weight: form.weight,
    };
    if (editingTask.value) {
      await updateSupervisionPlanTask(
        props.projectId,
        editingTask.value.id,
        payload,
      );
      message.success('任务已更新');
    } else {
      await createSupervisionPlanTask(props.projectId, payload);
      message.success('任务已创建');
    }
    drawerOpen.value = false;
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

function handleDelete(task: SupervisionPlanTask) {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除任务「${task.taskName}」？子任务将提升到上一级。`,
    okType: 'danger',
    async onOk() {
      try {
        await deleteSupervisionPlanTask(props.projectId, task.id);
        message.success('任务已删除');
        emit('refresh');
      } catch (error: any) {
        message.error(error?.message || '删除失败');
      }
    },
  });
}

function findPrevSibling(
  task: SupervisionPlanTask,
): SupervisionPlanTask | undefined {
  const siblings = props.tasks.filter((t) => t.parentId === task.parentId);
  const idx = siblings.findIndex((t) => t.id === task.id);
  return idx > 0 ? siblings[idx - 1] : undefined;
}

async function handleIndent(task: SupervisionPlanTask) {
  const prevSibling = findPrevSibling(task);
  if (!prevSibling) {
    message.warning('没有可作为父节点的前置同级任务');
    return;
  }
  try {
    await updateSupervisionPlanTask(props.projectId, task.id, {
      parentId: prevSibling.id,
    });
    message.success('已降级为子任务');
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '调整层级失败');
  }
}

async function handleOutdent(task: SupervisionPlanTask) {
  if (!task.parentId) {
    message.warning('已经是顶级任务');
    return;
  }
  const parent = props.tasks.find((t) => t.id === task.parentId);
  const newParentId = parent?.parentId || null;
  try {
    await updateSupervisionPlanTask(props.projectId, task.id, {
      parentId: newParentId,
    });
    message.success('已升级层级');
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '调整层级失败');
  }
}

async function handleMoveUp(task: SupervisionPlanTask) {
  const siblings = props.tasks.filter((t) => t.parentId === task.parentId);
  const idx = siblings.findIndex((t) => t.id === task.id);
  if (idx <= 0) return;
  const items = siblings.map((t) => ({ id: t.id, sortOrder: t.sortOrder }));
  const temp = items[idx]!.sortOrder;
  items[idx]!.sortOrder = items[idx - 1]!.sortOrder;
  items[idx - 1]!.sortOrder = temp;
  try {
    await reorderSupervisionPlanTasks(props.projectId, items);
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '移动失败');
  }
}

async function handleMoveDown(task: SupervisionPlanTask) {
  const siblings = props.tasks.filter((t) => t.parentId === task.parentId);
  const idx = siblings.findIndex((t) => t.id === task.id);
  if (idx === -1 || idx >= siblings.length - 1) return;
  const items = siblings.map((t) => ({ id: t.id, sortOrder: t.sortOrder }));
  const temp = items[idx]!.sortOrder;
  items[idx]!.sortOrder = items[idx + 1]!.sortOrder;
  items[idx + 1]!.sortOrder = temp;
  try {
    await reorderSupervisionPlanTasks(props.projectId, items);
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '移动失败');
  }
}

// --- 上报进度（轻量日报）---
const progressModalOpen = ref(false);
const progressTask = ref<null | SupervisionPlanTask>(null);
const progressForm = reactive({
  dailyQuantity: 0,
  workContent: '',
});

function openProgressModal(task: SupervisionPlanTask) {
  if (task.isSummary) {
    message.warning('汇总任务不能直接上报，请在子任务上操作');
    return;
  }
  progressTask.value = task;
  Object.assign(progressForm, { dailyQuantity: 0, workContent: '' });
  progressModalOpen.value = true;
}

async function submitProgress() {
  const task = progressTask.value;
  if (!task) return;
  if (progressForm.dailyQuantity <= 0 && !progressForm.workContent.trim()) {
    message.warning('请填写今日完成量或工作内容');
    return;
  }
  try {
    await createSupervisionReport({
      projectId: props.projectId,
      reportDate: dayjs().format('YYYY-MM-DD'),
      reporter: props.reporter || '监造员',
      workContent: progressForm.workContent,
      taskUpdates: [
        {
          taskId: task.id,
          dailyQuantity: progressForm.dailyQuantity,
          workContent: progressForm.workContent,
          status: 'IN_PROGRESS',
        },
      ],
    } as any);
    message.success('进度已上报');
    progressModalOpen.value = false;
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '上报失败');
  }
}

// --- 报问题（快捷创建）---
const issueModalOpen = ref(false);
const issueTask = ref<null | SupervisionPlanTask>(null);
const issueForm = reactive({
  description: '',
  severity: 'major',
});

function openIssueModal(task: SupervisionPlanTask) {
  issueTask.value = task;
  Object.assign(issueForm, { description: '', severity: 'major' });
  issueModalOpen.value = true;
}

async function submitIssue() {
  const task = issueTask.value;
  if (!task) return;
  if (!issueForm.description.trim()) {
    message.warning('请填写问题描述');
    return;
  }
  try {
    await createSupervisionIssue({
      projectId: props.projectId,
      taskId: task.id,
      description: issueForm.description,
      severity: issueForm.severity,
      issueType: 'QUALITY',
      status: 'OPEN',
      affectsProgress: true,
    } as any);
    message.success('问题已创建');
    issueModalOpen.value = false;
    emit('refresh');
  } catch (error: any) {
    message.error(error?.message || '创建问题失败');
  }
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <div class="text-sm text-gray-500">共 {{ tasks.length }} 个任务节点</div>
      <Button type="primary" size="small" @click="openCreate()">
        新增任务
      </Button>
    </div>

    <Table
      :columns="columns"
      :data-source="treeData"
      :pagination="false"
      row-key="id"
      size="small"
      :expand-column-width="40"
      children-column-name="children"
      default-expand-all-rows
    >
      <template #bodyCell="{ column, record: _record }">
        <template v-if="column.dataIndex === 'taskName'">
          <span :class="{ 'font-medium': (_record as any).isSummary }">
            {{ (_record as any).taskName }}
          </span>
          <Tag v-if="(_record as any).isSummary" class="ml-1" size="small"
            >汇总</Tag
          >
        </template>
        <template v-if="column.dataIndex === 'plannedStartAt'">
          {{ formatPlanTaskDate((_record as any).plannedStartAt) }}
        </template>
        <template v-if="column.dataIndex === 'plannedEndAt'">
          {{ formatPlanTaskDate((_record as any).plannedEndAt) }}
        </template>
        <template v-if="column.dataIndex === 'progressPercent'">
          {{ (_record as any).progressPercent }}%
        </template>
        <template v-if="column.dataIndex === 'status'">
          <Tag :color="planTaskColor((_record as any).status)" size="small">
            {{ planTaskLabel((_record as any).status) }}
          </Tag>
        </template>
        <template v-if="column.key === 'actions'">
          <Space size="small" wrap>
            <Tooltip title="上报进度">
              <Button
                size="small"
                type="link"
                :disabled="(_record as any).isSummary"
                @click="openProgressModal(_record as any)"
                >上报</Button
              >
            </Tooltip>
            <Tooltip title="报问题">
              <Button
                size="small"
                type="link"
                danger
                @click="openIssueModal(_record as any)"
                >问题</Button
              >
            </Tooltip>
            <Tooltip title="升级">
              <Button
                size="small"
                type="link"
                :disabled="!(_record as any).parentId"
                @click="handleOutdent(_record as any)"
                >←</Button
              >
            </Tooltip>
            <Tooltip title="降级">
              <Button
                size="small"
                type="link"
                @click="handleIndent(_record as any)"
                >→</Button
              >
            </Tooltip>
            <Tooltip title="上移">
              <Button
                size="small"
                type="link"
                @click="handleMoveUp(_record as any)"
                >↑</Button
              >
            </Tooltip>
            <Tooltip title="下移">
              <Button
                size="small"
                type="link"
                @click="handleMoveDown(_record as any)"
                >↓</Button
              >
            </Tooltip>
            <Tooltip title="编辑">
              <Button size="small" type="link" @click="openEdit(_record as any)"
                >编辑</Button
              >
            </Tooltip>
            <Tooltip title="添加子任务">
              <Button
                size="small"
                type="link"
                @click="openCreate((_record as any).id)"
                >+子</Button
              >
            </Tooltip>
            <Tooltip title="删除">
              <Button
                size="small"
                type="link"
                danger
                @click="handleDelete(_record as any)"
                >删除</Button
              >
            </Tooltip>
          </Space>
        </template>
      </template>
    </Table>

    <Drawer
      :open="drawerOpen"
      :title="editingTask ? '编辑甘特任务' : '新增甘特任务'"
      width="480"
      @close="drawerOpen = false"
    >
      <Form layout="vertical">
        <Form.Item label="标识号" required>
          <Input v-model:value="form.taskNo" placeholder="如 1.2.3" />
        </Form.Item>
        <Form.Item label="任务名称" required>
          <Input v-model:value="form.taskName" placeholder="任务名称" />
        </Form.Item>
        <Form.Item label="父任务">
          <Select
            v-model:value="form.parentId"
            :options="parentOptions"
            allow-clear
            show-search
            :filter-option="true"
            placeholder="选择父任务（留空为顶级）"
          />
        </Form.Item>
        <div class="grid grid-cols-2 gap-3">
          <Form.Item label="计划开始">
            <DatePicker v-model:value="form.plannedStartAt" class="w-full" />
          </Form.Item>
          <Form.Item label="计划完成">
            <DatePicker v-model:value="form.plannedEndAt" class="w-full" />
          </Form.Item>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <Form.Item label="计划数量">
            <InputNumber
              v-model:value="form.plannedQuantity"
              :min="0.01"
              class="w-full"
            />
          </Form.Item>
          <Form.Item label="单位">
            <Input v-model:value="form.quantityUnit" />
          </Form.Item>
          <Form.Item label="权重">
            <InputNumber
              v-model:value="form.weight"
              :min="0.01"
              class="w-full"
            />
          </Form.Item>
        </div>
        <Form.Item label="工期（天）">
          <InputNumber
            v-model:value="form.durationDays"
            :min="0"
            class="w-full"
          />
        </Form.Item>
        <Form.Item label="前置任务">
          <Input v-model:value="form.predecessorText" placeholder="如 3FS+2d" />
        </Form.Item>
        <Form.Item label="资源名称">
          <Input v-model:value="form.resourceName" placeholder="负责人/资源" />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="drawerOpen = false">取消</Button>
          <Button type="primary" :loading="submitting" @click="handleSubmit">
            {{ editingTask ? '保存' : '创建' }}
          </Button>
        </Space>
      </template>
    </Drawer>

    <!-- 上报进度 Modal -->
    <Modal
      v-model:open="progressModalOpen"
      :title="`上报进度 — ${progressTask?.taskName || ''}`"
      @ok="submitProgress"
      ok-text="提交"
      cancel-text="取消"
    >
      <Form layout="vertical" class="mt-4">
        <Form.Item label="今日完成量">
          <InputNumber
            v-model:value="progressForm.dailyQuantity"
            :min="0"
            class="w-full"
            :addon-after="progressTask?.quantityUnit || '项'"
          />
          <div class="mt-1 text-xs text-gray-400">
            当前进度 {{ progressTask?.progressPercent || 0 }}%， 已完成
            {{ progressTask?.completedQuantity || 0 }} /
            {{ progressTask?.plannedQuantity || 0 }}
            {{ progressTask?.quantityUnit || '项' }}
          </div>
        </Form.Item>
        <Form.Item label="工作内容">
          <Input.TextArea
            v-model:value="progressForm.workContent"
            :rows="3"
            placeholder="简要描述今日工作内容"
          />
        </Form.Item>
      </Form>
    </Modal>

    <!-- 报问题 Modal -->
    <Modal
      v-model:open="issueModalOpen"
      :title="`报问题 — ${issueTask?.taskName || ''}`"
      @ok="submitIssue"
      ok-text="提交"
      cancel-text="取消"
    >
      <Form layout="vertical" class="mt-4">
        <Form.Item label="问题描述" required>
          <Input.TextArea
            v-model:value="issueForm.description"
            :rows="4"
            placeholder="描述发现的问题"
          />
        </Form.Item>
        <Form.Item label="严重程度">
          <Select
            v-model:value="issueForm.severity"
            :options="[
              { label: '轻微', value: 'minor' },
              { label: '一般', value: 'major' },
              { label: '严重', value: 'critical' },
            ]"
          />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
