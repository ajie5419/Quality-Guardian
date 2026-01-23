<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { SystemMenuApi } from '#/api/system/menu';
import type { TreeSelectNode } from '#/types';

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
  TreeSelect,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { requestClient } from '#/api/request';
import { getMenuList } from '#/api/system/menu';
import { convertToTreeSelectDataWithTitle } from '#/types';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const menuTreeData = ref<TreeSelectNode[]>([]);

// Permission check helpers
const canCreate = computed(
  () =>
    hasAccessByCodes(['System:Menu:Create']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:Menu:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canDelete = computed(
  () =>
    hasAccessByCodes(['System:Menu:Delete']) ||
    hasAccessByRoles(['super', 'admin']),
);

const formState = reactive({
  pid: '0',
  name: '',
  path: '',
  component: '',
  title: '',
  icon: '',
  orderNo: 0,
});

async function loadMenuTree(excludeId?: string) {
  try {
    const data = await getMenuList();
    menuTreeData.value = [
      { title: t('sys.menu.topMenu'), value: '0' },
      ...convertToTreeSelectDataWithTitle(
        data,
        (item) => item.meta?.title || item.name,
        excludeId,
      ),
    ];
  } catch (error) {
    console.error('Failed to load menu tree', error);
  }
}

onMounted(() => loadMenuTree());

const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    {
      field: 'meta.title',
      title: t('sys.menu.menuName'),
      treeNode: true,
      align: 'left',
      minWidth: 200,
    },
    { field: 'name', title: t('sys.menu.routeName'), width: 150 },
    { field: 'path', title: t('sys.menu.routePath'), width: 180 },
    { field: 'meta.icon', title: t('sys.menu.icon'), width: 100 },
    { field: 'meta.orderNo', title: t('sys.menu.order'), width: 80 },
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
                    title: t('sys.menu.addChildMenu'),
                  },
                ]
              : []),
            ...(canEdit.value ? ['edit'] : []),
            ...(canDelete.value ? ['delete'] : []),
          ],
          onClick: ({
            code,
            row,
          }: {
            code: string;
            row: SystemMenuApi.Menu;
          }) => {
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
    custom: true,
    refresh: true,
    zoom: true,
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
        const data = await getMenuList();
        return { items: data };
      },
      queryAll: async () => {
        const data = await getMenuList();
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
    component: '',
    icon: '',
    name: '',
    orderNo: 0,
    path: '',
    pid: parentId || '0',
    title: '',
  });
  loadMenuTree();
  isModalVisible.value = true;
}

function handleAddChild(row: SystemMenuApi.Menu) {
  handleOpenModal(row.id);
}

function handleEdit(row: SystemMenuApi.Menu) {
  isEditMode.value = true;
  currentId.value = row.id;
  Object.assign(formState, {
    component: row.component || '',
    icon: row.meta?.icon || '',
    name: row.name,
    orderNo: row.meta?.orderNo || 0,
    path: row.path,
    pid: row.pid || '0',
    title: row.meta?.title || '',
  });
  loadMenuTree(row.id);
  isModalVisible.value = true;
}

function handleDelete(row: SystemMenuApi.Menu) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: `${t('common.confirmDeleteContent')} "${row.meta?.title || row.name}" ?`,
    onOk: async () => {
      try {
        await requestClient.delete(`/system/menu/${row.id}`);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
        loadMenuTree();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

async function handleSubmit() {
  if (!formState.title.trim() || !formState.name.trim()) {
    message.warning(t('common.pleaseCompleteInfo'));
    return;
  }
  try {
    const payload = {
      pid: formState.pid,
      name: formState.name,
      path: formState.path,
      component: formState.component,
      meta: {
        title: formState.title,
        icon: formState.icon,
        orderNo: formState.orderNo,
      },
    };
    if (isEditMode.value && currentId.value) {
      await requestClient.put(`/system/menu/${currentId.value}`, payload);
      message.success(t('common.saveSuccess'));
    } else {
      await requestClient.post('/system/menu', payload);
      message.success(t('common.createSuccess'));
    }
    isModalVisible.value = false;
    gridApi.reload();
    loadMenuTree();
  } catch {
    message.error(isEditMode.value ? '保存失败' : '创建失败');
  }
}
</script>

<template>
  <Page>
    <template #extra>
      <Button v-if="canCreate" type="primary" @click="handleOpenModal()">
        {{ t('sys.menu.addMenu') }}
      </Button>
    </template>
    <Grid />

    <Modal
      v-model:open="isModalVisible"
      :title="isEditMode ? t('sys.menu.editMenu') : t('sys.menu.addMenu')"
      @ok="handleSubmit"
      width="600px"
    >
      <Form layout="vertical" class="pt-4">
        <FormItem :label="t('sys.menu.parentMenu')">
          <TreeSelect
            v-model:value="formState.pid"
            :tree-data="menuTreeData"
            :placeholder="t('sys.menu.selectParentMenu')"
            tree-default-expand-all
            style="width: 100%"
          />
        </FormItem>
        <div class="grid grid-cols-2 gap-4">
          <FormItem :label="t('sys.menu.menuName')" required>
            <Input
              v-model:value="formState.title"
              :placeholder="`${t('common.pleaseInput')}${t('sys.menu.menuName')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.menu.routeName')" required>
            <Input
              v-model:value="formState.name"
              :placeholder="`${t('common.pleaseInput')}${t('sys.menu.routeName')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.menu.routePath')">
            <Input
              v-model:value="formState.path"
              :placeholder="`${t('common.pleaseInput')}${t('sys.menu.routePath')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.menu.componentPath')">
            <Input
              v-model:value="formState.component"
              :placeholder="`${t('common.pleaseInput')}${t('sys.menu.componentPath')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.menu.icon')">
            <Input
              v-model:value="formState.icon"
              :placeholder="`${t('common.pleaseInput')}${t('sys.menu.icon')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.menu.order')">
            <Input
              v-model:value="formState.orderNo"
              type="number"
              :placeholder="`${t('common.pleaseInput')}${t('sys.menu.order')}`"
            />
          </FormItem>
        </div>
      </Form>
    </Modal>
  </Page>
</template>
