<script lang="ts" setup>
import type { InspectionSettingsApi } from '#/api/system/inspection-settings';
import type { PassRateProjectionApi } from '#/api/system/pass-rate-projection';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tooltip,
} from 'ant-design-vue';

import {
  createInspectionProcessApi,
  deleteInspectionProcessApi,
  getInspectionManualCreateSettingApi,
  getInspectionProcessesApi,
  getPublicIncomingMaterialInputSettingApi,
  updateIncomingMaterialInputSettingApi,
  updateInspectionManualCreateSettingApi,
  updateInspectionProcessApi,
  updateInspectionProcessSelectionApi,
} from '#/api/system/inspection-settings';
import {
  getPassRateProjectionStatusApi,
  rebuildPassRateProjectionApi,
  updatePassRateProjectionEnabledApi,
} from '#/api/system/pass-rate-projection';

type ProcessCategory = InspectionSettingsApi.ProcessCategory;
type ProcessItem = InspectionSettingsApi.ProcessItem;

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

const canEdit = computed(
  () =>
    hasAccessByCodes(['System:InspectionSettings:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);

const loading = ref(false);
const savingManualSetting = ref(false);
const savingMaterialInputSetting = ref(false);
const savingSelection = ref(false);
const savingProcess = ref(false);
const savingProjection = ref(false);
const rebuildingProjection = ref(false);
const manualCreateEnabled = ref(true);
const incomingMaterialFreeInputEnabled = ref(false);
const processRows = ref<ProcessItem[]>([]);
const processProcessIds = ref(new Set<string>());
const incomingProcessIds = ref(new Set<string>());
const selectionDirty = ref(false);
const processModalOpen = ref(false);
const projectionStatus = ref<null | PassRateProjectionApi.Status>(null);
const editingProcessId = ref<null | string>(null);
const processDraft = reactive<{
  categories: ProcessCategory[];
  code: string;
  name: string;
  sort: number;
  status: 0 | 1;
}>({ categories: [], code: '', name: '', sort: 0, status: 1 });

const columns = computed(() => [
  { key: 'name', title: t('sys.inspectionSettings.processName') },
  {
    dataIndex: 'code',
    key: 'code',
    title: t('sys.inspectionSettings.processCode'),
    width: 150,
  },
  {
    dataIndex: 'sort',
    key: 'sort',
    title: t('sys.inspectionSettings.sort'),
    width: 90,
  },
  {
    key: 'status',
    title: t('sys.inspectionSettings.enabled'),
    width: 90,
  },
  {
    key: 'process',
    title: t('sys.inspectionSettings.processInspection'),
    width: 120,
  },
  {
    key: 'incoming',
    title: t('sys.inspectionSettings.incomingInspection'),
    width: 120,
  },
  {
    key: 'actions',
    title: t('common.action'),
    width: 110,
  },
]);

async function loadSettings() {
  loading.value = true;
  try {
    const [manualSetting, materialInputSetting, processes, rollout] =
      await Promise.all([
        getInspectionManualCreateSettingApi(),
        getPublicIncomingMaterialInputSettingApi(),
        getInspectionProcessesApi(),
        canEdit.value
          ? getPassRateProjectionStatusApi()
          : Promise.resolve(null),
      ]);
    manualCreateEnabled.value = manualSetting.enabled;
    incomingMaterialFreeInputEnabled.value =
      materialInputSetting.incomingMaterialFreeInputEnabled;
    processRows.value = processes;
    processProcessIds.value = new Set(
      processes
        .filter((item) => item.categories.includes('PROCESS'))
        .map((item) => item.id),
    );
    incomingProcessIds.value = new Set(
      processes
        .filter((item) => item.categories.includes('INCOMING'))
        .map((item) => item.id),
    );
    selectionDirty.value = false;
    projectionStatus.value = rollout;
  } catch {
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function formatProjectionDate(value: Date | null | string | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('zh-CN');
}

function handleProjectionToggle(checked: boolean) {
  Modal.confirm({
    content: checked
      ? t('sys.inspectionSettings.projectionEnableConfirm')
      : t('sys.inspectionSettings.projectionDisableConfirm'),
    okText: checked
      ? t('sys.inspectionSettings.enableProjection')
      : t('sys.inspectionSettings.disableProjection'),
    title: checked
      ? t('sys.inspectionSettings.enableProjectionTitle')
      : t('sys.inspectionSettings.disableProjectionTitle'),
    async onOk() {
      savingProjection.value = true;
      try {
        projectionStatus.value = await updatePassRateProjectionEnabledApi({
          enabled: checked,
        });
        message.success(
          t(
            checked
              ? 'sys.inspectionSettings.projectionEnabled'
              : 'sys.inspectionSettings.projectionDisabled',
          ),
        );
      } catch {
        message.error(
          t(
            checked
              ? 'sys.inspectionSettings.projectionEnableFailed'
              : 'sys.inspectionSettings.projectionDisableFailed',
          ),
        );
      } finally {
        savingProjection.value = false;
      }
    },
  });
}

function requestProjectionRebuild() {
  Modal.confirm({
    content: t('sys.inspectionSettings.projectionRebuildConfirm'),
    okText: t('sys.inspectionSettings.queueRebuild'),
    title: t('sys.inspectionSettings.rebuildProjectionTitle'),
    async onOk() {
      rebuildingProjection.value = true;
      try {
        await rebuildPassRateProjectionApi({
          reason: 'Administrator requested retry',
        });
        message.success(t('sys.inspectionSettings.projectionRebuildQueued'));
        projectionStatus.value = await getPassRateProjectionStatusApi();
      } catch {
        message.error(t('sys.inspectionSettings.projectionRebuildQueueFailed'));
      } finally {
        rebuildingProjection.value = false;
      }
    },
  });
}

async function handleManualToggle(checked: boolean) {
  const previous = !checked;
  savingManualSetting.value = true;
  try {
    await updateInspectionManualCreateSettingApi({ enabled: checked });
    message.success(t('common.saveSuccess'));
  } catch {
    manualCreateEnabled.value = previous;
    message.error(t('common.saveFailed'));
  } finally {
    savingManualSetting.value = false;
  }
}

async function handleMaterialInputToggle(checked: boolean) {
  const previous = !checked;
  savingMaterialInputSetting.value = true;
  try {
    await updateIncomingMaterialInputSettingApi({ enabled: checked });
    message.success(t('common.saveSuccess'));
  } catch {
    incomingMaterialFreeInputEnabled.value = previous;
    message.error(t('common.saveFailed'));
  } finally {
    savingMaterialInputSetting.value = false;
  }
}

function isCategoryEnabled(id: string, category: ProcessCategory) {
  return (
    category === 'PROCESS' ? processProcessIds.value : incomingProcessIds.value
  ).has(id);
}

function handleCategoryToggle(
  id: string,
  category: ProcessCategory,
  checked: boolean,
) {
  const source =
    category === 'PROCESS' ? processProcessIds.value : incomingProcessIds.value;
  const next = new Set(source);
  if (checked) next.add(id);
  else next.delete(id);
  if (category === 'PROCESS') processProcessIds.value = next;
  else incomingProcessIds.value = next;
  selectionDirty.value = true;
}

async function saveSelections() {
  savingSelection.value = true;
  try {
    await updateInspectionProcessSelectionApi({
      incomingProcessIds: [...incomingProcessIds.value],
      processProcessIds: [...processProcessIds.value],
    });
    selectionDirty.value = false;
    message.success(t('common.saveSuccess'));
  } catch {
    message.error(t('common.saveFailed'));
  } finally {
    savingSelection.value = false;
  }
}

function openCreateModal() {
  editingProcessId.value = null;
  Object.assign(processDraft, {
    categories: [],
    code: '',
    name: '',
    sort: processRows.value.length,
    status: 1,
  });
  processModalOpen.value = true;
}

function openEditModal(item: ProcessItem) {
  editingProcessId.value = item.id;
  Object.assign(processDraft, {
    categories: [...item.categories],
    code: item.code || '',
    name: item.name,
    sort: item.sort,
    status: item.status === 1 ? 1 : 0,
  });
  processModalOpen.value = true;
}

function openEditRecord(record: Record<string, unknown>) {
  const item = processRows.value.find((row) => row.id === record.id);
  if (item) openEditModal(item);
}

async function saveProcess() {
  const name = processDraft.name.trim();
  if (!name) {
    message.warning(t('sys.inspectionSettings.processNameRequired'));
    return;
  }
  savingProcess.value = true;
  try {
    await (editingProcessId.value
      ? updateInspectionProcessApi(editingProcessId.value, {
          code: processDraft.code.trim() || null,
          name,
          sort: processDraft.sort,
          status: processDraft.status,
        })
      : createInspectionProcessApi({
          categories: processDraft.categories,
          code: processDraft.code.trim() || null,
          name,
          sort: processDraft.sort,
        }));
    processModalOpen.value = false;
    await loadSettings();
    message.success(t('common.saveSuccess'));
  } catch {
    message.error(t('common.saveFailed'));
  } finally {
    savingProcess.value = false;
  }
}

async function toggleProcessStatus(item: ProcessItem, checked: boolean) {
  try {
    await updateInspectionProcessApi(item.id, { status: checked ? 1 : 0 });
    item.status = checked ? 1 : 0;
  } catch {
    message.error(t('common.saveFailed'));
  }
}

async function toggleProcessRecordStatus(
  record: Record<string, unknown>,
  checked: boolean,
) {
  const item = processRows.value.find((row) => row.id === record.id);
  if (item) await toggleProcessStatus(item, checked);
}

async function removeProcess(id: string) {
  try {
    await deleteInspectionProcessApi(id);
    await loadSettings();
    message.success(t('common.deleteSuccess'));
  } catch {
    message.error(t('common.deleteFailed'));
  }
}

onMounted(loadSettings);
</script>

<template>
  <Page>
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 md:p-6">
      <Alert
        v-if="!canEdit"
        :message="t('sys.inspectionSettings.noPermission')"
        type="warning"
        show-icon
      />

      <section class="border-border border-b pb-6">
        <h2 class="mb-4 text-base font-semibold">
          {{ t('sys.inspectionSettings.recordSettings') }}
        </h2>
        <div class="flex items-center justify-between gap-4">
          <span>{{ t('sys.inspectionSettings.manualCreateLabel') }}</span>
          <Switch
            v-model:checked="manualCreateEnabled"
            :disabled="!canEdit || savingManualSetting"
            :loading="savingManualSetting"
            @change="(checked) => handleManualToggle(checked as boolean)"
          />
        </div>
      </section>

      <section v-if="canEdit" class="border-border border-b pb-6">
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-base font-semibold">
              {{ t('sys.inspectionSettings.projectionRollout') }}
            </h2>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ t('sys.inspectionSettings.projectionRolloutDesc') }}
            </p>
          </div>
          <Space>
            <Button
              :loading="rebuildingProjection"
              @click="requestProjectionRebuild"
            >
              {{ t('sys.inspectionSettings.rebuild') }}
            </Button>
            <Switch
              :checked="projectionStatus?.enabled ?? false"
              :disabled="
                savingProjection ||
                (!projectionStatus?.rolloutReady && !projectionStatus?.enabled)
              "
              :loading="savingProjection"
              @change="(checked) => handleProjectionToggle(checked as boolean)"
            />
          </Space>
        </div>
        <Alert
          v-if="projectionStatus && !projectionStatus.rolloutReady"
          :message="t('sys.inspectionSettings.projectionBlocked')"
          type="warning"
          show-icon
        />
        <div
          v-if="projectionStatus"
          class="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2"
        >
          <div>
            {{ t('sys.inspectionSettings.activeGeneration') }}：
            {{ projectionStatus.activeGeneration?.id || '—' }}
          </div>
          <div>
            {{ t('sys.inspectionSettings.activatedAt') }}：
            {{
              formatProjectionDate(
                projectionStatus.activeGeneration?.activatedAt,
              )
            }}
          </div>
          <div>
            {{ t('sys.inspectionSettings.fresh') }}：
            {{
              projectionStatus.freshness?.isFresh
                ? t('sys.inspectionSettings.yes')
                : t('sys.inspectionSettings.no')
            }}
          </div>
          <div>
            {{ t('sys.inspectionSettings.baselineMatched') }}：
            {{
              projectionStatus.baselineMatch
                ? t('sys.inspectionSettings.yes')
                : t('sys.inspectionSettings.no')
            }}
          </div>
          <div>
            {{ t('sys.inspectionSettings.latestShadow') }}：
            {{
              formatProjectionDate(projectionStatus.latestShadow?.completedAt)
            }}
          </div>
          <div>
            {{ t('sys.inspectionSettings.shadowDifferences') }}：
            {{ t('sys.inspectionSettings.total') }}
            {{
              projectionStatus.latestShadow?.coreDifferences.TOTAL_COUNT ?? '—'
            }}，{{ t('sys.inspectionSettings.pass') }}
            {{
              projectionStatus.latestShadow?.coreDifferences.PASS_COUNT ?? '—'
            }}，{{ t('sys.inspectionSettings.rate') }}
            {{
              projectionStatus.latestShadow?.coreDifferences.PASS_RATE ?? '—'
            }}
          </div>
        </div>
      </section>

      <section class="border-border border-b pb-6">
        <h2 class="mb-4 text-base font-semibold">
          {{ t('sys.inspectionSettings.requestSettings') }}
        </h2>
        <div class="flex items-center justify-between gap-4">
          <span>{{
            t('sys.inspectionSettings.incomingMaterialFreeInputLabel')
          }}</span>
          <Switch
            v-model:checked="incomingMaterialFreeInputEnabled"
            :disabled="!canEdit || savingMaterialInputSetting"
            :loading="savingMaterialInputSetting"
            @change="(checked) => handleMaterialInputToggle(checked as boolean)"
          />
        </div>
      </section>

      <section>
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold">
            {{ t('sys.inspectionSettings.processSettings') }}
          </h2>
          <Space>
            <Tooltip :title="t('common.refresh')">
              <Button :disabled="loading" shape="circle" @click="loadSettings">
                <IconifyIcon class="size-4" icon="lucide:refresh-cw" />
              </Button>
            </Tooltip>
            <Tooltip :title="t('sys.inspectionSettings.addProcess')">
              <Button
                :disabled="!canEdit"
                shape="circle"
                @click="openCreateModal"
              >
                <IconifyIcon class="size-4" icon="lucide:plus" />
              </Button>
            </Tooltip>
            <Tooltip :title="t('common.save')">
              <Button
                type="primary"
                shape="circle"
                :disabled="!canEdit || !selectionDirty"
                :loading="savingSelection"
                @click="saveSelections"
              >
                <IconifyIcon class="size-4" icon="lucide:save" />
              </Button>
            </Tooltip>
          </Space>
        </div>

        <Table
          :columns="columns"
          :data-source="processRows"
          :loading="loading"
          :pagination="false"
          :scroll="{ x: 820 }"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <span class="font-medium">{{ record.name }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <Switch
                :checked="record.status === 1"
                :disabled="!canEdit"
                size="small"
                @change="
                  (checked) =>
                    toggleProcessRecordStatus(record, checked as boolean)
                "
              />
            </template>
            <template v-else-if="column.key === 'process'">
              <Switch
                :checked="isCategoryEnabled(record.id, 'PROCESS')"
                :disabled="!canEdit || record.status !== 1"
                size="small"
                @change="
                  (checked) =>
                    handleCategoryToggle(
                      record.id,
                      'PROCESS',
                      checked as boolean,
                    )
                "
              />
            </template>
            <template v-else-if="column.key === 'incoming'">
              <Switch
                :checked="isCategoryEnabled(record.id, 'INCOMING')"
                :disabled="!canEdit || record.status !== 1"
                size="small"
                @change="
                  (checked) =>
                    handleCategoryToggle(
                      record.id,
                      'INCOMING',
                      checked as boolean,
                    )
                "
              />
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space :size="4">
                <Tooltip :title="t('common.edit')">
                  <Button
                    :disabled="!canEdit"
                    shape="circle"
                    type="text"
                    @click="openEditRecord(record)"
                  >
                    <IconifyIcon class="size-4" icon="lucide:pencil" />
                  </Button>
                </Tooltip>
                <Popconfirm
                  :title="t('common.confirmDelete')"
                  @confirm="removeProcess(record.id)"
                >
                  <Tooltip :title="t('common.delete')">
                    <Button
                      danger
                      :disabled="!canEdit"
                      shape="circle"
                      type="text"
                    >
                      <IconifyIcon class="size-4" icon="lucide:trash-2" />
                    </Button>
                  </Tooltip>
                </Popconfirm>
              </Space>
            </template>
          </template>
        </Table>
      </section>
    </div>

    <Modal
      v-model:open="processModalOpen"
      :confirm-loading="savingProcess"
      :title="
        editingProcessId
          ? t('sys.inspectionSettings.editProcess')
          : t('sys.inspectionSettings.addProcess')
      "
      @ok="saveProcess"
    >
      <Form layout="vertical">
        <Form.Item :label="t('sys.inspectionSettings.processName')" required>
          <Input v-model:value="processDraft.name" :maxlength="191" />
        </Form.Item>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Form.Item :label="t('sys.inspectionSettings.processCode')">
            <Input v-model:value="processDraft.code" :maxlength="191" />
          </Form.Item>
          <Form.Item :label="t('sys.inspectionSettings.sort')">
            <InputNumber
              v-model:value="processDraft.sort"
              :min="0"
              :max="9999"
              class="w-full"
            />
          </Form.Item>
        </div>
        <Form.Item
          v-if="!editingProcessId"
          :label="t('sys.inspectionSettings.visibleIn')"
        >
          <Checkbox.Group v-model:value="processDraft.categories">
            <Space>
              <Checkbox value="PROCESS">
                {{ t('sys.inspectionSettings.processInspection') }}
              </Checkbox>
              <Checkbox value="INCOMING">
                {{ t('sys.inspectionSettings.incomingInspection') }}
              </Checkbox>
            </Space>
          </Checkbox.Group>
        </Form.Item>
        <Form.Item v-else :label="t('sys.inspectionSettings.enabled')">
          <Switch
            :checked="processDraft.status === 1"
            @change="(checked) => (processDraft.status = checked ? 1 : 0)"
          />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
