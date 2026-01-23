<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { DeptTreeNode, TreeSelectNode } from '#/types/tree';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  SelectOption,
  TreeSelect,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { requestClient } from '#/api/request';
import { getDeptList } from '#/api/system/dept';
import { SysStatusEnum } from '#/api/system/enums';
import { convertToTreeSelectData } from '#/types/tree';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const deptTreeData = ref<TreeSelectNode[]>([]);

// Permission check helpers
const canCreate = computed(
  () =>
    hasAccessByCodes(['System:Dept:Create']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:Dept:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canDelete = computed(
  () =>
    hasAccessByCodes(['System:Dept:Delete']) ||
    hasAccessByRoles(['super', 'admin']),
);

const formState = reactive({
  name: '',
  pid: '0',
  status: 1,
  remark: '',
});

// Load department tree data for parent selection
async function loadDeptTree(excludeId?: string) {
  try {
    const data = await getDeptList();
    deptTreeData.value = [
      { value: '0', title: t('sys.dept.topDept') },
      ...convertToTreeSelectData(data as DeptTreeNode[], excludeId),
    ];
  } catch (error) {
    console.error('Failed to load dept tree', error);
  }
}

onMounted(() => loadDeptTree());

const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    {
      field: 'name',
      title: t('sys.dept.deptName'),
      treeNode: true,
      align: 'left',
      minWidth: 200,
    },
    {
      field: 'status',
      title: t('common.status'),
      width: 100,
      slots: { default: 'status' },
    },
    { field: 'createTime', title: t('sys.user.createTime'), width: 180 },
    { field: 'remark', title: t('sys.user.remark'), minWidth: 150 },
    {
      title: t('common.action'),
      width: 200,
      fixed: 'right',
      cellRender: {
        name: 'CellOperation',
        props: {
          options: [
            ...(canCreate.value
              ? [
                  {
                    code: 'addChild',
                    icon: 'lucide:list-plus',
                    title: t('sys.dept.addChildDept'),
                  },
                ]
              : []),
            'edit',
            'delete',
          ],
          onClick: ({ code, row }) => {
            if (code === 'edit') handleEdit(row);
            if (code === 'delete') handleDelete(row);
            if (code === 'addChild') handleAddChild(row);
          },
        },
      },
    },
  ],
  toolbarConfig: {
    export: true,
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  exportConfig: {
    remote: true,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  treeConfig: {
    transform: false,
    rowField: 'id',
    parentField: 'pid',
    expandAll: true,
  },
  proxyConfig: {
    ajax: {
      query: async () => {
        const data = await getDeptList();
        return { items: data };
      },
      queryAll: async () => {
        const data = await getDeptList();
        return { items: data || [] };
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions: gridOptions as any });

function handleOpenModal(parentId?: string) {
  isEditMode.value = false;
  currentId.value = null;
  Object.assign(formState, {
    name: '',
    pid: parentId || '0',
    status: 1,
    remark: '',
  });
  loadDeptTree();
  isModalVisible.value = true;
}

function handleAddChild(row: DeptTreeNode) {
  handleOpenModal(row.id);
}

function handleEdit(row: DeptTreeNode) {
  isEditMode.value = true;
  currentId.value = row.id;
  Object.assign(formState, {
    name: row.name,
    pid: row.pid || '0',
    status: row.status,
    remark: row.remark || '',
  });
  loadDeptTree(row.id); // Exclude current node from parent selection
  isModalVisible.value = true;
}

function handleDelete(row: DeptTreeNode) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除部门 "${row.name}" 吗？删除后其子部门也将被删除。`,
    onOk: async () => {
      try {
        await requestClient.delete(`/system/dept/${row.id}`);
        message.success('删除成功');
        gridApi.reload();
        loadDeptTree();
      } catch {
        message.error('删除失败');
      }
    },
  });
}

async function handleSubmit() {
  if (!formState.name.trim()) {
    message.warning('请输入部门名称');
    return;
  }
  try {
    const payload = {
      ...formState,
      createTime: new Date().toLocaleString(),
    };
    if (isEditMode.value && currentId.value) {
      await requestClient.put(`/system/dept/${currentId.value}`, payload);
      message.success('保存成功');
    } else {
      await requestClient.post('/system/dept', payload);
      message.success('创建成功');
    }
    isModalVisible.value = false;
    gridApi.reload();
    loadDeptTree();
  } catch {
    message.error(isEditMode.value ? '保存失败' : '创建失败');
  }
}

</script>

<template>
  <Page>
    <Grid>
      <template #toolbar-actions>
        <Button v-if="canCreate" type="primary" @click="handleOpenModal()">
          {{ t('sys.dept.addDept') }}
        </Button>
      </template>
      <template #status="{ row }">
        <span
          v-if="row.status === SysStatusEnum.ENABLED"
          class="text-green-500"
          >{{ t('common.enabled') }}</span
        >
        <span v-else class="text-red-500">{{ t('common.disabled') }}</span>
      </template>
    </Grid>

    <Modal
      v-model:open="isModalVisible"
      :title="isEditMode ? t('sys.dept.editDept') : t('sys.dept.addDept')"
      @ok="handleSubmit"
      width="500px"
    >
      <Form layout="vertical" class="pt-4">
        <FormItem :label="t('sys.dept.parentDept')">
          <TreeSelect
            v-model:value="formState.pid"
            :tree-data="deptTreeData"
            :placeholder="`${t('common.pleaseInput')}${t('sys.dept.parentDept')}`"
            tree-default-expand-all
            style="width: 100%"
          />
        </FormItem>
        <FormItem :label="t('sys.dept.deptName')" required>
          <Input
            v-model:value="formState.name"
            :placeholder="`${t('common.pleaseInput')}${t('sys.dept.deptName')}`"
          />
        </FormItem>
        <FormItem :label="t('common.status')">
          <Select v-model:value="formState.status">
            <SelectOption :value="SysStatusEnum.ENABLED">{{
              t('common.enabled')
            }}</SelectOption>
            <SelectOption :value="SysStatusEnum.DISABLED">{{
              t('common.disabled')
            }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="t('sys.user.remark')">
          <Input
            v-model:value="formState.remark"
            :placeholder="t('sys.user.remarkPlaceholder')"
          />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
