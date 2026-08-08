<script lang="ts" setup>
import type { SupplierIdentityApi } from '#/api/system/supplier-identity';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Form,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tooltip,
} from 'ant-design-vue';

import {
  createSupplierIdentityLinkApi,
  deleteSupplierIdentityLinkApi,
  getSupplierIdentityLinksApi,
  getSupplierIdentityManagementOptionsApi,
  updateSupplierIdentityLinkApi,
} from '#/api/system/supplier-identity';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { validateSupplierIdentityDraft } from './supplier-identity-form';
import {
  canManageSupplierIdentity,
  canViewSupplierIdentity,
} from './supplier-identity-permissions';

defineOptions({ name: 'SystemSupplierIdentityLinks' });

type Link = SupplierIdentityApi.Link;
type SelectOption = { label: string; value: string };

const accessStore = useAccessStore();
const { handleApiError } = useErrorHandler();
const userStore = useUserStore();
const canView = computed(() =>
  canViewSupplierIdentity(accessStore.accessCodes, userStore.userInfo),
);
const canEdit = computed(() =>
  canManageSupplierIdentity(accessStore.accessCodes, userStore.userInfo),
);
const canManage = computed(() => canEdit.value);

const links = ref<Link[]>([]);
const loading = ref(false);
const loadError = ref('');
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const formOpen = ref(false);
const saving = ref(false);
const deletingIds = ref(new Set<string>());
const editingLink = ref<Link | null>(null);
const teamOptions = ref<SelectOption[]>([]);
const supplierOptions = ref<SelectOption[]>([]);
const supplierOptionsLoading = ref(false);
const teamOptionsLoading = ref(false);
const formErrors = reactive<{ supplierId?: string; teamId?: string }>({});
const draft = reactive({ supplierId: '', teamId: '' });

let supplierSearchToken = 0;
let teamSearchToken = 0;

const columns = [
  { dataIndex: 'identityNameSnapshot', key: 'team', title: 'TEAM' },
  { dataIndex: ['supplier', 'name'], key: 'supplier', title: 'Supplier' },
  { key: 'updatedAt', title: 'Last updated', width: 210 },
  { key: 'actions', title: 'Actions', width: 160 },
];

function addOption(options: SelectOption[], option: SelectOption) {
  return options.some((item) => item.value === option.value)
    ? options
    : [option, ...options];
}

function resetFormErrors() {
  formErrors.supplierId = undefined;
  formErrors.teamId = undefined;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('en-US');
}

async function loadLinks() {
  if (!canView.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getSupplierIdentityLinksApi(pagination);
    links.value = result.items;
    total.value = result.total;
  } catch (error: unknown) {
    links.value = [];
    total.value = 0;
    loadError.value = 'Unable to load supplier identity mappings.';
    handleApiError(error, 'Load Supplier Identity Mappings');
  } finally {
    loading.value = false;
  }
}

async function loadTeamOptions(keyword = '') {
  const token = ++teamSearchToken;
  teamOptionsLoading.value = true;
  try {
    const options = await getSupplierIdentityManagementOptionsApi({
      keyword: keyword.trim() || undefined,
    });
    if (token !== teamSearchToken) return;
    teamOptions.value = options.teams;
  } catch (error: unknown) {
    if (token === teamSearchToken) {
      teamOptions.value = [];
      handleApiError(error, 'Load TEAM Options');
    }
  } finally {
    if (token === teamSearchToken) teamOptionsLoading.value = false;
  }
}

async function loadSupplierOptions(keyword = '') {
  const token = ++supplierSearchToken;
  supplierOptionsLoading.value = true;
  try {
    const result = await getSupplierIdentityManagementOptionsApi({
      keyword: keyword.trim() || undefined,
    });
    if (token !== supplierSearchToken) return;
    supplierOptions.value = result.suppliers;
  } catch (error: unknown) {
    if (token === supplierSearchToken) {
      supplierOptions.value = [];
      handleApiError(error, 'Load Supplier Options');
    }
  } finally {
    if (token === supplierSearchToken) supplierOptionsLoading.value = false;
  }
}

async function openForm(link: Link | null = null) {
  editingLink.value = link;
  resetFormErrors();
  Object.assign(draft, {
    supplierId: link?.supplierId || '',
    teamId: link?.identityId || '',
  });
  if (link) {
    teamOptions.value = addOption(teamOptions.value, {
      label: link.identityNameSnapshot,
      value: link.identityId,
    });
    supplierOptions.value = addOption(supplierOptions.value, {
      label: link.supplier.name,
      value: link.supplierId,
    });
  }
  formOpen.value = true;
  await Promise.all([loadTeamOptions(), loadSupplierOptions()]);
  if (link) {
    teamOptions.value = addOption(teamOptions.value, {
      label: link.identityNameSnapshot,
      value: link.identityId,
    });
    supplierOptions.value = addOption(supplierOptions.value, {
      label: link.supplier.name,
      value: link.supplierId,
    });
  }
}

async function save() {
  const validation = validateSupplierIdentityDraft(draft);
  Object.assign(formErrors, validation.errors);
  if (!validation.value) return;

  saving.value = true;
  try {
    if (editingLink.value) {
      await updateSupplierIdentityLinkApi(
        editingLink.value.id,
        validation.value,
      );
      message.success('Mapping updated.');
    } else {
      await createSupplierIdentityLinkApi(validation.value);
      message.success('Mapping created.');
    }
    formOpen.value = false;
    await loadLinks();
  } catch (error: unknown) {
    handleApiError(error, 'Save Supplier Identity Mapping');
  } finally {
    saving.value = false;
  }
}

async function remove(link: Link) {
  const nextDeleting = new Set(deletingIds.value);
  nextDeleting.add(link.id);
  deletingIds.value = nextDeleting;
  try {
    await deleteSupplierIdentityLinkApi(link.id);
    if (links.value.length === 1 && pagination.page > 1) {
      pagination.page -= 1;
    }
    await loadLinks();
    message.success('Mapping deleted.');
  } catch (error: unknown) {
    handleApiError(error, 'Delete Supplier Identity Mapping');
  } finally {
    const remaining = new Set(deletingIds.value);
    remaining.delete(link.id);
    deletingIds.value = remaining;
  }
}

function openFormById(id: unknown) {
  const link = links.value.find((item) => item.id === String(id || ''));
  if (link) void openForm(link);
}

function removeById(id: unknown) {
  const link = links.value.find((item) => item.id === String(id || ''));
  if (link) void remove(link);
}

function handleTableChange(next: { current?: number; pageSize?: number }) {
  pagination.page = next.current || 1;
  pagination.pageSize = next.pageSize || 20;
  void loadLinks();
}

onMounted(() => {
  if (canView.value) void loadLinks();
});
</script>

<template>
  <Page title="Supplier Identity Mappings">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <Alert
        message="TEAM-to-supplier mappings are used to resolve external inspection ownership."
        show-icon
        type="info"
      />
      <Alert
        v-if="!canView"
        message="Supplier identity mappings are restricted to system administrators."
        show-icon
        type="error"
      />
      <Alert
        v-else-if="!canManage"
        message="Your account can view mappings but cannot modify them."
        show-icon
        type="warning"
      />
      <Alert v-if="loadError" :message="loadError" show-icon type="error">
        <template #action>
          <Button size="small" @click="loadLinks">Retry</Button>
        </template>
      </Alert>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">Active mappings</h2>
          <p class="text-muted-foreground mt-1 text-sm">
            Each active TEAM can be linked to one supplier.
          </p>
        </div>
        <Space>
          <Tooltip title="Refresh">
            <Button :disabled="loading" shape="circle" @click="loadLinks">
              <IconifyIcon class="size-4" icon="lucide:refresh-cw" />
            </Button>
          </Tooltip>
          <Button :disabled="!canManage" type="primary" @click="openForm()">
            Create mapping
          </Button>
        </Space>
      </div>

      <Table
        :columns="columns"
        :data-source="links"
        :loading="loading"
        :locale="{ emptyText: 'No supplier identity mappings found.' }"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          total,
        }"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'updatedAt'">
            {{ formatDate(record.updatedAt) }}
          </template>
          <Space v-else-if="column.key === 'actions'">
            <Button
              :disabled="!canManage"
              size="small"
              type="link"
              @click="openFormById(record.id)"
            >
              Edit
            </Button>
            <Popconfirm
              cancel-text="Cancel"
              ok-text="Delete"
              title="Delete this TEAM-to-supplier mapping?"
              @confirm="removeById(record.id)"
            >
              <Button
                :disabled="!canManage"
                :loading="deletingIds.has(record.id)"
                danger
                size="small"
                type="link"
              >
                Delete
              </Button>
            </Popconfirm>
          </Space>
        </template>
      </Table>
    </div>

    <Modal
      v-model:open="formOpen"
      :confirm-loading="saving"
      :title="
        editingLink
          ? 'Edit supplier identity mapping'
          : 'Create supplier identity mapping'
      "
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item
          :help="formErrors.teamId"
          :validate-status="formErrors.teamId ? 'error' : undefined"
          label="TEAM"
          required
        >
          <Select
            v-model:value="draft.teamId"
            :filter-option="false"
            :loading="teamOptionsLoading"
            :options="teamOptions"
            placeholder="Search and select a TEAM"
            show-search
            @search="loadTeamOptions"
          />
        </Form.Item>
        <Form.Item
          :help="formErrors.supplierId"
          :validate-status="formErrors.supplierId ? 'error' : undefined"
          label="Supplier"
          required
        >
          <Select
            v-model:value="draft.supplierId"
            :filter-option="false"
            :loading="supplierOptionsLoading"
            :options="supplierOptions"
            placeholder="Search and select a supplier"
            show-search
            @search="loadSupplierOptions"
          />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
