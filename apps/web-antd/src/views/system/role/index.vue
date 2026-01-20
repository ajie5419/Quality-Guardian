<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { SystemRoleApi } from '#/api/system/role';

import { computed, reactive, ref } from 'vue';

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
import { SYSTEM_API } from '#/api/system/constants';
import { SysStatusEnum } from '#/api/system/enums';
import { getRoleList } from '#/api/system/role';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

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
const allPermissions = [
  {
    title: '系统管理',
    key: 'System',
    children: [
      {
        title: '部门管理',
        key: 'System:Dept',
        children: [
          { title: '查看', key: 'System:Dept:List' },
          { title: '新增', key: 'System:Dept:Create' },
          { title: '编辑', key: 'System:Dept:Edit' },
          { title: '删除', key: 'System:Dept:Delete' },
        ],
      },
      {
        title: '角色管理',
        key: 'System:Role',
        children: [
          { title: '查看', key: 'System:Role:List' },
          { title: '新增', key: 'System:Role:Create' },
          { title: '编辑', key: 'System:Role:Edit' },
          { title: '删除', key: 'System:Role:Delete' },
        ],
      },
      {
        title: '菜单管理',
        key: 'System:Menu',
        children: [
          { title: '查看', key: 'System:Menu:List' },
          { title: '新增', key: 'System:Menu:Create' },
          { title: '编辑', key: 'System:Menu:Edit' },
          { title: '删除', key: 'System:Menu:Delete' },
        ],
      },
      {
        title: '用户管理',
        key: 'System:User',
        children: [
          { title: '查看', key: 'System:User:List' },
          { title: '新增', key: 'System:User:Create' },
          { title: '编辑', key: 'System:User:Edit' },
          { title: '删除', key: 'System:User:Delete' },
        ],
      },
      {
        title: 'AI 设置',
        key: 'System:AiSettings',
        children: [
          { title: '查看', key: 'System:AiSettings:View' },
          { title: '编辑', key: 'System:AiSettings:Edit' },
        ],
      },
    ],
  },
  {
    title: '质量管理(QMS)',
    key: 'QMS',
    children: [
      {
        title: '工作台',
        key: 'QMS:Workspace',
        children: [{ title: '查看', key: 'QMS:Workspace:View' }],
      },
      {
        title: '质量看板',
        key: 'QMS:Dashboard',
        children: [{ title: '查看', key: 'QMS:Dashboard:View' }],
      },
      {
        title: '工单管理',
        key: 'QMS:WorkOrder',
        children: [
          { title: '查看', key: 'QMS:WorkOrder:View' },
          { title: '新增', key: 'QMS:WorkOrder:Create' },
          { title: '编辑', key: 'QMS:WorkOrder:Edit' },
          { title: '删除', key: 'QMS:WorkOrder:Delete' },
        ],
      },
      {
        title: '质量策划',
        key: 'QMS:Planning',
        children: [
          {
            title: 'DFMEA',
            key: 'QMS:Planning:DFMEA',
            children: [
              { title: '查看', key: 'QMS:Planning:DFMEA:View' },
              { title: '新增', key: 'QMS:Planning:DFMEA:Create' },
              { title: '编辑', key: 'QMS:Planning:DFMEA:Edit' },
              { title: '删除', key: 'QMS:Planning:DFMEA:Delete' },
            ],
          },
          {
            title: '项目资料',
            key: 'QMS:Planning:ProjectDocs',
            children: [
              { title: '查看', key: 'QMS:Planning:ProjectDocs:View' },
              { title: '归档', key: 'QMS:Planning:ProjectDocs:Archive' },
            ],
          },
          {
            title: '项目 BOM',
            key: 'QMS:Planning:BOM',
            children: [
              { title: '查看', key: 'QMS:Planning:BOM:View' },
              { title: '新增', key: 'QMS:Planning:BOM:Create' },
              { title: '编辑', key: 'QMS:Planning:BOM:Edit' },
              { title: '删除', key: 'QMS:Planning:BOM:Delete' },
            ],
          },
          {
            title: '检验 ITP',
            key: 'QMS:Planning:ITP',
            children: [
              { title: '查看', key: 'QMS:Planning:ITP:View' },
              { title: '新增', key: 'QMS:Planning:ITP:Create' },
              { title: '编辑', key: 'QMS:Planning:ITP:Edit' },
              { title: '删除', key: 'QMS:Planning:ITP:Delete' },
            ],
          },
        ],
      },
      {
        title: '质检管理',
        key: 'QMS:Inspection',
        children: [
          {
            title: '质量问题',
            key: 'QMS:Inspection:Issues',
            children: [
              { title: '查看', key: 'QMS:Inspection:Issues:View' },
              { title: '新增', key: 'QMS:Inspection:Issues:Create' },
              { title: '编辑', key: 'QMS:Inspection:Issues:Edit' },
              { title: '删除', key: 'QMS:Inspection:Issues:Delete' },
              { title: '沉淀案例', key: 'QMS:Inspection:Issues:Settle' },
            ],
          },
          {
            title: '检验记录',
            key: 'QMS:Inspection:Records',
            children: [
              { title: '查看', key: 'QMS:Inspection:Records:View' },
              { title: '新增', key: 'QMS:Inspection:Records:Create' },
              { title: '编辑', key: 'QMS:Inspection:Records:Edit' },
              { title: '删除', key: 'QMS:Inspection:Records:Delete' },
            ],
          },
        ],
      },
      {
        title: '售后管理',
        key: 'QMS:AfterSales',
        children: [
          { title: '查看', key: 'QMS:AfterSales:View' },
          { title: '新增', key: 'QMS:AfterSales:Create' },
          { title: '编辑', key: 'QMS:AfterSales:Edit' },
          { title: '删除', key: 'QMS:AfterSales:Delete' },
          { title: '沉淀案例', key: 'QMS:AfterSales:Settle' },
        ],
      },
      {
        title: '供应商管理',
        key: 'QMS:Supplier',
        children: [
          { title: '查看', key: 'QMS:Supplier:View' },
          { title: '新增', key: 'QMS:Supplier:Create' },
          { title: '编辑', key: 'QMS:Supplier:Edit' },
          { title: '删除', key: 'QMS:Supplier:Delete' },
        ],
      },
      {
        title: '外协管理',
        key: 'QMS:Outsourcing',
        children: [
          { title: '查看', key: 'QMS:Outsourcing:View' },
          { title: '新增', key: 'QMS:Outsourcing:Create' },
          { title: '编辑', key: 'QMS:Outsourcing:Edit' },
          { title: '删除', key: 'QMS:Outsourcing:Delete' },
        ],
      },
      {
        title: '报表分析',
        key: 'QMS:Reports',
        children: [
          { title: '日报查看', key: 'QMS:Reports:Daily:View' },
          { title: '周月报查看', key: 'QMS:Reports:Summary:View' },
          { title: '导出', key: 'QMS:Reports:Export' },
        ],
      },
      {
        title: '质量损失分析',
        key: 'QMS:LossAnalysis',
        children: [
          { title: '查看', key: 'QMS:LossAnalysis:View' },
          { title: '新增', key: 'QMS:LossAnalysis:Create' },
          { title: '编辑', key: 'QMS:LossAnalysis:Edit' },
          { title: '删除', key: 'QMS:LossAnalysis:Delete' },
        ],
      },
      {
        title: '知识库',
        key: 'QMS:Knowledge',
        children: [
          { title: '查看', key: 'QMS:Knowledge:View' },
          { title: '新增', key: 'QMS:Knowledge:Create' },
          { title: '编辑', key: 'QMS:Knowledge:Edit' },
          { title: '删除', key: 'QMS:Knowledge:Delete' },
        ],
      },
    ],
  },
];

const checkedKeys = ref<string[]>([]);
const expandedKeys = ref<string[]>(['System', 'QMS']);

const gridOptions: VxeGridProps = {
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
    { title: t('common.action'), width: 250, fixed: 'right', slots: { default: 'action' } },
  ],
  toolbarConfig: {
    export: true,
    slots: {
      buttons: 'toolbar-actions'
    }
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
      queryAll: async ({ formValues }) => {
        const res = await getRoleList({
          page: 1,
          pageSize: 100000,
          ...formValues,
        });
        return { items: res.items || [] };
      },
    },
  },
};

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions });

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
        <span v-if="row.status === SysStatusEnum.ENABLED" class="text-green-500">{{ t('common.enabled') }}</span>
        <span v-else class="text-red-500">{{ t('common.disabled') }}</span>
      </template>
      <template #action="{ row }">
        <a
          v-if="canEdit"
          class="mr-2 text-blue-500"
          @click="handlePermissions(row)"
          >{{ t('sys.role.permSettings') }}</a
        >
        <a v-if="canEdit" class="mr-2" @click="handleEdit(row)">{{ t('common.edit') }}</a>
        <a v-if="canDelete" class="text-red-500" @click="handleDelete(row)"
          >{{ t('common.delete') }}</a
        >
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
          <Input v-model:value="formState.name" :placeholder="`${t('common.pleaseInput')}${t('sys.role.roleName')}`" />
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
            <SelectOption :value="SysStatusEnum.ENABLED">{{ t('common.enabled') }}</SelectOption>
            <SelectOption :value="SysStatusEnum.DISABLED">{{ t('common.disabled') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="t('sys.user.remark')">
          <Input v-model:value="formState.remark" :placeholder="t('sys.user.remarkPlaceholder')" />
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
