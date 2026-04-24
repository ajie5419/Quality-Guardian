<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useI18n } from '@vben/locales';

import MetrologyBorrowEntryPanel from '../components/MetrologyBorrowEntryPanel.vue';

defineOptions({ name: 'MetrologyBorrowEntryPage' });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const initialKeyword = computed(() => String(route.query.keyword || '').trim());
const publicToken = computed(() => String(route.query.token || '').trim());

function handleSuccess() {
  const nextQuery = { ...route.query };
  delete nextQuery.keyword;
  void router.replace({ path: route.path, query: nextQuery });
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 px-3 py-4 sm:px-6 sm:py-8">
    <div class="mx-auto flex max-w-4xl flex-col gap-4">
      <header class="rounded-lg bg-white px-5 py-4 shadow-sm">
        <h1 class="text-xl font-semibold text-gray-900">
          {{ t('qms.metrology.borrow.entryTitle') }}
        </h1>
      </header>

      <main class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <MetrologyBorrowEntryPanel
          :initial-keyword="initialKeyword"
          :public-mode="true"
          :public-token="publicToken"
          @success="handleSuccess"
        />
      </main>
    </div>
  </div>
</template>
