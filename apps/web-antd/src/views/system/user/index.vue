<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { SystemUserApi } from '#/api/system/user';
import type { DeptTreeNode, TreeSelectNode } from '#/types';

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
import { getDeptList } from '#/api/system/dept';
import { SysStatusEnum } from '#/api/system/enums';
import { getRoleList } from '#/api/system/role';
import {
  createUser,
  deleteUser,
  getUserList,
  resetPassword,
  updateUser,
} from '#/api/system/user';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { convertToTreeSelectData, findNameById } from '#/types';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const { handleApiError } = useErrorHandler();

// Permission check helpers
const canCreate = computed(
  () =>
    hasAccessByCodes(['System:User:Create']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canEdit = computed(
  () =>
    hasAccessByCodes(['System:User:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);
const canDelete = computed(
  () =>
    hasAccessByCodes(['System:User:Delete']) ||
    hasAccessByRoles(['super', 'admin']),
);

const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const deptTreeData = ref<TreeSelectNode[]>([]);
const roleOptions = ref<{ label: string; value: string }[]>([]);

const formState = reactive({
  deptId: '',
  deptName: '',
  email: '',
  phone: '',
  realName: '',
  remark: '',
  roles: [] as string[],
  status: 1,
  username: '',
});

// Load department tree data
async function loadDeptTree() {
  try {
    const data = await getDeptList();
    deptTreeData.value = convertToTreeSelectData(
      data as unknown as DeptTreeNode[],
    );
  } catch (error) {
    handleApiError(error, 'Load Dept Tree');
  }
}

// Load roles
async function loadRoles() {
  try {
    const res = await getRoleList({ page: 1, pageSize: 100 });
    roleOptions.value = res.items.map((item) => ({
      label: item.name,
      value: item.value,
    }));
  } catch (error) {
    handleApiError(error, 'Load Roles');
  }
}

onMounted(() => {
  loadDeptTree();
  loadRoles();
});

const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    { type: 'seq', title: t('common.seq'), width: 60 },
    { field: 'username', title: t('sys.user.username'), width: 120 },
    { field: 'realName', title: t('sys.user.realName'), width: 120 },
    {
      field: 'roles',
      title: t('sys.role.roleName'),
      width: 150,
      formatter: ({ cellValue }) => {
        if (!cellValue || !Array.isArray(cellValue)) return '';
        // Map role values to names if possible, otherwise show value
        return cellValue
          .map((val) => {
            const role = roleOptions.value.find((r) => r.value === val);
            return role ? role.label : val;
          })
          .join(', ');
      },
    },
    { field: 'email', title: t('sys.user.email'), width: 180 },
    { field: 'phone', title: t('sys.user.phone'), width: 130 },
    { field: 'deptName', title: t('sys.user.deptName'), width: 120 },
    {
      field: 'status',
      title: t('common.status'),
      width: 80,
      slots: { default: 'status' },
    },
    { field: 'createTime', title: t('sys.user.createTime'), width: 160 },
    { field: 'remark', title: t('sys.user.remark'), minWidth: 150 },
    {
      title: t('common.action'),
      width: 150,
      fixed: 'right',
      cellRender: {
        name: 'CellOperation',
        props: {
          options: [
            ...(canEdit.value ? ['edit'] : []),
            ...(canEdit.value
              ? [
                  {
                    code: 'reset',
                    icon: 'ant-design:key-outlined',
                    label: '重置密码',
                  },
                ]
              : []),
            ...(canDelete.value ? ['delete'] : []),
          ],
          onClick: ({
            code,
            row,
          }: {
            code: string;
            row: SystemUserApi.User;
          }) => {
            if (code === 'edit') handleEdit(row);
            if (code === 'reset') handleResetPassword(row);
            if (code === 'delete') handleDelete(row);
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
        const res = await getUserList({
          page: page.currentPage,
          pageSize: page.pageSize,
        });
        return res;
      },
      queryAll: async ({ formValues }: any) => {
        const res = await getUserList({
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
  Object.assign(formState, {
    username: '',
    realName: '',
    email: '',
    phone: '',
    deptId: '',
    deptName: '',
    status: 1,
    remark: '',
    roles: [],
  });
  // We load roles in onMounted, but ensure it's fresh if needed or rely on mounted
  isModalVisible.value = true;
}

function handleEdit(row: SystemUserApi.User) {
  isEditMode.value = true;
  currentId.value = row.id;
  Object.assign(formState, {
    username: row.username,
    realName: row.realName,
    email: row.email || '',
    phone: row.phone || '',
    deptId: row.deptId || '',
    deptName: row.deptName || '',
    status: row.status,
    remark: row.remark || '',
    roles: row.roles || [], // Populate roles
  });
  isModalVisible.value = true;
}

function handleDeptChange(value: string) {
  formState.deptId = value;
  // Also update deptName for display purposes
  getDeptList().then((data) => {
    formState.deptName = findNameById(data as unknown as DeptTreeNode[], value);
  });
}

async function handleResetPassword(row: SystemUserApi.User) {
  Modal.confirm({
    title: '密码重置确认',
    content: `确定要将用户 "${row.realName || row.username}" 的密码重置为 "123456" 吗？`,
    onOk: async () => {
      try {
        await resetPassword(row.id);
        message.success('密码维护成功，已重置为 123456');
      } catch (error: any) {
        message.error(error.message || '重置密码失败');
      }
    },
  });
}

function handleDelete(row: SystemUserApi.User) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: `${t('common.confirmDeleteContent')} "${row.realName || row.username}" ?`,
    onOk: async () => {
      try {
        await deleteUser(row.id);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

async function handleSubmit() {
  if (!formState.username.trim() || !formState.realName.trim()) {
    message.warning(t('common.pleaseCompleteInfo'));
    return;
  }
  try {
    if (isEditMode.value && currentId.value) {
      await updateUser(currentId.value, formState);
      message.success(t('common.saveSuccess'));
    } else {
      await createUser(formState);
      message.success(t('common.createSuccess'));
    }
    isModalVisible.value = false;
    gridApi.reload();
  } catch {
    message.error(
      isEditMode.value ? t('common.saveFailed') : t('common.createFailed'),
    );
  }
}
</script>

<template>
  <Page>
    <Grid>
      <template #toolbar-actions>
        <Button v-if="canCreate" type="primary" @click="handleOpenModal">
          {{ t('sys.user.addUser') }}
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
      :title="isEditMode ? t('sys.user.editUser') : t('sys.user.addUser')"
      @ok="handleSubmit"
      width="600px"
    >
      <Form layout="vertical" class="pt-4">
        <div class="grid grid-cols-2 gap-4">
          <FormItem :label="t('sys.user.username')" required>
            <Input
              v-model:value="formState.username"
              :placeholder="`${t('common.pleaseInput')}${t('sys.user.username')}`"
              :disabled="isEditMode"
            />
          </FormItem>
          <FormItem :label="t('sys.user.realName')" required>
            <Input
              v-model:value="formState.realName"
              :placeholder="`${t('common.pleaseInput')}${t('sys.user.realName')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.user.email')">
            <Input
              v-model:value="formState.email"
              :placeholder="`${t('common.pleaseInput')}${t('sys.user.email')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.user.phone')">
            <Input
              v-model:value="formState.phone"
              :placeholder="`${t('common.pleaseInput')}${t('sys.user.phone')}`"
            />
          </FormItem>
          <FormItem :label="t('sys.user.deptName')">
            <TreeSelect
              :value="formState.deptId"
              :tree-data="deptTreeData"
              :placeholder="t('sys.user.selectDept')"
              tree-default-expand-all
              style="width: 100%"
              @change="handleDeptChange"
            />
          </FormItem>
          <FormItem :label="t('sys.role.roleName')">
            <Select
              v-model:value="formState.roles"
              mode="multiple"
              :options="roleOptions"
              :placeholder="t('common.pleaseSelect')"
              style="width: 100%"
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
        </div>
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
