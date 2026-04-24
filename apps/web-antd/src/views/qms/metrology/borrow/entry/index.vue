<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button } from 'ant-design-vue';

import MetrologyBorrowEntryPanel from '../components/MetrologyBorrowEntryPanel.vue';

defineOptions({ name: 'MetrologyBorrowEntryPage' });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const initialKeyword = computed(() => String(route.query.keyword || '').trim());

function backToList() {
  void router.push('/qms/metrology/borrow');
}

function handleSuccess() {
  const nextQuery = { ...route.query };
  delete nextQuery.keyword;
  void router.replace({ path: route.path, query: nextQuery });
}
</script>

<template>
  <Page :title="t('qms.metrology.borrow.entryTitle')">
    <div class="m-4 flex flex-col gap-4">
      <div class="flex justify-end">
        <Button @click="backToList">
          {{ t('common.back') }}
        </Button>
      </div>

      <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <MetrologyBorrowEntryPanel
          :initial-keyword="initialKeyword"
          @success="handleSuccess"
        />
      </div>
    </div>
  </Page>
</template>
