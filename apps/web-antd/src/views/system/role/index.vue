<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { SystemRoleApi } from '#/api/system/role';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Drawer,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Select,
  SelectOption,
  Tree,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { requestClient } from '#/api/request';
import { SysStatusEnum } from '#/api/system/enums';
import { getRoleList } from '#/api/system/role';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

// Permission check helpers
const canCreate = computed(
  () =>
    hasAccessByCodes(['System:Role:Create']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:Role:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canDelete = computed(
  () =>
    hasAccessByCodes(['System:Role:Delete']) ||
    hasAccessByRoles(['super', 'admin']),
);

const isModalVisible = ref(false);
const isPermDrawerVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const currentRoleName = ref('');

const formState = reactive({
  name: '',
  value: '',
  status: 1,
  remark: '',
});

// All available permission codes organized as tree structure
const allPermissions = ref<any[]>([]);

async function fetchPermissionTree() {
  try {
    const res = await requestClient.get('/system/role/permission-tree');
    allPermissions.value = res;
  } catch (error) {
    console.error('Failed to fetch permission tree', error);
  }
}

onMounted(() => {
  fetchPermissionTree();
});

const checkedKeys = ref<string[]>([]);
const expandedKeys = ref<string[]>(['System', 'QMS']);

const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    { type: 'seq', title: t('common.seq'), width: 60 },
    { field: 'name', title: t('sys.role.roleName'), width: 150 },
    { field: 'value', title: t('sys.role.roleValue'), width: 120 },
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
      width: 250,
      fixed: 'right',
      cellRender: {
        name: 'CellOperation',
        props: {
          options: [
            ...(canEdit.value
              ? [
                  {
                    code: 'permissions',
                    icon: 'lucide:shield-check',
                    title: t('sys.role.permSettings'),
                  },
                  'edit',
                ]
              : []),
            ...(canDelete.value ? ['delete'] : []),
          ],
          onClick: ({
            code,
            row,
          }: {
            code: string;
            row: SystemRoleApi.Role;
          }) => {
            if (code === 'edit') handleEdit(row);
            if (code === 'delete') handleDelete(row);
            if (code === 'permissions') handlePermissions(row);
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
  proxyConfig: {
    ajax: {
      query: async ({
        page,
      }: {
        page: { currentPage: number; pageSize: number };
      }) => {
        const res = await getRoleList({
          page: page.currentPage,
          pageSize: page.pageSize,
        });
        return res;
      },
      queryAll: async ({ formValues }: any) => {
        const res = await getRoleList({
          page: 1,
          pageSize: 100_000,
          ...formValues,
        });
        return { items: res.items || [] };
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions: gridOptions as any });

function handleOpenModal() {
  isEditMode.value = false;
  currentId.value = null;
  Object.assign(formState, { name: '', remark: '', status: 1, value: '' });
  isModalVisible.value = true;
}

function handleEdit(row: SystemRoleApi.Role) {
  isEditMode.value = true;
  currentId.value = row.id;
  Object.assign(formState, {
    name: row.name,
    remark: row.remark || '',
    status: row.status,
    value: row.value,
  });
  isModalVisible.value = true;
}

function handlePermissions(row: SystemRoleApi.Role) {
  currentId.value = row.id;
  currentRoleName.value = row.name;
  // Load current permissions for this role
  checkedKeys.value = row.permissions || [];
  isPermDrawerVisible.value = true;
}

async function handleSavePermissions() {
  if (!currentId.value) return;
  try {
    await requestClient.put(`/system/role/${currentId.value}`, {
      permissions: checkedKeys.value,
    });
    message.success('权限设置保存成功');
    isPermDrawerVisible.value = false;
    gridApi.reload();
  } catch {
    message.error('保存权限失败');
  }
}

function handleDelete(row: SystemRoleApi.Role) {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除角色 "${row.name}" 吗？`,
    onOk: async () => {
      try {
        await requestClient.delete(`/system/role/${row.id}`);
        message.success('删除成功');
        gridApi.reload();
      } catch {
        message.error('删除失败');
      }
    },
  });
}

async function handleSubmit() {
  if (!formState.name.trim() || !formState.value.trim()) {
    message.warning('请填写完整信息');
    return;
  }
  try {
    const payload = {
      ...formState,
      createTime: new Date().toLocaleString(),
    };
    if (isEditMode.value && currentId.value) {
      await requestClient.put(`/system/role/${currentId.value}`, payload);
      message.success('保存成功');
    } else {
      await requestClient.post('/system/role', payload);
      message.success('创建成功');
    }
    isModalVisible.value = false;
    gridApi.reload();
  } catch {
    message.error(isEditMode.value ? '保存失败' : '创建失败');
  }
}
</script>

<template>
  <Page>
    <Grid>
      <template #toolbar-actions>
        <Button v-if="canCreate" type="primary" @click="handleOpenModal">
          {{ t('sys.role.addRole') }}
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

    <!-- 新增/编辑角色弹窗 -->
    <Modal
      v-model:open="isModalVisible"
      :title="isEditMode ? t('sys.role.editRole') : t('sys.role.addRole')"
      @ok="handleSubmit"
      width="500px"
    >
      <Form layout="vertical" class="pt-4">
        <FormItem :label="t('sys.role.roleName')" required>
          <Input
            v-model:value="formState.name"
            :placeholder="`${t('common.pleaseInput')}${t('sys.role.roleName')}`"
          />
        </FormItem>
        <FormItem :label="t('sys.role.roleValue')" required>
          <Input
            v-model:value="formState.value"
            :placeholder="`${t('common.pleaseInput')}${t('sys.role.roleValue')}`"
            :disabled="isEditMode"
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

    <!-- 权限设置抽屉 -->
    <Drawer
      v-model:open="isPermDrawerVisible"
      :title="`权限设置 - ${currentRoleName}`"
      placement="right"
      width="400"
      :footer-style="{ textAlign: 'right' }"
    >
      <div class="mb-4">
        <span class="text-gray-500">勾选该角色可访问的功能权限：</span>
      </div>
      <Tree
        v-model:checked-keys="checkedKeys"
        v-model:expanded-keys="expandedKeys"
        :tree-data="allPermissions"
        checkable
        :selectable="false"
        :default-expand-all="true"
      />
      <template #footer>
        <Button @click="isPermDrawerVisible = false" class="mr-2">取消</Button>
        <Button type="primary" @click="handleSavePermissions">保存权限</Button>
      </template>
    </Drawer>
  </Page>
</template>
