<script lang="ts" setup>
import type { VehicleCommissioningIssueStatus } from '@qgs/shared';

import type { TreeSelectNode } from '#/types';
import type { UploadFileWithResponse } from '#/views/qms/inspection/issues/types';

import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
  TreeSelect,
} from 'ant-design-vue';

import IssuePhotoUpload from '#/views/qms/inspection/issues/components/IssuePhotoUpload.vue';
import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';

defineProps<{
  claimStatusOptions: Array<{ label: string; value: string }>;
  deptTreeData: TreeSelectNode[];
  issueEditId: string;
  issueStatusOptions: Array<{
    label: string;
    value: VehicleCommissioningIssueStatus;
  }>;
  modalWidth?: number | string;
  modalWrapClassName: string;
  onWorkOrderChange: (value?: string) => void;
  selectedWorkOrderValue?: string;
  severityOptions: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const open = defineModel<boolean>('open', { required: true });
const claimNotes = defineModel<string>('claimNotes', { required: true });
const claimStatus = defineModel<string>('claimStatus', { required: true });
const date = defineModel<string>('date', { required: true });
const description = defineModel<string>('description', { required: true });
const isClaim = defineModel<boolean>('isClaim', { required: true });
const lossAmount = defineModel<number>('lossAmount', { required: true });
const partName = defineModel<string>('partName', { required: true });
const photos = defineModel<UploadFileWithResponse[]>('photos', {
  required: true,
});
const projectName = defineModel<string>('projectName', { required: true });
const recoveredAmount = defineModel<number>('recoveredAmount', {
  required: true,
});
const responsibleDepartment = defineModel<string>('responsibleDepartment', {
  required: true,
});
const selectedWorkOrderValueModel = defineModel<string | undefined>(
  'selectedWorkOrderValue',
);
const severity = defineModel<string>('severity', { required: true });
const solution = defineModel<string>('solution', { required: true });
const status = defineModel<VehicleCommissioningIssueStatus>('status', {
  required: true,
});
</script>

<template>
  <Modal
    v-model:open="open"
    :title="issueEditId ? '编辑调试验收问题' : '新建调试验收问题'"
    :width="modalWidth"
    :wrap-class-name="modalWrapClassName"
    ok-text="保存"
    cancel-text="取消"
    @ok="emit('submit')"
  >
    <Form layout="vertical">
      <Form.Item label="日期">
        <DatePicker
          v-model:value="date"
          value-format="YYYY-MM-DD"
          class="w-full"
        />
      </Form.Item>
      <Form.Item label="工单号">
        <WorkOrderSelect
          v-model:value="selectedWorkOrderValueModel"
          @change="onWorkOrderChange"
        />
      </Form.Item>
      <Form.Item label="项目名称" required>
        <Input v-model:value="projectName" />
      </Form.Item>
      <Form.Item label="部件名称">
        <Input v-model:value="partName" />
      </Form.Item>
      <Form.Item label="问题描述" required>
        <Input.TextArea v-model:value="description" :rows="4" />
      </Form.Item>
      <Form.Item label="责任部门">
        <TreeSelect
          v-model:value="responsibleDepartment"
          :tree-data="deptTreeData"
          placeholder="请选择责任部门"
          tree-default-expand-all
        />
      </Form.Item>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Form.Item label="严重程度">
          <Select v-model:value="severity" :options="severityOptions" />
        </Form.Item>
        <Form.Item label="状态">
          <Select v-model:value="status" :options="issueStatusOptions" />
        </Form.Item>
      </div>
      <Form.Item label="是否索赔">
        <Switch
          v-model:checked="isClaim"
          checked-children="是"
          un-checked-children="否"
        />
      </Form.Item>
      <div v-if="isClaim" class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Form.Item label="预计损失金额">
          <InputNumber
            v-model:value="lossAmount"
            :min="0"
            :precision="2"
            class="w-full"
            prefix="¥"
          />
        </Form.Item>
        <Form.Item label="已索赔金额">
          <InputNumber
            v-model:value="recoveredAmount"
            :min="0"
            :precision="2"
            class="w-full"
            prefix="¥"
          />
        </Form.Item>
        <Form.Item label="索赔状态">
          <Select v-model:value="claimStatus" :options="claimStatusOptions" />
        </Form.Item>
        <Form.Item label="索赔备注">
          <Input.TextArea v-model:value="claimNotes" :rows="2" />
        </Form.Item>
      </div>
      <Form.Item label="问题照片">
        <IssuePhotoUpload v-model:value="photos" />
      </Form.Item>
      <Form.Item label="处理建议">
        <Input.TextArea v-model:value="solution" :rows="3" />
      </Form.Item>
    </Form>
  </Modal>
</template>
