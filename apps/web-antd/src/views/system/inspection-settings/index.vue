<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Alert, Card, message, Switch } from 'ant-design-vue';

import {
  getInspectionManualCreateSettingApi,
  updateInspectionManualCreateSettingApi,
} from '#/api/system/inspection-settings';

const { t } = useI18n();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();

const canEdit = computed(
  () =>
    hasAccessByCodes(['System:InspectionSettings:Edit']) ||
    hasAccessByRoles(['super', 'admin']),
);

const loading = ref(false);
const saving = ref(false);
const manualCreateEnabled = ref(true);

async function loadSetting() {
  loading.value = true;
  try {
    const data = await getInspectionManualCreateSettingApi();
    manualCreateEnabled.value = data.enabled;
  } catch {
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleToggle(checked: boolean) {
  const previous = !checked;
  saving.value = true;
  try {
    await updateInspectionManualCreateSettingApi({ enabled: checked });
    message.success(t('common.saveSuccess'));
  } catch {
    manualCreateEnabled.value = previous;
    message.error(t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadSetting();
});
</script>

<template>
  <Page>
    <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Alert
        v-if="!canEdit"
        :message="t('sys.inspectionSettings.noPermission')"
        type="warning"
        show-icon
      />

      <Card :title="t('sys.inspectionSettings.title')" :loading="loading">
        <div class="flex items-center gap-3">
          <Switch
            v-model:checked="manualCreateEnabled"
            :disabled="!canEdit || saving"
            :loading="saving"
            @change="(checked) => handleToggle(checked as boolean)"
          />
          <span>{{ t('sys.inspectionSettings.manualCreateLabel') }}</span>
        </div>
        <p class="mt-3 text-sm text-gray-500">
          {{ t('sys.inspectionSettings.manualCreateDesc') }}
        </p>
      </Card>
    </div>
  </Page>
</template>
