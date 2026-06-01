<script lang="ts" setup>
import type dayjs from 'dayjs';

import { reactive, watch } from 'vue';

import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Space,
} from 'ant-design-vue';

import { useMobileViewport } from '#/hooks/useMobileViewport';
import SupplierSelect from '#/views/qms/shared/components/SupplierSelect.vue';

type ProjectFormState = {
  plannedEndAt?: dayjs.Dayjs;
  plannedStartAt?: dayjs.Dayjs;
  projectName: string;
  supervisor: string;
  supplierName: string;
};

interface Props {
  editingProjectId: string;
  form: ProjectFormState;
  open: boolean;
  userOptions: Array<{ label: string; value: string }>;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  submit: [];
  'update:form': [value: ProjectFormState];
  'update:open': [value: boolean];
}>();
const { isMobile } = useMobileViewport();

const localForm = reactive<ProjectFormState>({
  plannedEndAt: undefined,
  plannedStartAt: undefined,
  projectName: '',
  supervisor: '',
  supplierName: '',
});

function copyForm(source: ProjectFormState): ProjectFormState {
  return {
    plannedEndAt: source.plannedEndAt,
    plannedStartAt: source.plannedStartAt,
    projectName: source.projectName,
    supervisor: source.supervisor,
    supplierName: source.supplierName,
  };
}

function syncFromProps() {
  Object.assign(localForm, copyForm(props.form));
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      syncFromProps();
    }
  },
  { immediate: true },
);

watch(
  localForm,
  (value) => {
    emit('update:form', copyForm(value));
  },
  { deep: true },
);

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

function handleSubmit() {
  emit('update:form', copyForm(localForm));
  emit('submit');
}
</script>

<template>
  <Drawer
    :open="props.open"
    :title="props.editingProjectId ? '编辑监造项目' : '新建监造项目'"
    :width="isMobile ? '100vw' : 480"
    :body-style="{ overflowX: 'hidden' }"
    @update:open="handleUpdateOpen"
  >
    <Form layout="vertical">
      <Form.Item label="项目名称" required>
        <Input
          v-model:value="localForm.projectName"
          placeholder="输入项目名称"
        />
      </Form.Item>
      <Form.Item label="供应商">
        <SupplierSelect
          v-model:value="localForm.supplierName"
          category="Supplier"
        />
      </Form.Item>
      <Form.Item label="监造员">
        <Select
          v-model:value="localForm.supervisor"
          show-search
          allow-clear
          :options="props.userOptions"
          placeholder="选择监造员"
        />
      </Form.Item>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Form.Item label="计划开始">
          <DatePicker v-model:value="localForm.plannedStartAt" class="w-full" />
        </Form.Item>
        <Form.Item label="计划结束">
          <DatePicker v-model:value="localForm.plannedEndAt" class="w-full" />
        </Form.Item>
      </div>
    </Form>
    <template #footer>
      <Space>
        <Button @click="emit('update:open', false)">取消</Button>
        <Button type="primary" @click="handleSubmit">保存</Button>
      </Space>
    </template>
  </Drawer>
</template>
